import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JSONCodec, Subscription } from 'nats';
import { NATS_CONNECTION } from './nats.provider';
import { JobLogEntity } from '../entities/job-log.entity';

const SUBJECT = 'showcase.jobs.*';
const QUEUE_GROUP = 'showcase-workers';

interface JobMessage {
  kind?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NatsSubscriberService implements OnApplicationBootstrap {
  private readonly logger = new Logger('NatsSubscriber');
  private subscription: Subscription | null = null;

  constructor(
    @Inject(NATS_CONNECTION) private readonly holder: { connection: any },
    @InjectRepository(JobLogEntity)
    private readonly jobLog: Repository<JobLogEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.subscription) return;
    const nc = this.holder.connection;
    if (!nc) {
      throw new Error('NATS connection not established before subscriber bootstrap.');
    }
    const codec = JSONCodec<JobMessage>();
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
        try {
          await this.jobLog.insert({
            subject: msg.subject,
            payload: parsed?.payload ?? null,
            status: 'received',
          });
          this.logger.log(`Recorded job on ${msg.subject}`);
        } catch (err) {
          this.logger.error(
            `Failed to record job on ${msg.subject}: ${(err as Error).message}`,
          );
        }
      }
      this.logger.log('NATS subscription iterator ended.');
    })();
  }
}
