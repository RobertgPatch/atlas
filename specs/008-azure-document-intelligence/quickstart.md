# Quickstart: Azure Document Intelligence for K-1 Extraction

**Audience**: Operators deploying Atlas, plus local developers who want to test against the real Azure service.
**Time**: ≤ 10 minutes.
**Prerequisites**: Azure Document Intelligence resource already provisioned at `https://atlaswc.cognitiveservices.azure.com/` with two subscription keys (Key 1 + Key 2).

---

## 1. Where do the keys go?

### Local development (`apps/api/.env`)

The API reads configuration from `apps/api/.env` via `dotenv`. `.env` is **gitignored**; it never leaves your machine. Add:

```ini
# apps/api/.env  (NEVER COMMIT)

# Azure Document Intelligence — K-1 extraction backend
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://atlaswc.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=<paste Key 1 here>
AZURE_DOCUMENT_INTELLIGENCE_API_VERSION=2024-11-30

# Extractor selector: stub (default, offline) | azure (real API)
K1_EXTRACTOR=azure
```

**Which key?** Paste **Key 1**. Key 2 stays in your password manager as the rotation spare (see §4).

### Committed placeholders (`apps/api/.env.example`)

`.env.example` is committed and shows new contributors which variables to set. It contains placeholders only, never real values:

```ini
# apps/api/.env.example  (SAFE TO COMMIT)

AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=<your-subscription-key>
AZURE_DOCUMENT_INTELLIGENCE_API_VERSION=2024-11-30
K1_EXTRACTOR=stub
```

### Staging / production

Use the deployment platform's secret manager (Azure App Service "Application Settings", Kubernetes secrets, etc.). Inject the same four environment variables. Never bake the key into a container image, CI variable log, or config map that ends up in source control.

---

## 2. Verify the setup

### 2.1 Start the API

```powershell
# from repo root
npm install
npm run dev --workspace=@atlas/api
```

On startup, the API logs the selected extractor backend:

```text
INFO  k1.extractor backend=azure endpoint=https://atlaswc.cognitiveservices.azure.com/ apiVersion=2024-11-30
```

If you see `backend=stub`, the selector didn't pick up `K1_EXTRACTOR=azure` — double-check `.env` and restart.

### 2.2 Smoke test: upload a K-1

From the web app (`npm run dev --workspace=@atlas/web`, then browse to `http://localhost:5173`):

1. Log in as an Admin or User.
2. Create a Partnership (or pick an existing one) for tax year 2025.
3. Upload a K-1 PDF (the IRON TRIANGLE FUND sample works).
4. Wait ≤ 10 s. The K-1 transitions from `PROCESSING` to `NEEDS_REVIEW` or `READY_FOR_APPROVAL`.
5. Open the review workspace. You should see the extracted field values populated (partnership EIN, partner name, Box 1, Box 19 distribution, etc.) with confidence scores and clickable PDF source highlights.

### 2.3 Troubleshooting

| Symptom                                                                     | Likely cause                                                              | Fix                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| K-1 stuck in `PROCESSING` for > 60 s, then moves to `PROCESSING` with `PARSE_TIMEOUT` | Network egress blocked to `*.cognitiveservices.azure.com`                 | Check firewall / VPN. From the API host: `curl -I https://atlaswc.cognitiveservices.azure.com/` should return 200/404. |
| K-1 fails with `PARSE_AUTH`                                                 | Wrong key, revoked key, or Azure resource region mismatch                 | Re-copy Key 1 from Azure portal → Keys and Endpoint. Restart API.                                        |
| K-1 fails with `PARSE_SCHEMA_MISMATCH`                                      | Uploaded PDF is not a 1065 Schedule K-1 (e.g., an 1120-S K-1 or blank page) | Confirm the PDF is an IRS Schedule K-1 (Form 1065) Partner's Share.                                       |
| Zero field values appear after `NEEDS_REVIEW`                               | Extractor backend is still `stub` and the fixture PDF size is 0          | Confirm `K1_EXTRACTOR=azure` and restart API (cache is warmed on first call).                             |
| Key leaks into a log line during debugging                                  | Someone added a `log.info({ config })` accidentally                       | Remove the log statement; redact via `config.getRedactedCopy()` helper exposed in `config.ts`.             |

---

## 3. Switching back to the stub extractor

For offline dev, CI, and unit tests:

```ini
# apps/api/.env
K1_EXTRACTOR=stub
```

Restart. The stub deterministically produces the same 8 field values per upload (documented in [002-k1-ingestion/spec.md](../002-k1-ingestion/spec.md) Decision 8). No network call. No Azure cost.

---

## 4. Rotating the subscription key

Azure issues two keys specifically to enable zero-downtime rotation.

**Policy**: Rotate every 90 days, or immediately if a leak is suspected.

**Procedure**:

1. In `apps/api/.env` (or your production secret store), replace the `AZURE_DOCUMENT_INTELLIGENCE_KEY` value with **Key 2**.
2. Restart the API. Verify uploads still work.
3. In the Azure portal → your Document Intelligence resource → Keys and Endpoint, click **Regenerate Key 1**. Azure issues a new Key 1 immediately. Save the new value to your password manager as the next rotation spare.
4. 90 days later, rotate back: replace the env value with the new Key 1, restart, regenerate Key 2.

**Never** keep both keys in `.env` simultaneously. Only the active key belongs there.

---

## 5. Running the contract test (no network required)

The contract test uses a recorded fixture and runs fully offline:

```powershell
cd apps/api
npm test -- k1.azure-extractor.contract
```

Expected output:

```text
✓ maps a successful AnalyzeResult into all azureFieldMap entries
✓ formats currency fields to 2 decimals
✓ emits MISSING_FIELD issue for required fields absent from the fixture
✓ emits LOW_CONFIDENCE issue for fields with confidence < 0.5
✓ computes nextStatus = READY_FOR_APPROVAL when no issues are emitted
✓ never logs valueString / valueCurrency / valueNumber / content / valueDate
```

---

## 6. FAQ

### Can I use Managed Identity instead of a subscription key?

Deferred to a post-V1 hardening feature. For cloud deployments where the API host has a Managed Identity with `Cognitive Services User` role on the Document Intelligence resource, MI would remove the need to store any key at all. Tracked as a follow-up.

### Does the API store my raw Azure DI response?

No. V1 stores only the mapped `K1FieldValueRecord`s in Postgres plus a summary audit event (operation ID, field count, duration). To re-extract, re-submit the PDF via the UI "reparse" action.

### What if Azure is down?

The K-1 moves to `PROCESSING` with `parse_error_code = PARSE_NETWORK`. The UI exposes a reparse button that re-runs the pipeline. Consider setting `K1_EXTRACTOR=stub` temporarily if Azure is experiencing a prolonged outage and you need uploads to keep moving for manual data entry.

### How much does this cost?

At time of writing, prebuilt-tax.us.1065SchK1 is billed per page analyzed. Check the current Document Intelligence pricing page for your region. For a typical 1–3 page K-1 and a few hundred uploads per tax year, V1 costs are modest; this is tracked as part of platform cost monitoring, not this feature.
