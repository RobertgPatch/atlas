# Implementation Plan: Azure Document Intelligence K-1 Extraction

**Branch**: `008-azure-document-intelligence` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-azure-document-intelligence/spec.md`

## Summary

Replace the V1 `stubExtractor` with a real extractor that calls Azure Document Intelligence's `prebuilt-tax.us.1065SchK1` model to populate `k1_field_values` with high-confidence partnership, partner, Part III box, distribution, liability, and capital-account values. Ship as a drop-in `K1Extractor` implementation behind an env-flag selector (`K1_EXTRACTOR=stub|azure`) so local dev, CI, and tests keep using the deterministic stub while staging/production flip to Azure. The integration is a single outbound HTTP client — no new infrastructure, no new database tables, no UI changes — and reuses 003's review workspace unchanged. Credentials (endpoint + subscription key + api version) are sourced exclusively from process environment variables documented in `apps/api/.env.example`; Key 1 is active and Key 2 is the rotation spare.

## Technical Context

**Language/Version**: TypeScript `~5.5`, Node.js 22 LTS
**Primary Dependencies**:
- `@azure-rest/ai-document-intelligence` v1.x (official Microsoft REST SDK; replaces legacy `@azure/ai-form-recognizer`). Provides a typed client, built-in long-running-operation poller, and TypeScript types for the 2024-11-30 API version
- Existing: Fastify 5, Zod 3, `pino`, `dotenv`
- No new test framework — Vitest with a recorded-response fixture for the mapping contract test
**Storage**: Unchanged. Feature writes to existing `k1_field_values` and `k1_issues` via `reviewRepository.insertFieldValue()` and `k1Repository.addIssue()`; no schema migration.
**Testing**: Vitest (existing). Add one contract test `apps/api/tests/k1.azure-extractor.contract.test.ts` that feeds a recorded Azure DI `AnalyzeResult` fixture JSON into the mapper and asserts the resulting `K1FieldValueRecord[]` + required-field issues. No live network in CI.
**Target Platform**: Linux-hosted Fastify API. Azure DI endpoint over HTTPS from the API host only (no browser call).
**Project Type**: Monorepo web application (unchanged). Touches only `apps/api/`.
**Performance Goals**:
- p95 end-to-end extraction < 10 s for single-page K-1
- p95 < 25 s for 3-page K-1
- No impact on upload endpoint p95 (extraction runs in the existing `setImmediate` worker)
**Constraints**:
- Keys MUST NOT appear in any artifact under source control
- Keys MUST NOT appear in logs or audit events (FR-010)
- CI test suite MUST run offline (FR-011)
- API selection is single env var (FR-012) for one-line local/prod switching
**Scale/Scope**: 1–5K K-1s per tenant per tax year. Azure DI prebuilt-tax.us.1065SchK1 quota: 15 transactions/second in S0 tier (sufficient for V1 single-tenant).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Primary constitutions used for gating:

- `specs/000-constitution.md` (system constitution)
- `specs/001-ui-constitution.md` (UI constitution, non-applicable here: no UI change)

### Pre-Phase 0 gate

1. **K-1 workflow invariants (000 §3)**: PASS — Lifecycle unchanged; extractor still emits `nextStatus ∈ {NEEDS_REVIEW, READY_FOR_APPROVAL}` per the existing `K1Extractor` contract.
2. **Data source hierarchy (000 §2)**: PASS — All Azure DI output lands in the `Parsed` tier (`rawValue`, `originalValue`, `normalizedValue`, `confidenceScore`). Reviewer corrections remain a separate tier via `reviewerCorrectedValue` set later in the review workspace.
3. **System integrity (000 §13)**: PASS — Failure cases emit `PARSE_*` error codes on the K-1 row and audit `k1.parse_failed`; success emits `k1.parse_completed`. No audit events gain raw extraction payloads (FR-010).
4. **Security + RBAC (000 §9)**: PASS — Extraction runs on the API host inside the already-authenticated upload pipeline; no new user-facing endpoint. Keys live only in environment. `.env.example` ships placeholders, never values.
5. **Observability**: PASS — Extractor logs structured fields (operation ID, status, duration, field count, avg confidence) via `pino`; PII-scrubbed (FR-010).

### Post-Phase 1 re-check

1. **Contract preserves `K1Extractor` interface**: PASS — `azureExtractor` implements the same `extract(ctx) → Promise<ExtractResult>` signature; the only caller (`runParsePipeline` in `k1.routes.ts`) needs only to call `getExtractor()` instead of importing `stubExtractor` directly.
2. **Mapping is testable offline**: PASS — `mapAzureAnalyzeResult(result, ctx)` is a pure function; the contract test imports it directly with a fixture JSON. Network client is separately injectable.
3. **Rotation path documented**: PASS — Quickstart documents the single-env-var rotation between Key 1 and Key 2.

No violations; no Complexity Tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/008-azure-document-intelligence/
├── plan.md                                   # This file
├── research.md                               # Phase 0: prebuilt model choice, SDK choice, auth approach
├── data-model.md                             # Phase 1: Azure DI fieldMap + K1FieldValueRecord mapping rules
├── quickstart.md                             # Phase 1: deployment walkthrough (keys, env, smoke test)
├── contracts/
│   └── azure-extractor.contract.md           # Phase 1: internal K1Extractor contract + Azure DI request/response shapes
├── spec.md
└── tasks.md                                  # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/api/
├── .env.example                              # Updated: add Azure DI env vars
├── src/
│   ├── config.ts                             # Extended: azureDocumentIntelligence { endpoint, apiVersion, key (never logged) }, k1Extractor backend selector
│   └── modules/
│       └── k1/
│           └── extraction/
│               ├── K1Extractor.ts            # Existing interface (unchanged)
│               ├── stubExtractor.ts          # Existing (unchanged; remains the CI/dev default)
│               ├── azureExtractor.ts         # NEW: calls Azure DI, maps to ExtractResult
│               ├── azureFieldMap.ts          # NEW: canonical fieldName → Azure DI field path + section + required + label
│               ├── mapAzureAnalyzeResult.ts  # NEW: pure mapping function (testable offline)
│               └── index.ts                  # NEW: getExtractor() selector reading K1_EXTRACTOR env
└── tests/
    ├── fixtures/
    │   └── azure-di-analyze-result.sample.json  # NEW: recorded AnalyzeResult JSON from the Iron Triangle Fund K-1
    └── k1.azure-extractor.contract.test.ts      # NEW: unit+contract test feeding fixture through mapAzureAnalyzeResult
```

