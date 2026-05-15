import { Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

export const STORAGE_CLIENT = 'STORAGE_CLIENT';
export const STORAGE_BUCKET = 'STORAGE_BUCKET';

class StorageClientHolder implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Storage');
  client: S3Client | null = null;
  bucket = '';

  async onModuleInit(): Promise<void> {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    this.bucket = process.env.S3_BUCKET ?? '';

    this.client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Connected to object-storage bucket ${this.bucket}`);
    } catch (err) {
      this.logger.warn(
        `Object-storage HeadBucket failed (${(err as Error).message}); client retained for retry.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.logger.log('Storage client destroyed.');
    }
  }
}

@Module({
  providers: [
    { provide: STORAGE_CLIENT, useClass: StorageClientHolder },
    { provide: STORAGE_BUCKET, useFactory: () => process.env.S3_BUCKET ?? '' },
  ],
  exports: [STORAGE_CLIENT, STORAGE_BUCKET],
})
export class StorageModule {}
