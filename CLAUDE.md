<!-- #ZEROPS_EXTRACT_START:claude-md# -->

# nestjs-showcase-worker

NestJS 11 standalone worker (no HTTP server). Bootstraps via
`NestFactory.createApplicationContext`, subscribes to a NATS subject as a
queue-group consumer, and fans each message out to postgres (TypeORM
`job_log` table), an ioredis client (Valkey wire), a Meilisearch `jobs`
index, and an S3-compatible object-storage client.

## Build & run

- `npm run build` — `nest build`; emits `dist/main.js` and `dist/migrate.js`.
- `npm run start` — `node dist/main.js`; runs the compiled worker process.
- `npm run start:dev` — `nest start --watch`; watch-mode rebuild + restart.
- `npm run migrate` — `node dist/migrate.js`; ensures the `job_log` table
  and `idx_job_log_subject` index exist (idempotent `CREATE TABLE
  IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`).
- `npm run migrate:dev` — `ts-node src/migrate.ts`; same migration from
  TypeScript source without a build step.

## Architecture

- `src/main.ts` — bootstrap. Builds an application context (no HTTP
  listener), invokes `NatsSubscriberService.onApplicationBootstrap()`,
  enables Nest shutdown hooks, logs a `worker-heartbeat ok` line every
  30 s (liveness signal in lieu of `/health`), and wires SIGTERM/SIGINT
  to `app.close()`.
- `src/migrate.ts` — standalone `pg.Client` script that creates the
  `job_log` table and subject index. Runs outside the Nest context so
  it can execute before the worker boots.
- `src/app.module.ts` — root module. Imports `ConfigModule.forRoot({
  isGlobal: true })`, `TypeOrmModule.forRoot({ type: 'postgres', ... })`
  with `synchronize: false`, and the four feature modules below. Entity
  list is explicit (`[JobLogEntity]`); `autoLoadEntities` is off.
- `src/nats/` — NATS feature module.
  - `nats.provider.ts` — `NatsConnectionHolder` (`OnModuleInit` /
    `OnModuleDestroy`) opens a single `nats.connect()` connection with
    `maxReconnectAttempts: -1`, `reconnectTimeWait: 2000`, client
    name `nestjs-showcase-worker`. Exposed via the `NATS_CONNECTION`
    DI token as a holder object so consumers see reconnects.
  - `nats-subscriber.service.ts` — subscribes to `showcase.jobs.*` with
    queue group `showcase-workers` (one message → one consumer across
    replicas). Each message: inserts a `job_log` row, `LPUSH`+`LTRIM`s
    the latest 50 events onto `showcase:queue:events`, `INCR`s
    `showcase:queue:processed`, and indexes a document into the
    Meilisearch `jobs` index. Shutdown calls `subscription.drain()` so
    in-flight messages finish before the iterator closes.
  - `nats.module.ts` — wires the provider + subscriber, imports
    `TypeOrmModule.forFeature([JobLogEntity])`, `CacheModule`,
    `SearchModule`.
- `src/cache/cache.module.ts` — `CacheClientHolder` constructs an
  `ioredis` `Redis` client, pings on init, disconnects on destroy.
  Exposed via the `CACHE_CLIENT` token.
- `src/search/search.module.ts` — `SearchClientHolder` constructs a
  `MeiliSearch` client and probes `client.health()`; failures are logged
  and the client is retained for retry. Exposed via the `SEARCH_CLIENT`
  token.
- `src/storage/storage.module.ts` — `StorageClientHolder` constructs an
  `@aws-sdk/client-s3` `S3Client` with `forcePathStyle: true`, runs a
  `HeadBucketCommand` probe on init (warn-only on failure). Exposes
  `STORAGE_CLIENT` and `STORAGE_BUCKET` DI tokens.
- `src/entities/job-log.entity.ts` — TypeORM `JobLogEntity` for the
  `job_log` table: uuid `id` (`gen_random_uuid()`), `subject` varchar,
  `payload` jsonb (nullable), `status` varchar (default `received`),
  `created_at` timestamptz.
- `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json` — Nest CLI +
  TypeScript build configuration. Compiled output lives in `dist/`.
<!-- #ZEROPS_EXTRACT_END:claude-md# -->
