import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NatsModule } from './nats/nats.module';
import { CacheModule } from './cache/cache.module';
import { StorageModule } from './storage/storage.module';
import { SearchModule } from './search/search.module';
import { JobLogEntity } from './entities/job-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [JobLogEntity],
      synchronize: false,
      autoLoadEntities: false,
    }),
    TypeOrmModule.forFeature([JobLogEntity]),
    NatsModule,
    CacheModule,
    StorageModule,
    SearchModule,
  ],
})
export class AppModule {}
