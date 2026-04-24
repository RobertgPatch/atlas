# Phase 0 Research: Azure Document Intelligence K-1 Extraction

**Input**: [spec.md](./spec.md) and [plan.md](./plan.md)
**Output target**: resolve every `NEEDS CLARIFICATION` before Phase 1.

## Decision 1: Which Azure DI model?

**Decision**: Use the prebuilt model `prebuilt-tax.us.1065SchK1` exclusively for V1.

**Rationale**:

- Microsoft ships this model pretrained specifically for IRS Schedule K-1 (Form 1065). It returns a structured `Tax.US.1065SchK1` document schema with first-class fields for Partnership info, Partner info, Part III boxes 1–22, liability shares, and capital account analysis — exactly the fields in SC-001.
- No training data, no labeling effort, no model management.
- GA on the `2024-11-30` API version, which is the current stable version at the time of this plan.
- The sample attached to this feature (IRON TRIANGLE FUND LP K-1) is a standard 2025 IRS Schedule K-1 (Form 1065) — the exact form family this model targets.

**Alternatives considered**:

- **`prebuilt-layout` + `prebuilt-document`** — rejected. Would require us to re-implement K-1 field semantics (which box is ordinary income vs. distributions) on top of raw layout output. Duplicates what Microsoft already ships.
- **`prebuilt-invoice` / `prebuilt-contract`** — rejected. Not applicable; wrong schema family.
- **Custom model (neural)** — rejected for V1. Requires ≥ 5 labeled training samples per form variant and ongoing model lifecycle management. Could be revisited as a follow-up feature if the prebuilt model's accuracy falls below our SC-001 threshold on real-world samples.
- **`prebuilt-tax.us.1120S.ScheduleK1` / `prebuilt-tax.us.1041.ScheduleK1`** — deferred. These are different form families (S-corp and trust K-1s) and will be added in a follow-up feature once the 1065 integration is proven.

## Decision 2: Which client SDK?

**Decision**: `@azure-rest/ai-document-intelligence` v1.x.

**Rationale**:

- Current, Microsoft-supported TypeScript SDK for the Document Intelligence API surface (2024+).
- Typed client + built-in long-running-operation (LRO) poller. We submit the PDF via `client.path(...).post()`, receive an `Operation-Location` header, then `getLongRunningPoller(client, initialResponse).pollUntilDone()` returns the final `AnalyzeResult`.
- TypeScript types for `AnalyzeResult`, `DocumentField`, etc. mean our mapping layer gets compile-time safety.
- Single transitive dependency footprint (depends on `@azure/core-*` packages already well-audited).

**Alternatives considered**:

- **Raw `fetch` / `undici`** — rejected. We'd reimplement the LRO poll loop, retry policy, and response typing. Operationally brittle.
- **Legacy `@azure/ai-form-recognizer`** — rejected. Deprecated in favor of the REST SDK for the Document Intelligence API. Still works but Microsoft documents the REST SDK as the recommended surface for new integrations.
- **`axios` + hand-rolled types** — rejected. No benefit over the official SDK; adds a dep we don't otherwise need.

## Decision 3: Credential / key storage strategy

**Decision**: Load from process environment via the existing `dotenv` config pattern. One active key at a time; rotation = swap the value and restart.

**Specifics**:

- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` (e.g., `https://atlaswc.cognitiveservices.azure.com/`) — non-secret, still sourced from env for environment parity (local vs. prod).
- `AZURE_DOCUMENT_INTELLIGENCE_KEY` — the currently-active subscription key. Start with **Key 1** in `.env`. When rotating, replace with **Key 2** and restart. Azure keeps both keys valid indefinitely, so rotation has zero downtime.
- `AZURE_DOCUMENT_INTELLIGENCE_API_VERSION` — defaults to `2024-11-30`; surfaced as an env var so we can pin-forward without code changes.
- `K1_EXTRACTOR` — `stub` (default, for dev + CI) | `azure` (for staging + prod). Central selector in `apps/api/src/modules/k1/extraction/index.ts`.

**Rationale**:

- Matches the existing pattern for `DATABASE_URL`, `TOTP_ISSUER`, etc. — no new secret-management system to introduce for V1.
- Two-key provisioning (Key 1 + Key 2) exists specifically to enable zero-downtime rotation. V1 uses one key at a time; Key 2 is the "in the drawer" rotation spare.
- `.gitignore` already excludes `.env` and `.env.*` (except `.env.example`), so accidental commit of a real key is structurally prevented.

