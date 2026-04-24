# Atlas API

Fastify-based REST API for the Atlas platform. Provides authentication, K-1 document ingestion, review, and reporting endpoints.

## Prerequisites

- Node.js 22 LTS
- `npm install` from the repo root (workspace bootstrap)

## Running locally

```powershell
# from repo root
npm run dev --workspace=@atlas/api
```

The server starts on port `3000` by default. Copy `apps/api/.env.example` to `apps/api/.env` and fill in the required values before starting.

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
| `DATABASE_URL` | _(empty)_ | PostgreSQL connection string. Leave empty to use in-memory storage. |
| `SESSION_COOKIE_NAME` | `atlas_session` | Name of the session cookie |
| `SESSION_COOKIE_SECURE` | `false` | Set to `true` in production (HTTPS only) |
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
