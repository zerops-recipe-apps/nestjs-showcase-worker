# nestjs-showcase-worker

NestJS 12 standalone worker (no HTTP server). Subscribes to NATS as a queue-group consumer and fans messages out to Postgres, Valkey, Meilisearch, and S3-compatible storage.

## Zerops service facts

- HTTP port: none (NATS worker)
- Siblings: `db`, `cache`, `broker`, `storage`, `search` — env aliases: `DB_*`, `CACHE_*`, `NATS_*`, `S3_*`, `SEARCH_*`
- Runtime base: `nodejs@24`

## Zerops dev

`setup: dev` idles on `zsc noop --silent`; the agent starts the worker.

- Dev command: `npm run start:dev`
- In-container rebuild without deploy: `npm run build`

**All platform operations (start/stop/status/logs of the dev server, deploy, env / scaling / storage / domains) go through the Zerops development workflow via `zcp` MCP tools. Don't shell out to `zcli`.**

## Notes

- Prod build: `npm ci --include=dev`, `npm run build`, `npm prune --omit=dev`.
- Migration runs via `zsc execOnce ${appVersionId}-worker-migrate` before `start`.
- NATS credentials are wired as separate host/port/user/password fields — not a connection string (colons in auto-generated passwords break URL parsing).
- Worker logs `worker-heartbeat ok` every 30s as a liveness signal (no HTTP health endpoint).
