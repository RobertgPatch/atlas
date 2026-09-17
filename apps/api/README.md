# Jackson API

Fastify-based REST API for the Jackson platform. Provides authentication, K-1 document ingestion, review, and reporting endpoints.

## Prerequisites

- Node.js 22 LTS
- `npm install` from the repo root (workspace bootstrap)

## Running locally

```powershell
# from repo root
npm run dev:local
```

This is the canonical development command. It validates the environment before
starting anything, starts Docker PostgreSQL, runs the ordered migrations under
the PostgreSQL advisory lock, starts the API, and waits for
`/internal/readiness`. The worker and web server start only after the database
is reachable. A database, migration, or readiness failure is fatal.

Local development uses the Docker database at
`postgres://postgres:postgres@127.0.0.1:15432/atlas`, the deterministic K-1
stub, local object storage, and the PostgreSQL-backed local queue. It needs no
AWS credentials and refuses non-loopback databases, AWS-backed adapters,
production profiles/resources, and mutation flags before starting a child
process. AWS credentials may remain in the shell only when no AWS adapter or
production target is activated.

For real K-1 parsing while keeping the application and database local, copy
`apps/api/local-bda.env.example` to the ignored `apps/api/.env.local-bda`, use
an approved short-lived AWS profile, and run `npm run dev:local:bda`. This
preflights the exact account, region, bucket/CORS, KMS key, and LIVE BDA project
before starting any process. The K-1 queue remains in local PostgreSQL; SQS,
production RDS, Terraform mutation, and unrelated providers are refused.
Use a short-lived role/profile with the Terraform `k1_ingestion.local_bda_policy_arn`
policy attached; that managed policy is intentionally unattached by default and
contains no SQS, RDS, ECS, or infrastructure-deployment permissions.
Queued PDFs accepted before BDA mode are promoted from local evidence storage
to the approved KMS-encrypted bucket before an extraction attempt is created;
copy failure leaves the item queued and retains the local source.

Copy `apps/api/.env.example` to `apps/api/.env` only for local overrides. Keep
the production-only variables blank. Production values are supplied through
the production release and secret contracts, never copied into the local file.

Useful local database commands from the repo root:

```powershell
npm run dev:db
npm run dev:db:logs
npm run dev:db:down
npm run dev:db:reset
```

`dev:db:reset` removes the local Docker volume and deletes local database data.

The API still runs the idempotent migration check on startup, so repeated
starts and concurrent startup remain safe under the same advisory lock.

## Running tests

```powershell
cd apps/api
npm test
```

The default extractor backend is `stub` (`K1_EXTRACTOR=stub`), which runs fully offline and requires no AWS credentials.

