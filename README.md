# Zerops x NestJS Showcase Worker

<!-- #ZEROPS_EXTRACT_START:intro# -->

NestJS standalone worker — consumes NATS subjects, writes job records to Postgres, mirrors a recent-events list into Valkey, and indexes job documents into Meilisearch. No HTTP surface.
<!-- #ZEROPS_EXTRACT_END:intro# -->

![nestjs cover](https://github.com/zeropsio/recipe-shared-assets/blob/main/covers/svg/cover-nestjs.svg)

## Deploy to Zerops

Click the deploy button to deploy directly to Zerops.

[![Deploy on Zerops](https://github.com/zeropsio/recipe-shared-assets/blob/main/deploy-button/light/deploy-button.svg)](https://app.zerops.io/recipes/nestjs-showcase?environment=small-production)

## Integration Guide

<!-- #ZEROPS_EXTRACT_START:integration-guide# -->
### 1. Adding `zerops.yaml`

The main configuration file — place at repository root. It tells Zerops how to build, deploy and run your app. This one declares 2 setups (`dev`, `prod`) and runs `initCommands` at boot (migrations).

```yaml
# Two setups: prod runs the compiled worker as a long-lived NATS
# subscriber; dev ships the source tree under SSHFS so the porter
# SSHes in and runs `npm run start:dev` (nest --watch) by hand.
# Both setups are no-HTTP — the worker has no ports, no
# healthCheck, no readinessCheck.
zerops:
  - setup: prod
    build:
      base: nodejs@22
      buildCommands:
        # Compile TypeScript, then strip devDependencies before
        # the deployFiles step copies node_modules to the runtime
        # container — keeps the deployed bundle lean and avoids
        # shipping ts-node, types, lint tooling.
        - npm ci
        - npm run build
        - npm prune --omit=dev
      # Build container compiles into ./dist; the runtime needs
      # the compiled JS plus production node_modules so node can
      # require modules at startup. package.json ships too because
      # NestJS reads it at boot for metadata.
      deployFiles:
        - ./dist
        - ./node_modules
        - ./package.json
      cache:
        - node_modules
    run:
      base: nodejs@22
      # zsc execOnce keys the migration to the current deploy
      # version: ${appVersionId} changes every deploy so the
      # migrator re-fires per deploy (right for idempotent
      # CREATE TABLE IF NOT EXISTS DDL). The -worker-migrate
      # suffix scopes the lock to this codebase — the api
      # codebase runs its own migrator on the same database
      # with its own -api-migrate suffix, so neither migrator
      # blocks the other. --retryUntilSuccessful absorbs the
      # first-deploy window where Postgres has provisioned but
      # isn't yet accepting connections.
      initCommands:
        - zsc execOnce ${appVersionId}-worker-migrate --retryUntilSuccessful -- node dist/migrate.js
      # Cross-service references renamed under stable own-keys —
      # DB_HOST, NATS_HOST, S3_*, SEARCH_* — so the application
      # code reads platform-neutral names. Swapping a managed
      # service later is a one-line yaml edit, no app rebuild.
      # Same-name aliasing (DB_HOST: ${DB_HOST}) would self-shadow
      # — the literal token wins and the OS env var becomes the
      # string "${...}".
      #
      # NATS is wired as four separate fields (host/port/user/
      # password) instead of ${broker_connectionString} because
      # the nats@2.29 client mis-detects IPv6 by colon-count and
      # rejects auto-generated passwords containing multiple
      # colons. Separate fields side-step the parser entirely.
      #
      # Project-scope envs (APP_SECRET, FRONTEND_URL, API_URL)
      # are NOT redeclared here — they auto-propagate to every
      # container, and redeclaring under the same name would
      # self-shadow into a literal "${APP_SECRET}" string.
      envVariables:
        DB_HOST: ${db_hostname}
        DB_PORT: ${db_port}
        DB_NAME: ${db_dbName}
        DB_USER: ${db_user}
        DB_PASSWORD: ${db_password}
        # Valkey on Zerops runs unauthenticated — no ${cache_user}
        # or ${cache_password} aliases exist, and referencing
        # them would resolve to literal "${cache_password}" and
        # crash ioredis with AUTH errors. Host + port only.
        CACHE_HOST: ${cache_hostname}
        CACHE_PORT: ${cache_port}
        NATS_HOST: ${broker_hostname}
        NATS_PORT: ${broker_port}
        NATS_USER: ${broker_user}
        NATS_PASSWORD: ${broker_password}
        # S3_ENDPOINT reads ${storage_apiUrl} (the full https://
        # form) — composing from ${storage_apiHost} would hit
        # the gateway's plaintext-http 301 redirect that S3 SDKs
        # don't follow, producing UnknownError on the first
        # bucket call. S3_REGION is required by the AWS SDK
        # contract but MinIO ignores its value; us-east-1 is the
        # conventional inert pick.
        S3_ENDPOINT: ${storage_apiUrl}
        S3_ACCESS_KEY_ID: ${storage_accessKeyId}
        S3_SECRET_ACCESS_KEY: ${storage_secretAccessKey}
        S3_BUCKET: ${storage_bucketName}
        S3_REGION: us-east-1
        # Meilisearch internal traffic is plain http on the
        # project network. The worker ingests documents, so it
        # needs the master key — never alias this on a frontend
        # codebase that builds for the browser (use
        # ${search_defaultSearchKey} there instead).
        SEARCH_URL: http://${search_hostname}:${search_port}
        SEARCH_MASTER_KEY: ${search_masterKey}
      # Runs the compiled NestJS standalone application context
      # — boots the DI container, opens NATS / Postgres / Valkey
      # / object-storage / Meilisearch clients, then parks on
      # the NATS subscription iterator. No HTTP server, no port
      # binding, no foreground http listener. The platform sends
      # SIGTERM on rolling deploys; the bootstrap forwards that
      # to NestJS shutdown hooks and the subscription drains
      # before the connection closes.
      start: node dist/main.js

  - setup: dev
    build:
      base: nodejs@22
      buildCommands:
        # npm install (not npm ci) — the dev workflow tolerates
        # lockfile drift while the porter iterates locally; the
        # prod setup above pins to package-lock.json.
        - npm install
      # Full source tree shipped under SSHFS so the porter can
      # edit code in place and nest --watch picks up the changes
      # without a redeploy.
      deployFiles: ./
      cache:
        - node_modules
    run:
      base: nodejs@22
      # Ubuntu provides richer interactive tooling (apt, vim,
      # curl, git) over the default minimal image — useful when
      # the porter SSHes in to inspect or debug the worker.
      os: ubuntu
      # Dev runs the migrator straight from TypeScript source
      # (npx ts-node) so the porter can edit src/migrate.ts and
      # the next deploy picks up the change without a build
      # step. The -workerdev-migrate suffix keeps the dev slot
      # independent of the prod slot's lock.
      initCommands:
        - zsc execOnce ${appVersionId}-workerdev-migrate --retryUntilSuccessful -- npx ts-node src/migrate.ts
      # Same wiring as prod — only the run.start command differs
      # between setups. See the prod block above for the
      # rationale on each alias.
      envVariables:
        DB_HOST: ${db_hostname}
        DB_PORT: ${db_port}
        DB_NAME: ${db_dbName}
        DB_USER: ${db_user}
        DB_PASSWORD: ${db_password}
        CACHE_HOST: ${cache_hostname}
        CACHE_PORT: ${cache_port}
        NATS_HOST: ${broker_hostname}
        NATS_PORT: ${broker_port}
        NATS_USER: ${broker_user}
        NATS_PASSWORD: ${broker_password}
        S3_ENDPOINT: ${storage_apiUrl}
        S3_ACCESS_KEY_ID: ${storage_accessKeyId}
        S3_SECRET_ACCESS_KEY: ${storage_secretAccessKey}
        S3_BUCKET: ${storage_bucketName}
        S3_REGION: us-east-1
        SEARCH_URL: http://${search_hostname}:${search_port}
        SEARCH_MASTER_KEY: ${search_masterKey}
      # `zsc noop --silent` keeps the dev container alive without
      # binding the runtime to a foreground process — the porter
      # SSHes in and runs `npm run start:dev` (nest --watch) by
      # hand. Source edits flow through the SSHFS mount and the
      # watcher rebuilds in place; no redeploy required to see
      # code changes on the dev slot.
      start: zsc noop --silent
```

### 2. Bootstrap as a NestJS standalone application context

A NestJS worker has no HTTP server — there's nothing to serve. Swap `NestFactory.create` for `NestFactory.createApplicationContext` so the process runs the dependency-injection container without binding a port. Pair it with `enableShutdownHooks()` so `OnModuleDestroy` fires when the platform sends `SIGTERM` on a rolling deploy.

```typescript
const app = await NestFactory.createApplicationContext(AppModule, {
  bufferLogs: false,
});
app.enableShutdownHooks();
```

The matching `zerops.yaml` shape for a worker omits `ports:`, `healthCheck:`, and `readinessCheck:` from every setup block — those fields gate on HTTP responses the worker never produces. The platform observes liveness from logs instead, so emit a startup line and a periodic heartbeat at boot for visibility in the runtime log viewer.

### 3. Connect to NATS with separate credential fields

Pass the broker's host, port, user, and password as four separate env-var aliases — never compose `nats://user:pass@host:port` by hand. The `nats@2.x` client parses any URL-embedded credentials AND separately attempts SASL with the same values, producing a double-auth attempt the broker rejects with `Authorization Violation` on the first CONNECT frame. The credential-free `servers` string plus `user` / `pass` connect options avoids the double-auth path entirely.

```typescript
import { connect } from 'nats';

const nc = await connect({
  servers: `${process.env.NATS_HOST}:${process.env.NATS_PORT}`,
  user: process.env.NATS_USER,
  pass: process.env.NATS_PASSWORD,
  maxReconnectAttempts: -1,
  reconnectTimeWait: 2_000,
});
```

The shipped `zerops.yaml` aliases the four platform-side keys under `NATS_HOST`, `NATS_PORT`, `NATS_USER`, `NATS_PASSWORD` so the code reads its own names. `${broker_connectionString}` is also offered by the platform, but `nats@2.29` has an IPv6 detection bug that mis-parses auto-generated passwords containing multiple colons — stick with the separate-fields shape. The [managed NATS broker](https://docs.zerops.io/services/nats) reference covers the full set of platform-injected env keys for the service.

### 4. Subscribe in a queue group and drain on SIGTERM

The worker runs `minContainers: 2` on showcase and higher production setups so a rolling deploy keeps the subscription alive while a fresh replica boots. Two replicas plus a plain `nc.subscribe(subject)` fans every message out to BOTH containers — every job gets processed twice. The fix is two-part: pass a stable `queue` group name so the broker delivers each message to exactly one replica in the group, AND on `SIGTERM` call `subscription.drain()` (NOT `unsubscribe()`) so in-flight handlers finish before the connection closes. `unsubscribe()` drops the in-flight message and the next deploy loses one event per replacement.

```typescript
const sub = nc.subscribe('showcase.jobs.*', { queue: 'showcase-workers' });

async onApplicationShutdown(): Promise<void> {
  await sub.drain();
}
```

NestJS calls `OnApplicationShutdown` when `enableShutdownHooks()` is on and the process receives `SIGTERM`. The platform sends `SIGTERM` before pulling the old container during a [zero-downtime deploys with multi-container setups](https://docs.zerops.io/features/scaling-ha); pair `drain()` with the standalone-context bootstrap above and rolling deploys lose zero events.

### 5. Configure the S3 client with path-style addressing

Zerops object-storage is a MinIO backend. The AWS S3 SDK defaults to virtual-hosted addressing (bucket name as a subdomain of the endpoint), which MinIO doesn't support — every bucket call fails with `UnknownError` because the virtual-hosted hostname has no DNS entry. Set `forcePathStyle: true` on the client, and read the endpoint from `${storage_apiUrl}` (a full `https://...` URL) rather than composing it from `${storage_apiHost}`: the gateway returns a 301 from `http://` to `https://` that S3 SDKs don't follow.

```typescript
import { S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});
```

`S3_REGION` is required by the SDK constructor (every AWS SDK refuses to build without it) but MinIO ignores the value — `us-east-1` is the conventional inert choice. The shipped `zerops.yaml` aliases `${storage_apiUrl}`, `${storage_accessKeyId}`, `${storage_secretAccessKey}`, and `${storage_bucketName}` under `S3_*` own-key names so the application reads platform-neutral env vars. The [S3-compatible storage on the MinIO backend](https://docs.zerops.io/services/object-storage) reference covers the gateway URL shape + the per-key env keys the managed service emits.
<!-- #ZEROPS_EXTRACT_END:integration-guide# -->

<!-- #ZEROPS_EXTRACT_START:knowledge-base# -->

### `relation "job_log" already exists` after a co-deployed migrator race

The api and worker codebases both run their own migrators on every deploy. Sharing an `execOnce` key between them (e.g. plain `${appVersionId}-migrate` in both `zerops.yaml` files) means whichever container's migrator wins the lock burns the key for the other — the second migrator skips silently and any DDL it owned never runs, OR Postgres throws `relation already exists` when both race past the lock check. Suffix every co-deployed migrator's `execOnce` key with the codebase name (`${appVersionId}-worker-migrate`, `${appVersionId}-api-migrate`) so each migrator owns an independent per-deploy gate. The [zsc execOnce + per-deploy key model](https://docs.zerops.io/zerops-yaml/specification#initcommands-) reference covers `${appVersionId}` re-fire semantics and the static-vs-versioned key split.

### `ioredis` sends garbage `AUTH` commands when wired to Valkey with `password`

The Valkey service on Zerops runs unauthenticated on the project network — `${cache_user}` and `${cache_password}` don't exist as platform-side env vars. Writing them into `zerops.yaml` aliases produces literal `${cache_password}` strings inside the container, `ioredis` then sends `AUTH ${cache_password}` on every request, and Valkey closes the connection. Wire only `CACHE_HOST: ${cache_hostname}` + `CACHE_PORT: ${cache_port}` and omit the password option from the `ioredis` constructor entirely.

### Meilisearch `masterKey` leaks if the worker's env shape is copied to a browser bundle

The worker reads `${search_masterKey}` because it INGESTS documents (create index, add documents, update searchable attributes) — those operations require admin scope. `masterKey` is a wildcard credential; if a frontend codebase ever copies this worker's env-alias block verbatim it ships an admin key in a public JavaScript bundle. The browser-side equivalent is `${search_defaultSearchKey}`, which is search-only and safe to expose. Keep `SEARCH_MASTER_KEY` on the worker (and any other server-side ingester); never alias it on a frontend codebase that builds for the browser.
<!-- #ZEROPS_EXTRACT_END:knowledge-base# -->
