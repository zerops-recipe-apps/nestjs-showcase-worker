# Zerops x NestJS Showcase Worker

<!-- #ZEROPS_EXTRACT_START:intro# -->
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
zerops:
  - setup: prod
    build:
      base: nodejs@22
      buildCommands:
        - npm ci
        - npm run build
        - npm prune --omit=dev
      deployFiles:
        - ./dist
        - ./node_modules
        - ./package.json
      cache:
        - node_modules
    run:
      base: nodejs@22
      initCommands:
        - zsc execOnce ${appVersionId}-worker-migrate --retryUntilSuccessful -- node dist/migrate.js
      envVariables:
        NODE_ENV: production
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
        NATS_PASS: ${broker_password}
        S3_ENDPOINT: ${storage_apiUrl}
        S3_ACCESS_KEY: ${storage_accessKeyId}
        S3_SECRET_KEY: ${storage_secretAccessKey}
        S3_BUCKET: ${storage_bucketName}
        S3_REGION: us-east-1
        SEARCH_URL: http://${search_hostname}:${search_port}
        SEARCH_MASTER_KEY: ${search_masterKey}
      start: node dist/main.js

  - setup: dev
    build:
      base: nodejs@22
      buildCommands:
        - npm install
      deployFiles: ./
      cache:
        - node_modules
    run:
      base: nodejs@22
      os: ubuntu
      initCommands:
        - zsc execOnce ${appVersionId}-workerdev-migrate --retryUntilSuccessful -- npx ts-node src/migrate.ts
      envVariables:
        NODE_ENV: development
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
        NATS_PASS: ${broker_password}
        S3_ENDPOINT: ${storage_apiUrl}
        S3_ACCESS_KEY: ${storage_accessKeyId}
        S3_SECRET_KEY: ${storage_secretAccessKey}
        S3_BUCKET: ${storage_bucketName}
        S3_REGION: us-east-1
        SEARCH_URL: http://${search_hostname}:${search_port}
        SEARCH_MASTER_KEY: ${search_masterKey}
      start: zsc noop --silent
```
<!-- #ZEROPS_EXTRACT_END:integration-guide# -->

<!-- #ZEROPS_EXTRACT_START:knowledge-base# -->

### Gotchas

<!-- #ZEROPS_EXTRACT_END:knowledge-base# -->
