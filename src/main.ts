import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { NatsSubscriberService } from './nats/nats-subscriber.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: false,
  });

  app.enableShutdownHooks();

  const subscriber = app.get(NatsSubscriberService);
  await subscriber.onApplicationBootstrap();

  logger.log('Worker started — NATS subscriber active, awaiting jobs.');

  // Heartbeat marker so liveness can be confirmed from logs in
  // the absence of an HTTP /health endpoint.
  const heartbeat = setInterval(() => {
    logger.log('worker-heartbeat ok');
  }, 30_000);

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Received ${signal}, draining...`);
    clearInterval(heartbeat);
    try {
      await app.close();
    } catch (err) {
      logger.error(`Shutdown error: ${(err as Error).message}`);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker bootstrap failed:', err);
  process.exit(1);
});
