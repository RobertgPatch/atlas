# Tasks: Azure Document Intelligence K-1 Extraction

**Feature**: `008-azure-document-intelligence`
**Input**: Design documents in [specs/008-azure-document-intelligence/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/azure-extractor.contract.md](./contracts/azure-extractor.contract.md), [quickstart.md](./quickstart.md)

**Tests**: Included — FR-014 explicitly requires a contract test against a recorded Azure DI response fixture.

**Organization**: Single primary user story (Admin/User uploads a K-1 → system extracts all SC-001 fields with confidence + bbox). Scope is one extractor backend swap; all work rolls up under US1. A Polish phase captures docs + cross-cutting concerns.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1); setup / foundational / polish phases have no story label

## Path Conventions

Monorepo web application. API work lives under `apps/api/`. No web changes.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the Azure DI SDK and scaffold environment variable placeholders.

- [X] T001 Install `@azure-rest/ai-document-intelligence@^1.0.0` in `apps/api/package.json` via `npm install @azure-rest/ai-document-intelligence -w @atlas/api`
- [X] T002 Add commented placeholders for `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`, `AZURE_DOCUMENT_INTELLIGENCE_API_VERSION` (default `2024-11-30`), and `K1_EXTRACTOR` (default `stub`) in `apps/api/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend config + define the extractor selector seam so the pipeline can swap backends via env flag. MUST complete before any US1 task.

- [X] T003 Extend config schema in `apps/api/src/config.ts` to add `azureDocumentIntelligence: { endpoint: string, key: string, apiVersion: string }` (from the three env vars, with `apiVersion` defaulting to `2024-11-30`) and `k1ExtractorBackend: 'stub' | 'azure'` (from `K1_EXTRACTOR`, default `stub`); ensure the redacted-copy helper returns `key: '***'`
- [X] T004 Extend the existing `K1Extractor` interface in `apps/api/src/modules/k1/extraction/K1Extractor.ts` to add the `readonly backend: 'stub' | 'azure'` property; set `stubExtractor.backend = 'stub'` in `apps/api/src/modules/k1/extraction/stubExtractor.ts`
- [X] T005 Create extractor selector `apps/api/src/modules/k1/extraction/index.ts` exporting `getExtractor(): K1Extractor` that reads `config.k1ExtractorBackend`, returns `stubExtractor` for `'stub'`, lazy-constructs `createAzureExtractor()` for `'azure'`, and caches the result for subsequent calls; log `k1.extractor backend=... endpoint=... apiVersion=...` exactly once on first call
- [X] T006 Add a stub `createAzureExtractor()` in `apps/api/src/modules/k1/extraction/azureExtractor.ts` that throws `Error('Azure extractor not yet implemented')` so `getExtractor()` compiles and T005 can be wired/tested before the real client lands

**Checkpoint**: Config loads the new env vars; `getExtractor()` returns the stub today and will return the Azure impl once US1 lands.

---

## Phase 3: User Story 1 - Azure DI K-1 Extraction (Priority: P1) 🎯 MVP

**Goal**: On K-1 upload, call Azure DI `prebuilt-tax.us.1065SchK1`, map the response into `K1FieldValueRecord[]` + issues, persist via the review repository, and transition the K-1 to `NEEDS_REVIEW` or `READY_FOR_APPROVAL`. No web changes.

**Independent Test**: Set `K1_EXTRACTOR=azure` + valid endpoint/key in `apps/api/.env`, start the API, upload the IRON TRIANGLE FUND sample K-1 PDF via the review workspace, and within ~10 s see partnership EIN, partnership name, partner name, Box 1, Box 19, and capital account fields populated in `k1_field_values` with confidence scores and source bboxes; for any missing required field a `MISSING_FIELD` issue is created.

### Tests for User Story 1 (written FIRST; MUST fail before implementation)

- [X] T007 [P] [US1] Create recorded Azure DI fixture `apps/api/tests/fixtures/azure-di-analyze-result.sample.json` matching the contract in [contracts/azure-extractor.contract.md §3](./contracts/azure-extractor.contract.md) — synthetic Iron Triangle Fund data covering Partnership, Partner, PartIII boxes 1/2/3/4a/4b/4c/5/6a/6b/6c/7/19/20, liabilities, capital account; include confidence scores and boundingRegions (inches)
- [X] T008 [P] [US1] Create contract test `apps/api/tests/k1.azure-extractor.contract.test.ts` that loads the fixture and asserts per [contracts/azure-extractor.contract.md §3.2](./contracts/azure-extractor.contract.md) — every `azureFieldMap` entry appears exactly once; currency fields formatted to 2 decimals; `MISSING_FIELD` issue for required fields absent from fixture; `LOW_CONFIDENCE` issue for `confidence < 0.5`; `nextStatus` logic; logger mock never receives PII keys (`valueString`, `valueNumber`, `valueCurrency`, `content`, `valueDate`)

### Implementation for User Story 1

- [X] T009 [P] [US1] Create `apps/api/src/modules/k1/extraction/azureFieldMap.ts` exporting the typed `azureFieldMap: readonly AzureFieldMapEntry[]` constant with all ~55 entries from [data-model.md](./data-model.md) (canonicalName, label, section, required, azurePath, valueKind); also export `AzureFieldMapEntry` and `K1AzureValueKind` types
- [X] T010 [US1] Create pure mapping function `apps/api/src/modules/k1/extraction/mapAzureAnalyzeResult.ts` exporting `mapAzureAnalyzeResult(result, ctx): ExtractResult` per [data-model.md Mapping Rules](./data-model.md) — dotted-path resolver against `result.documents[0].fields`, value projection by `valueKind`, polygon→bbox conversion (inches × 72 → PDF points, `[minX, minY, maxX-minX, maxY-minY]`), issue emission for missing required + low-confidence fields, invariant asserts (unique fieldName, valid section, confidence ∈ [0,1], bbox w/h > 0), `nextStatus` computation (depends on T009)
- [X] T011 [US1] Replace the stub in `apps/api/src/modules/k1/extraction/azureExtractor.ts` with the real HTTP client per [contracts/azure-extractor.contract.md §1](./contracts/azure-extractor.contract.md) — construct client via `DocumentIntelligence(config.azureDocumentIntelligence.endpoint, { key: ... })`, submit PDF via `client.path('/documentModels/{modelId}:analyze', 'prebuilt-tax.us.1065SchK1').post({ contentType: 'application/pdf', body: pdfBuffer, queryParameters: { 'api-version': config.azureDocumentIntelligence.apiVersion, stringIndexType: 'utf16CodeUnit' } })`, poll via `getLongRunningPoller(client, initial).pollUntilDone({ abortSignal: AbortSignal.timeout(60_000) })`, delegate mapping to `mapAzureAnalyzeResult`, translate HTTP/poll failures to the five `PARSE_*` codes from [research.md Decision 4](./research.md), perform one retry with exponential backoff (500ms→2s) on `PARSE_NETWORK` only (depends on T003, T004, T010)
- [X] T012 [US1] Configure PII-redacted `pino` child logger in `apps/api/src/modules/k1/extraction/azureExtractor.ts` — use `pino.child({}, { redact: { paths: ['*.valueString', '*.valueNumber', '*.valueCurrency', '*.content', '*.valueDate', '*.valueObject', '*.valueArray'], remove: true } })`; log only operation ID, HTTP status, submit/poll/map durations, pdf byte size, field count, required-field coverage, avg + min confidence (depends on T011)
- [X] T013 [US1] Read the PDF bytes in `azureExtractor.extract(ctx)` from `ctx.storagePath` resolved via `path.resolve(config.storageRoot, ctx.storagePath)` and pass the `Buffer` to the Azure client; ensure no fs read errors leak raw file content into logs (depends on T011)
- [X] T014 [US1] Wire extractor selector into the ingestion pipeline in `apps/api/src/modules/k1/k1.routes.ts::runParsePipeline` — replace `import { stubExtractor } from './extraction/stubExtractor.js'` with `import { getExtractor } from './extraction/index.js'` and swap the `stubExtractor.extract(...)` call to `getExtractor().extract(...)`; no other changes to the pipeline body (depends on T005, T011)
- [X] T015 [US1] Run the contract test from T008 and confirm it passes against the real `mapAzureAnalyzeResult` + `azureFieldMap`; adjust mapping edge cases (e.g., null `valueObject` parents, missing `boundingRegions`) as needed until green (depends on T008, T009, T010)

**Checkpoint**: User Story 1 is fully functional. With `K1_EXTRACTOR=azure` + valid credentials, K-1 uploads produce populated `k1_field_values` within SC-003 latency; with `K1_EXTRACTOR=stub` behavior is unchanged from today.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, operator onboarding, and smoke-test validation.

- [X] T016 [P] Document the extractor backend switch and env vars in `apps/api/README.md` — link to [quickstart.md](./quickstart.md) for full onboarding
- [X] T017 Create dev-only fixture regeneration script `apps/api/src/modules/k1/extraction/_captureFixture.ts` per [research.md Decision 8](./research.md) + [contracts/azure-extractor.contract.md §3.3](./contracts/azure-extractor.contract.md) — submits a local PDF, scrubs TIN/EIN patterns and legal-name tokens, writes to `apps/api/tests/fixtures/azure-di-analyze-result.sample.json`; expose via `npm run capture-di-fixture` script in `apps/api/package.json` (not part of `npm test`)
- [ ] T018 Run the [quickstart.md](./quickstart.md) end-to-end smoke test against the real Azure DI resource with Key 1 in `apps/api/.env`, upload the Iron Triangle Fund sample K-1, and verify all SC-001 fields populate in `k1_field_values` with non-null `confidence_score` and `source_location`; record any deviations as follow-up issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup (T001–T002)**: No dependencies; can start immediately.
- **Phase 2 Foundational (T003–T006)**: Requires T001 (SDK installed). BLOCKS Phase 3.
- **Phase 3 US1 (T007–T015)**: Requires Phase 2 complete. T007 + T008 (tests + fixture) should be written before T009–T013 (implementation) per FR-014. T015 is the green-bar validation.
- **Phase 4 Polish (T016–T018)**: Requires Phase 3 complete. T018 additionally requires valid Azure DI credentials in `.env`.

### Task-Level Dependencies

- T003 → T005, T011 (config consumed by selector and client)
- T004 → T005 (selector returns values typed by the interface extension)
- T005, T006 → T014 (selector must exist before pipeline wires it)
- T007 → T008, T015 (fixture is the test input)
- T009 → T010 (mapper consumes the field map)
- T010 → T011 (extractor delegates mapping)
- T011 → T012, T013 (logger + fs read live inside the extractor)
- T010, T009, T008 → T015 (green-bar)
- T011, T005 → T014 (pipeline wiring)

### Parallel Opportunities

- **Within Phase 2**: T004 is parallel to T003 (different files). T006 is parallel to T005 but both must merge before Phase 3.
- **Within Phase 3**: T007 (fixture JSON) and T008 (test file) are both `[P]` and can be authored concurrently. T009 (`azureFieldMap`) is `[P]` and can start as soon as T004 lands. T010, T011, T012, T013 touch overlapping files inside the extractor module and must serialize.
- **Phase 4**: T016 is `[P]` against T017 (different files).

## Parallel Example: Phase 3 kickoff

```bash
# After Phase 2 is green, these three can proceed simultaneously on different branches:
# Dev A: T007 — record + scrub the Azure DI fixture JSON
# Dev B: T008 — write the contract test (red state until T009–T010 land)
# Dev C: T009 — author the typed azureFieldMap constant
# Converge on T010 → T011 → T012 → T013 → T014 → T015
```

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (T001–T015)** constitute the MVP. At MVP completion:

- Operator flips `K1_EXTRACTOR=azure` in `apps/api/.env` (Key 1) and restarts.
- Uploads produce populated `k1_field_values` with confidence + bbox, consumable by the existing 003 review workspace with zero UI changes.
- Reparse action continues to work (same pipeline, new backend behind the flag).
- Offline dev + CI remain green because `K1_EXTRACTOR=stub` is the default.

### Incremental delivery

1. Ship Phase 2 alone first (tiny PR): config + selector + stub-only behavior. Risk: near-zero; verifies the seam compiles and CI stays green.
2. Ship Phase 3 tests (T007, T008) next, red-bar, as a separate PR to lock the mapping contract.
3. Ship Phase 3 implementation (T009–T015) as one PR; CI passes via the offline fixture.
4. Ship Phase 4 polish after staging smoke test (T018) confirms SC-001/SC-003.

### Task format validation

All 18 tasks above follow the strict checklist format: `- [ ] T### [P?] [US1?] Description with absolute file path`. Setup, Foundational, and Polish phases have no story label. Phase 3 tasks all carry `[US1]`. Parallel-safe tasks carry `[P]`.