**Alternatives considered**:

- **Azure Key Vault / Managed Identity** — deferred. Most appropriate for cloud-hosted production but adds setup complexity that's unnecessary for the V1 single-tenant deploy. Documented as a post-V1 hardening step.
- **Both keys loaded simultaneously with failover** — rejected for V1. Adds complexity (retry-with-other-key state machine) for a marginal availability gain. If Azure revokes Key 1 unexpectedly, a restart with Key 2 is seconds; acceptable for V1.

## Decision 4: Failure mode taxonomy

**Decision**: Map all Azure DI failures onto five internal codes stored in `k1_documents.parse_error_code`:

| Internal code            | Trigger                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `PARSE_NETWORK`          | TCP / DNS / TLS failure, ETIMEDOUT, socket hangup before any HTTP status received.         |
| `PARSE_AUTH`             | HTTP 401 or 403 from Azure DI. Typically wrong / revoked / not-yet-active key.             |
| `PARSE_TIMEOUT`          | Wall-clock > 60 s during the LRO poll loop, or Azure returns `status: "failed"` with a timeout error.  |
| `PARSE_MODEL_ERROR`      | Azure returns `status: "failed"` with a non-timeout error (corrupt PDF, unsupported page). |
| `PARSE_SCHEMA_MISMATCH`  | `status: "succeeded"` but the returned document type is not `tax.us.1065SchK1`, or zero fields were extracted for a required-field subset. |

All codes feed the existing `k1.parse_failed` audit event and the UI re-parse flow — no code change downstream.

## Decision 5: PII / sensitive-value logging

**Decision**: Structured logger emits ONLY metadata. The Azure DI response JSON MUST NOT be serialized to logs.

**Safe to log** (non-exhaustive):

- Operation ID (UUID from `Operation-Location` URL)
- HTTP status codes
- Elapsed time per phase (submit, poll, map)
- PDF byte size
- Field count returned, required-field coverage count
- Average and minimum confidence scores across mapped fields

**Forbidden in logs**:

- Any `content`, `valueString`, `valueNumber`, `valueCurrency.amount`, `valueDate` fields
- Partnership EIN, partner TIN, or any capital-account figure
- The PDF bytes or filename

Implementation: the extractor's `pino` child logger has a hard-coded `redact` list; unit test asserts the logger mock never receives any of the forbidden keys.

## Decision 6: Reparse / retry behavior

**Decision**: No new endpoint. Reparse continues to go through the existing `POST /v1/k1-documents/:id/reparse` handler, which is a thin wrapper over `runParsePipeline`. Because the pipeline now calls `getExtractor()`, reparse automatically uses whichever backend is configured.

**Retry policy inside the extractor**: one automatic retry on `PARSE_NETWORK` only (exponential backoff 500 ms → 2 s). All other failure codes fail fast; the user re-triggers through the UI's reparse action.

## Decision 7: Mapping Azure DI bounding polygons → our `sourceLocation`

**Decision**: Azure DI returns `boundingRegions: [{ pageNumber, polygon: [x1,y1, x2,y2, x3,y3, x4,y4] }]`. We normalize to our existing `K1SourceLocation = { page, bbox: [x, y, w, h] }` by:

- `page = boundingRegions[0].pageNumber` (1-indexed in both systems — same convention).
- `bbox = [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)]`.
- Units: Azure DI returns inches when `stringIndexType=utf16CodeUnit` is used for `analyzeResult`; we convert to PDF points (`× 72`) to match our web `PdfPanel` highlight renderer which expects PDF-point coordinates.

## Decision 8: Test strategy with no live network

**Decision**: Ship a recorded `AnalyzeResult` JSON fixture captured from a one-time manual call to the Iron Triangle Fund sample. The pure mapping function `mapAzureAnalyzeResult(result, ctx)` is called directly in the contract test. The HTTP client is wired in the extractor's constructor so tests can inject a stub for end-to-end integration coverage if desired.

**Fixture regeneration**: a standalone script `apps/api/src/modules/k1/extraction/_captureFixture.ts` (dev-only, gitignored or behind `// eslint-disable-next-line` markers) that submits a local PDF to Azure DI and saves the redacted JSON. Real PII-bearing values are regex-scrubbed before save.