## Environment variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | local Docker Postgres on `127.0.0.1:15432` in development, empty otherwise | PostgreSQL connection string. Set to an empty value only when intentionally using in-memory storage. |
| `PERSISTENCE_SECRET_KEY` | _(empty)_ | Stable encryption key material for persisted Plaid and MFA secrets. Required for production durability. |
| `REQUIRE_DURABLE_PERSISTENCE` | `false` | Set to `true` in production so startup fails without PostgreSQL. |
| `WEB_ORIGIN` | _(empty)_ | Comma-separated allowed browser origins for credentialed CORS requests. |
| `ADMIN_EMAIL` | `tpatch@jspllc.com` | Tony Patch's canonical admin identity; legacy Atlas/Jackson admin emails are migrated while preserving the user id |
| `ADMIN_DISPLAY_NAME` | `Tony Patch` | Human name recorded in authentication audit context |
| `ADMIN_PASSWORD` | _(required in production)_ | One-time Tony bootstrap passphrase; the account must replace it before a session is issued |
| `SUPER_ADMIN_EMAIL` | `rpatch@jspllc.com` | Robert Patch's super-admin identity |
| `SUPER_ADMIN_DISPLAY_NAME` | `Robert Patch` | Human name recorded in authentication audit context |
| `SUPER_ADMIN_PASSWORD` | _(required in production)_ | Distinct one-time Robert bootstrap passphrase; the account must replace it before a session is issued |
| `PASSWORD_HASH_MEMORY_KIB` | `65536` | Argon2id memory cost per password operation; values below the OWASP minimum are clamped |
| `PASSWORD_HASH_TIME_COST` | `3` | Argon2id iteration count; minimum `2` |
| `PASSWORD_HASH_PARALLELISM` | `1` | Argon2id lanes per password operation; minimum `1` |
| `SESSION_COOKIE_NAME` | `atlas_session` | Name of the session cookie |
| `SESSION_COOKIE_SECURE` | `false` | Set to `true` in production (HTTPS only) |
| `SESSION_COOKIE_SAMESITE` | `lax` | Session cookie SameSite policy |
| `SESSION_IDLE_TIMEOUT_SECONDS` | `1800` | Sliding session idle expiry (30 minutes) |
| `SESSION_ABSOLUTE_TIMEOUT_SECONDS` | `28800` | Maximum session lifetime |
| `AUTH_LOCKOUT_THRESHOLD` | `3` | Failed login attempts before lockout |
| `AUTH_LOCKOUT_MINUTES` | `30` | Lockout duration |
| `AWS_APPLICATION_LOG_VIEW_ENABLED` | `false` | Enables the Robert-only, redacted CloudWatch application log view |
| `AWS_APPLICATION_LOG_GROUPS` | _(empty)_ | Comma-separated exact CloudWatch application log groups (maximum 8) |
| `STORAGE_ROOT` | `./.storage` | Local directory for uploaded PDFs |
| `K1_UPLOAD_MAX_BYTES` | `26214400` | Max upload size (25 MB) |
| `K1_EXTRACTOR` | `stub` | K-1 extraction backend: `stub` or `aws_bda` |
| `ATLAS_LOCAL_BDA_ENABLED` | `false` | Scoped switch set only by the explicit `dev:local:bda` launcher |
| `ATLAS_LOCAL_BDA_ACCOUNT_ID` | _(empty)_ | Exact 12-digit account approved for local K-1 S3/KMS/BDA calls |
| `K1_AWS_INGESTION_ENABLED` | `false` | Enables durable K-1 batch ingestion |
| `K1_OBJECT_STORE` | `local` | K-1 object store: `local` or `s3` |
| `K1_QUEUE` | `local` | K-1 work queue: `local` or `sqs` |
| `K1_RECONCILIATION_INTERVAL_SECONDS` | `15` | Poll interval for local BDA completion reconciliation |
| `K1_S3_BUCKET` | _(empty)_ | Private KMS-encrypted K-1 document bucket |
| `K1_KMS_KEY_ARN` | _(empty)_ | KMS key for source and BDA result objects |
| `K1_WORK_QUEUE_URL` | _(empty)_ | SQS extraction-start queue URL |
| `K1_COMPLETION_QUEUE_URL` | _(empty)_ | SQS BDA-completion queue URL |
| `K1_BDA_PROFILE_ARN` | _(empty)_ | Bedrock Data Automation profile ARN |
| `K1_BDA_PROJECT_ARN` | _(empty)_ | Bedrock Data Automation project ARN containing the K-1 blueprint |
| `K1_BDA_PROJECT_STAGE` | `DEVELOPMENT` | BDA project stage: `DEVELOPMENT` or `LIVE` |
| `K1_BEDROCK_CHECKBOX_MODEL_ID` | `us.amazon.nova-2-lite-v1:0` | Bedrock vision model used only when BDA returns an ambiguous K-1 status checkbox |
| `K1_BEDROCK_CHECKBOX_MAX_BYTES` | `5242880` | Maximum PDF size sent to the secondary Bedrock checkbox verifier |
| `PLAID_CLIENT_ID` | _(empty)_ | Plaid client id |
| `PLAID_SECRET` | _(empty)_ | Plaid secret |
| `PLAID_ENV` | `sandbox` | Plaid environment: `sandbox`, `development`, or `production` |
| `PLAID_PRODUCTS` | `investments` | Comma-separated Plaid products requested by Link |
| `PLAID_COUNTRY_CODES` | `US` | Comma-separated Plaid country codes |
| `PLAID_REDIRECT_URI` | _(empty)_ | Optional Plaid OAuth redirect URI |
| `PLAID_REFRESH_TIME_LOCAL` | `05:00` | Daily Liquidity refresh time in the configured timezone |
| `PLAID_REFRESH_TIMEZONE` | `America/Los_Angeles` | IANA timezone for the Liquidity refresh policy |
| `PLAID_REFRESH_SCHEDULER_ENABLED` | `false` | Whether production automatic refresh infrastructure is expected |
| `PLAID_REFRESH_SCHEDULER_MODE` | `none` | Scheduler mode: `none`, `eventbridge`, or `manual` |
| `PROJECT_JACKSON_SCHEDULER_TOKEN` | _(empty)_ | Shared token for the protected scheduler trigger |
| `MARKET_DATA_PROVIDER` | `none` | Public-market provider: `none` or `alpaca` |
| `MARKET_DATA_REFRESH_ON_READ` | `true` | Refresh stale public-market quotes while serving the Liquidity report |
| `MARKET_DATA_MAX_AGE_SECONDS` | `60` | Server-side quote cache lifetime |
| `MARKET_DATA_REQUEST_TIMEOUT_MS` | `4000` | Timeout for provider HTTP requests |
| `ALPACA_MARKET_DATA_BASE_URL` | `https://data.alpaca.markets` | Alpaca Market Data API origin |
| `ALPACA_MARKET_DATA_KEY_ID` | _(empty)_ | Server-only Alpaca market-data key id |
| `ALPACA_MARKET_DATA_SECRET` | _(empty)_ | Server-only Alpaca market-data secret |
| `ALPACA_MARKET_DATA_FEED` | `sip` | Alpaca feed: `sip`, `iex`, or `delayed_sip` |
| `MASSIVE_OTC_ENABLED` | `false` | Use Massive end-of-day aggregates for OTC symbols Alpaca leaves unpriced |
| `MASSIVE_MARKET_DATA_BASE_URL` | `https://api.massive.com` | Massive REST API origin |
| `MASSIVE_MARKET_DATA_API_KEY` | _(empty)_ | Server-only Massive API key |
| `MASSIVE_OTC_CACHE_TTL_SECONDS` | `900` | Cache lifetime for Massive grouped OTC daily responses |
| `RATE_LIMIT_ENABLED` | `true` | Enables API-side rate-limit guardrail configuration |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate-limit window size used by production readiness checks |
| `RATE_LIMIT_MAX_REQUESTS` | `120` | Maximum requests per rate-limit window |
| `API_SHARED_CACHE_POLICY` | `no_shared_cache` | Expected API cache policy for authenticated financial responses |
| `PRODUCTION_READINESS_ENABLED` | `true` | Enables admin production-readiness diagnostics when implemented |
| `AWS_REGION` | `us-west-2` | Primary AWS region for the API, RDS, ECS, and regional services |
| `AWS_APP_DOMAIN` | _(empty)_ | Public app domain used by CloudFront, for example `app.example.com` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | _(empty)_ | CloudFront distribution id for diagnostics/runbook evidence |
| `AWS_WEB_ASSETS_BUCKET` | _(empty)_ | S3 bucket name for static web assets |

