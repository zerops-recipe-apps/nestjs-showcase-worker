import { Logger, OnModuleDestroy, OnModuleInit, Provider } from '@nestjs/common';
import { connect, NatsConnection } from 'nats';

export const NATS_CONNECTION = 'NATS_CONNECTION';

class NatsConnectionHolder implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NatsConnection');
  connection: NatsConnection | null = null;

  async onModuleInit(): Promise<void> {
    const host = process.env.NATS_HOST;
    const port = process.env.NATS_PORT;
    const user = process.env.NATS_USER;
    const pass = process.env.NATS_PASS;
    this.connection = await connect({
      servers: `${host}:${port}`,
      user,
      pass,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2_000,
      name: 'nestjs-showcase-worker',
    });
    this.logger.log(`Connected to NATS at ${host}:${port}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.drain();
      this.logger.log('NATS connection drained.');
    }
  }
}

export const NatsConnectionProvider: Provider = {
  provide: NATS_CONNECTION,
  useClass: NatsConnectionHolder,
};
