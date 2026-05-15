import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NatsConnectionProvider } from './nats.provider';
import { NatsSubscriberService } from './nats-subscriber.service';
import { JobLogEntity } from '../entities/job-log.entity';
import { CacheModule } from '../cache/cache.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobLogEntity]),
    CacheModule,
    SearchModule,
  ],
  providers: [NatsConnectionProvider, NatsSubscriberService],
  exports: [NatsConnectionProvider, NatsSubscriberService],
})
export class NatsModule {}
