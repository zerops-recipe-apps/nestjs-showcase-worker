import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';

export const SEARCH_CLIENT = 'SEARCH_CLIENT';

class SearchClientHolder implements OnModuleInit {
  private readonly logger = new Logger('Search');
  client: MeiliSearch | null = null;

  async onModuleInit(): Promise<void> {
    const host = process.env.SEARCH_URL;
    const apiKey = process.env.SEARCH_MASTER_KEY;
    this.client = new MeiliSearch({ host, apiKey });
    try {
      await this.client.health();
      this.logger.log(`Connected to Meilisearch at ${host}`);
    } catch (err) {
      this.logger.warn(
        `Meilisearch health probe failed (${(err as Error).message}); client retained for retry.`,
      );
    }
  }
}

@Module({
  providers: [{ provide: SEARCH_CLIENT, useClass: SearchClientHolder }],
  exports: [SEARCH_CLIENT],
})
export class SearchModule {}