## Password storage

New password records use Argon2id with a unique salt and the configured memory,
time, and parallelism costs. The application recognizes the former 64-character
SHA-256 format only as a migration bridge: a correct legacy login is re-hashed
with Argon2id and durably stored before the session is created. Incorrect or
malformed password records are never upgraded. Users who never sign in should be
migrated later through a forced password-reset policy.

## Liquidity market pricing

Plaid remains authoritative for account selection, quantities, and cost basis. When
`MARKET_DATA_PROVIDER=alpaca`, the consolidated holdings read path obtains a fresh
batch quote for stale USD ticker symbols, saves the observation, and recomputes
market value as `quantity × price`. A provider or cache failure falls back to the
last saved price or the custodian value and is disclosed in the response metadata.

For the AWS deployment, the separate `market-price-refresh` scheduled task runs
`dist/scripts/run-market-price-refresh.js` at 4:20 p.m. Eastern on weekdays. The
task stores daily closing prices and one idempotent portfolio valuation snapshot
for the trading date. Each valuation preserves the selected account set and its
position-level quantities, cost basis, closing price, market value, and any
custodian fallback. Provider holidays do not create a false point when no official
close is returned. Keep Alpaca credentials in the generated Secrets Manager
entries; do not place them in web environment variables.

When `MASSIVE_OTC_ENABLED=true`, Alpaca remains the primary source. Symbols that
Alpaca does not price are passed to Massive's grouped daily endpoint, and only
results explicitly marked as OTC are accepted. Massive observations are persisted
with `provider=massive` and never replace an Alpaca price for the same request.
The free Massive plan is end-of-day only, so OTC holdings show the most recent
eligible closing trade rather than an intraday quote.

## K-1 extraction backend

K-1 extraction supports only the offline stub and AWS Bedrock Data Automation:

| Value | Description |
|---|---|
| `stub` | Deterministic offline extractor for unit tests and development without AWS. |
| `aws_bda` | Durable S3 worker flow using the configured BDA project and K-1 blueprint. |

`dev:local` and CI remain offline/stub. Real AWS BDA is available only through
`dev:local:bda`, which keeps application state and the durable queue local and
permits only preflighted K-1 S3/KMS/BDA operations in `us-west-2`. Resource
identifiers and low cost ceilings live in ignored `.env.local-bda`; credentials
come from the AWS session/profile and are never stored in that file.
