import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NatsConnectionProvider } from './nats.provider';
import { NatsSubscriberService } from './nats-subscriber.service';
import { JobLogEntity } from '../entities/job-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JobLogEntity])],
  providers: [NatsConnectionProvider, NatsSubscriberService],
  exports: [NatsConnectionProvider, NatsSubscriberService],
})
export class NatsModule {}