**Files unchanged**:

- `apps/api/src/modules/k1/k1.routes.ts` — already calls the pipeline; swap `import { stubExtractor }` → `import { getExtractor }` in a single line edit during implementation (tracked as a task, not a structural change).
- `apps/web/**` — no changes. The review workspace already reads `k1_field_values` and renders the `PdfPanel` with bbox highlights.
- `packages/types/**` — no change to wire contracts.

## Phase 0: Research (→ research.md)

Unknowns resolved in `research.md`:

1. **Which Azure DI model?** Decision: `prebuilt-tax.us.1065SchK1` (GA in 2024-11-30). Alternatives considered: prebuilt-layout + custom model training (rejected: higher ops burden, needs labeled training set); prebuilt-tax.us.W2 pattern adaptation (rejected: K-1 is a different form family).
2. **Which SDK?** Decision: `@azure-rest/ai-document-intelligence` v1.x (official REST SDK, current at time of writing). Alternatives: raw `fetch` (rejected: we'd reimplement LRO polling and typing); legacy `@azure/ai-form-recognizer` (rejected: deprecated in favor of the REST SDK for the Document Intelligence API surface).
3. **Key storage strategy?** Decision: process environment vars loaded via `dotenv` in dev, injected via deployment secret manager in production. Two keys ship via a single `AZURE_DOCUMENT_INTELLIGENCE_KEY` variable; rotation swaps the value (Key 1 → Key 2) and restarts the API. Rationale: existing config module already uses this pattern (e.g., `DATABASE_URL`); no new secret system needed for V1.
4. **Failure mode taxonomy?** Decision: map Azure DI failures to five codes: `PARSE_NETWORK`, `PARSE_AUTH`, `PARSE_TIMEOUT`, `PARSE_MODEL_ERROR`, `PARSE_SCHEMA_MISMATCH`. All land in existing `k1_documents.parse_error_code` as strings — no schema change.
5. **PII logging avoidance?** Decision: structured logger drops `content`, `valueString`, `valueNumber` from any Azure DI response before serialization. Only metadata (field count, avg confidence, operation ID, duration, HTTP status) is logged.
6. **How to handle reparse?** Existing `reparseHandler` in `k1.routes.ts` already works — it calls `runParsePipeline`, which now uses `getExtractor()`. No new endpoint.

**Output**: `research.md` with all decisions + rationale + alternatives.

## Phase 1: Design & Contracts (→ data-model.md, contracts/, quickstart.md)

### Data model deltas

No database schema change. The feature defines **two** application-level contracts:

1. **`azureFieldMap`** — a typed constant array of `{ canonicalName, label, section, required, azurePath }` tuples covering the SC-001 required field set. `azurePath` is a dotted path into the Azure DI `AnalyzeResult.documents[0].fields` object (e.g., `PartnershipName.valueString`, `PartIII.Box1.valueCurrency.amount`).
2. **`mapAzureAnalyzeResult(result, ctx) → ExtractResult`** — the pure mapping function's input/output shape. Documented as a contract in `contracts/azure-extractor.contract.md`.

Storage writes (unchanged): `reviewRepository.insertFieldValue(...)` and `k1Repository.addIssue(...)`.

### Contracts

`contracts/azure-extractor.contract.md` documents:

- The Azure DI HTTP request shape: method, URL pattern, headers, body
- The Azure DI HTTP response shapes: 202 (Operation-Location header), 200 (AnalyzeResult), 4xx, 5xx
- The error-code mapping table (HTTP status + Azure error code → `PARSE_*` internal code)
- The internal `K1Extractor` interface signature that `azureExtractor` implements (no change)
- The fixture file format used by the contract test

No OpenAPI yaml is needed here because this feature does not introduce a new public HTTP endpoint — it consumes an external one and satisfies an internal TypeScript interface.

### Quickstart

`quickstart.md` is the operator-facing onboarding guide. Covers:

1. Setting up the Azure DI resource (already done by the user, captured for repeatability).
2. Placing `AZURE_DOCUMENT_INTELLIGENCE_KEY` = "Key 1" in `apps/api/.env` (never committed).
3. Setting `K1_EXTRACTOR=azure` to activate.
4. Running the sample upload and verifying populated `k1_field_values`.
5. Rotating to Key 2.
6. Swapping back to `K1_EXTRACTOR=stub` for offline dev.

### Agent context update

Updates the `<!-- SPECKIT START -->` marker block in `.github/copilot-instructions.md` to point at this feature's artifacts.

## Phase 2: Task Generation Approach

*Not produced by `/speckit.plan`. The `/speckit.tasks` command will generate `tasks.md`. Expected high-level task categories:*

1. **Env + config** (1–2 tasks): extend `config.ts`, update `.env.example`
2. **Extraction module** (4–5 tasks): `azureFieldMap`, `mapAzureAnalyzeResult`, `azureExtractor`, `extraction/index.ts` selector, wire into `runParsePipeline`
3. **Testing** (2 tasks): record sample AnalyzeResult fixture, add contract test
4. **Documentation** (1 task): update `apps/api/README.md` with the env-flag switch

## Progress Tracking

- [x] Phase 0 (research) planned
- [x] Phase 1 (design + contracts) planned
- [ ] Phase 0 (research) executed → research.md
- [ ] Phase 1 (design) executed → data-model.md, contracts/, quickstart.md
- [ ] Agent context updated
- [ ] Phase 2 tasks generated (via `/speckit.tasks`)
