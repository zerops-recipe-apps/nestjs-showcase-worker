import { Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

export const CACHE_CLIENT = 'CACHE_CLIENT';

class CacheClientHolder implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Cache');
  client: Redis | null = null;

  async onModuleInit(): Promise<void> {
    const host = process.env.CACHE_HOST;
    const port = parseInt(process.env.CACHE_PORT ?? '6379', 10);
    this.client = new Redis({
      host,
      port,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    this.client.on('error', (err) => {
      this.logger.error(`Valkey error: ${err.message}`);
    });
    await this.client.ping();
    this.logger.log(`Connected to Valkey at ${host}:${port}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.logger.log('Valkey client disconnected.');
    }
  }
}

@Module({
  providers: [{ provide: CACHE_CLIENT, useClass: CacheClientHolder }],
  exports: [CACHE_CLIENT],
})
export class CacheModule {}
