# Jackson API

Fastify-based REST API for the Jackson platform. Provides authentication, K-1 document ingestion, review, and reporting endpoints.

## Prerequisites

- Node.js 22 LTS
- `npm install` from the repo root (workspace bootstrap)

## Running locally

```powershell
# from repo root
npm run dev:db
npm run dev --workspace=api
```

The server starts on port `3000` by default. Copy `apps/api/.env.example` to `apps/api/.env` and fill in the required values before starting.

By default, development mode targets the local Docker Postgres database at `postgres://postgres:postgres@127.0.0.1:55432/atlas`. The API runs migrations on startup when `DATABASE_URL` is set.

Useful local database commands from the repo root:

```powershell
npm run dev:db
npm run dev:db:logs
npm run dev:db:down
npm run dev:db:reset
```

`dev:db:reset` removes the local Docker volume and deletes local database data.

To start the local database plus API and web dev servers from one command:

```powershell
npm run dev:local
```

This opens the API and web dev servers in separate PowerShell windows so their logs remain visible.

## Running tests

```powershell
cd apps/api
npm test
```

The default extractor backend is `stub` (`K1_EXTRACTOR=stub`), which runs fully offline and requires no Azure credentials.

## Environment variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | local Docker Postgres on `127.0.0.1:55432` in development, empty otherwise | PostgreSQL connection string. Set to an empty value only when intentionally using in-memory storage. |
| `PERSISTENCE_SECRET_KEY` | _(empty)_ | Stable encryption key material for persisted Plaid and MFA secrets. Production requires at least 32 characters. |
| `REQUIRE_DURABLE_PERSISTENCE` | `false` | Set to `true` in production so startup fails without PostgreSQL. |
| `WEB_ORIGIN` | _(empty)_ | Comma-separated allowed browser origins for credentialed CORS requests. |
| `ADMIN_EMAIL` | `admin@jackson.com` | Bootstrap admin email inserted into durable databases on startup |
| `ADMIN_PASSWORD` | `password123` in development; empty in production | Bootstrap admin password used when the admin user is first created. Production requires at least 12 characters. |
| `USER_EMAIL` | `user@jackson.com` | Bootstrap standard user email inserted into durable databases on startup |
| `USER_PASSWORD` | `password123` in development; empty in production | Optional bootstrap standard-user password. When set in production, it requires at least 12 characters. |
| `SESSION_SECRET` | _(empty)_ | Cookie-signing secret. Production requires at least 32 characters. |
| `SESSION_COOKIE_NAME` | `atlas_session` | Name of the session cookie |
| `SESSION_COOKIE_SECURE` | `false` | Set to `true` in production (HTTPS only) |
| `SESSION_COOKIE_SAMESITE` | `lax` | Session cookie SameSite policy |
| `SESSION_IDLE_TIMEOUT_SECONDS` | `900` | Session idle expiry |
| `SESSION_ABSOLUTE_TIMEOUT_SECONDS` | `28800` | Maximum session lifetime |
| `AUTH_LOCKOUT_THRESHOLD` | `3` | Failed login attempts before lockout |
| `AUTH_LOCKOUT_MINUTES` | `30` | Lockout duration |
| `STORAGE_ROOT` | `./.storage` | Local directory for uploaded PDFs |
| `K1_UPLOAD_MAX_BYTES` | `26214400` | Max upload size (25 MB) |
| `K1_EXTRACTOR` | `stub` | K-1 extraction backend: `stub` or `azure` |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | _(empty)_ | Required when `K1_EXTRACTOR=azure` |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | _(empty)_ | Azure DI subscription key (Key 1) |
| `AZURE_DOCUMENT_INTELLIGENCE_API_VERSION` | `2024-11-30` | Azure DI REST API version |
| `AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID` | `prebuilt-layout` | Optional Azure model ID. Set this to your custom or composed model ID to analyze uploaded PDFs with that model. |
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
| `ATLAS_SCHEDULER_TOKEN` | _(empty)_ | Shared token for the protected scheduler trigger |
| `RATE_LIMIT_ENABLED` | `true` | Enables API-side rate-limit guardrail configuration |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate-limit window size used by production readiness checks |
| `RATE_LIMIT_MAX_REQUESTS` | `120` | Maximum requests per rate-limit window |
| `API_SHARED_CACHE_POLICY` | `no_shared_cache` | Expected API cache policy for authenticated financial responses |
| `PRODUCTION_READINESS_ENABLED` | `true` | Enables admin production-readiness diagnostics when implemented |
| `AWS_REGION` | `us-west-2` | Primary AWS region for the API, RDS, ECS, and regional services |
| `AWS_APP_DOMAIN` | _(empty)_ | Public app domain used by CloudFront, for example `app.example.com` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | _(empty)_ | CloudFront distribution id for diagnostics/runbook evidence |
| `AWS_WEB_ASSETS_BUCKET` | _(empty)_ | S3 bucket name for static web assets |

## K-1 Extraction backend

The API supports two extraction backends, selectable via the `K1_EXTRACTOR` environment variable:

| Value | Description |
|---|---|
| `stub` | Deterministic in-process stub. No network calls, no Azure cost. Default. |
| `azure` | Real Azure Document Intelligence. The app posts the uploaded PDF bytes to the configured Azure model ID and maps the returned fields into the K-1 review shape. |

### Switching to Azure

Set these values in `apps/api/.env`:

```ini
K1_EXTRACTOR=azure
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://atlaswc.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=<Key 1 from Azure portal>
AZURE_DOCUMENT_INTELLIGENCE_API_VERSION=2024-11-30
AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID=<your-custom-or-composed-model-id>
```

Restart the API. On first use you should see:

```text
INFO  k1.extractor backend=azure endpoint=https://atlaswc.cognitiveservices.azure.com/ apiVersion=2024-11-30
```

For full onboarding instructions, smoke-test steps, key rotation procedure, and troubleshooting, see [specs/008-azure-document-intelligence/quickstart.md](../../specs/008-azure-document-intelligence/quickstart.md).

### Switching back to the stub

```ini
K1_EXTRACTOR=stub
```

Restart the API. Use this for offline development, CI, and unit tests.

### Running the Azure extractor contract test (no credentials needed)

The contract test uses a recorded fixture and runs fully offline:

```powershell
cd apps/api
npm test -- k1.azure-extractor.contract
```

### Regenerating the fixture (requires real credentials)

To update the recorded fixture with a live Azure DI response:

```powershell
cd apps/api
npm run capture-di-fixture -- --pdf path/to/sample-k1.pdf
```

This submits the PDF to Azure DI using the configured model ID, scrubs TIN/EIN patterns, and overwrites `tests/fixtures/azure-di-analyze-result.sample.json`. Requires `K1_EXTRACTOR=azure` and valid credentials in `.env`.

If your custom model returns structured fields that match the app's expected K-1 mapping, the extractor will use them directly. If it does not, the app falls back to OCR/layout text mapping and keeps the document in `NEEDS_REVIEW` for manual verification.
