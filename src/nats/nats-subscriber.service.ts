import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JSONCodec, NatsConnection, Subscription } from 'nats';
import type Redis from 'ioredis';
import type { MeiliSearch } from 'meilisearch';
import { NATS_CONNECTION } from './nats.provider';
import { CACHE_CLIENT } from '../cache/cache.module';
import { SEARCH_CLIENT } from '../search/search.module';
import { JobLogEntity } from '../entities/job-log.entity';

const SUBJECT = 'showcase.jobs.*';
const QUEUE_GROUP = 'showcase-workers';

const EVENTS_KEY = 'showcase:queue:events';
const EVENTS_PROCESSED_KEY = 'showcase:queue:processed';
const EVENTS_MAX = 50;

const SEARCH_INDEX = 'jobs';

interface JobMessage {
  kind?: string;
  payload?: Record<string, unknown>;
  issuedAt?: string;
}

@Injectable()
export class NatsSubscriberService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('NatsSubscriber');
  private subscription: Subscription | null = null;
  private searchIndexReady = false;

  constructor(
    @Inject(NATS_CONNECTION)
    private readonly holder: { connection: NatsConnection | null },
    @InjectRepository(JobLogEntity)
    private readonly jobLog: Repository<JobLogEntity>,
    @Inject(CACHE_CLIENT) private readonly cache: { client: Redis | null },
    @Inject(SEARCH_CLIENT) private readonly search: { client: MeiliSearch | null },
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.subscription) return;
    const nc = this.holder.connection;
    if (!nc) {
      throw new Error('NATS connection not established before subscriber bootstrap.');
    }
    await this.ensureSearchIndex();
    const codec = JSONCodec<JobMessage>();
    // The queue option turns the subscription into a queue group:
    // replicas sharing the same group name share message delivery
    // (one message → one consumer) instead of fan-out. Required for
    // showcase tier 4+ multi-replica deploys.
    this.subscription = nc.subscribe(SUBJECT, { queue: QUEUE_GROUP });
    this.logger.log(`Subscribed to ${SUBJECT} (queue=${QUEUE_GROUP}).`);

    void (async () => {
      for await (const msg of this.subscription as Subscription) {
        let parsed: JobMessage = {};
        try {
          parsed = codec.decode(msg.data);
        } catch {
          parsed = {};
        }
        await this.handle(msg.subject, parsed);
      }
      this.logger.log('NATS subscription iterator ended.');
    })();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Subscriber shutdown signal: ${signal ?? 'unknown'}`);
    if (this.subscription) {
      try {
        // drain() lets in-flight messages finish before the iterator
        // closes. unsubscribe() would drop them — rolling deploys
        // would lose events on every replacement.
        await this.subscription.drain();
      } catch (err) {
        this.logger.warn(
          `Subscription drain failed: ${(err as Error).message}`,
        );
      }
      this.subscription = null;
    }
  }

  private async handle(subject: string, parsed: JobMessage): Promise<void> {
    const event = {
      subject,
      kind: parsed.kind ?? 'sample',
      payload: parsed.payload ?? null,
      receivedAt: new Date().toISOString(),
    };
    try {
      await this.jobLog.insert({
        subject,
        payload: parsed?.payload ?? null,
        status: 'received',
      });
    } catch (err) {
      this.logger.error(
        `Failed to write job_log row for ${subject}: ${(err as Error).message}`,
      );
    }
    try {
      const client = this.cache.client;
      if (client) {
        // LPUSH + LTRIM keeps newest-first ordering with a bounded
        // window. The API's /api/queue/state LRANGEs 0..N-1 to read
        // the freshest events.
        await client.lpush(EVENTS_KEY, JSON.stringify(event));
        await client.ltrim(EVENTS_KEY, 0, EVENTS_MAX - 1);
        await client.incr(EVENTS_PROCESSED_KEY);
      }
    } catch (err) {
      this.logger.warn(
        `Cache write failed for ${subject}: ${(err as Error).message}`,
      );
    }
    try {
      const meili = this.search.client;
      if (meili && this.searchIndexReady) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await meili.index(SEARCH_INDEX).addDocuments(
          [
            {
              id,
              subject,
              kind: event.kind,
              receivedAt: event.receivedAt,
              payload: JSON.stringify(event.payload ?? {}),
            },
          ],
          { primaryKey: 'id' },
        );
      }
    } catch (err) {
      this.logger.warn(
        `Search index write failed for ${subject}: ${(err as Error).message}`,
      );
    }
    this.logger.log(`Recorded job on ${subject}`);
  }

  private async ensureSearchIndex(): Promise<void> {
    const meili = this.search.client;
    if (!meili) return;
    try {
      await meili.getIndex(SEARCH_INDEX);
    } catch {
      try {
        await meili.createIndex(SEARCH_INDEX, { primaryKey: 'id' });
        await meili
          .index(SEARCH_INDEX)
          .updateSearchableAttributes(['subject', 'kind', 'payload']);
      } catch (err) {
        this.logger.warn(
          `Could not create jobs index: ${(err as Error).message}`,
        );
        return;
      }
    }
    this.searchIndexReady = true;
  }
}
