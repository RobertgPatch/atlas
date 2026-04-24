# Contract: Azure Document Intelligence K-1 Extractor

**Scope**: Defines (a) the external HTTP contract with Azure Document Intelligence, (b) the internal `K1Extractor` interface that `azureExtractor` implements, and (c) the fixture format used by the offline contract test.

## 1. External contract — Azure Document Intelligence HTTP

### 1.1 Submit analyze request

```http
POST {endpoint}/documentintelligence/documentModels/prebuilt-tax.us.1065SchK1:analyze
      ?api-version={apiVersion}
      &stringIndexType=utf16CodeUnit
      &features=
Headers:
  Content-Type: application/pdf
  Ocp-Apim-Subscription-Key: {KEY}
Body: <raw PDF bytes>
```

**Variables**:

- `endpoint` = `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` (trailing slash trimmed)
- `apiVersion` = `AZURE_DOCUMENT_INTELLIGENCE_API_VERSION` (default `2024-11-30`)
- `KEY` = `AZURE_DOCUMENT_INTELLIGENCE_KEY`

**Expected success response**: `202 Accepted`

```http
HTTP/1.1 202 Accepted
Operation-Location: {endpoint}/documentintelligence/documentModels/prebuilt-tax.us.1065SchK1/analyzeResults/{operationId}?api-version={apiVersion}
apim-request-id: <uuid>
```

**Expected failure responses**:

| Status | Meaning                                      | Mapped internal code  |
| ------ | -------------------------------------------- | --------------------- |
| 400    | Invalid body / unsupported file format       | `PARSE_MODEL_ERROR`   |
| 401    | Missing / invalid subscription key           | `PARSE_AUTH`          |
| 403    | Key lacks permission for the model           | `PARSE_AUTH`          |
| 404    | Model / endpoint typo                        | `PARSE_MODEL_ERROR`   |
| 408    | Azure-side timeout                           | `PARSE_TIMEOUT`       |
| 429    | Throttled (retry-after respected once)       | `PARSE_NETWORK`       |
| 5xx    | Azure-side outage                            | `PARSE_NETWORK`       |
| Network error (no HTTP status)               | DNS/TCP/TLS failure   | `PARSE_NETWORK`       |

### 1.2 Poll analyze operation

```http
GET {operationLocation}
Headers:
  Ocp-Apim-Subscription-Key: {KEY}
```

Responses:

```jsonc
// Still running
{ "status": "running", "createdDateTime": "...", "lastUpdatedDateTime": "..." }

// Still running (queued)
{ "status": "notStarted", ... }

// Terminal success
{
  "status": "succeeded",
  "createdDateTime": "...",
  "lastUpdatedDateTime": "...",
  "analyzeResult": {
    "apiVersion": "2024-11-30",
    "modelId": "prebuilt-tax.us.1065SchK1",
    "stringIndexType": "utf16CodeUnit",
    "content": "...",
    "pages": [ { "pageNumber": 1, "width": 8.5, "height": 11, "unit": "inch", ... } ],
    "documents": [
      {
        "docType": "tax.us.1065SchK1",
        "boundingRegions": [ ... ],
        "fields": {
          "Partnership": { "type": "object", "valueObject": { "Name": { ... } } },
          "PartIII": { "type": "object", "valueObject": { "OrdinaryBusinessIncome": { ... } } }
          // ...
        },
        "confidence": 0.92
      }
    ]
  }
}

// Terminal failure
{
  "status": "failed",
  "error": { "code": "InvalidContent", "message": "..." }
}
```

**Polling policy** (implemented by SDK's `getLongRunningPoller().pollUntilDone()`):

- Interval: start at 1 s, capped at 2 s.
- Max wall-clock: 60 s (configurable via `pollUntilDone({ abortSignal })`).
- On `status = "failed"` with `error.code` containing `"Timeout"` → map to `PARSE_TIMEOUT`; otherwise `PARSE_MODEL_ERROR`.
- On `status = "succeeded"` but `documents[0].docType != "tax.us.1065SchK1"` → `PARSE_SCHEMA_MISMATCH`.
- On `status = "succeeded"` but `documents.length === 0` → `PARSE_SCHEMA_MISMATCH`.

### 1.3 Document field shape (Azure DI SDK type)

```ts
interface DocumentField {
  type: 'string' | 'number' | 'integer' | 'currency' | 'date' | 'time' | 'boolean' | 'array' | 'object' | 'address' | 'countryRegion' | 'selectionMark' | 'signature'
  valueString?: string
  valueNumber?: number
  valueInteger?: number
  valueCurrency?: { amount: number, currencySymbol?: string, currencyCode?: string }
  valueDate?: string       // ISO-8601
  valueBoolean?: boolean
  valueObject?: Record<string, DocumentField>
  valueArray?: DocumentField[]
  content?: string         // verbatim extracted text
  confidence?: number      // [0, 1]
  boundingRegions?: Array<{ pageNumber: number, polygon: number[] }>
  spans?: Array<{ offset: number, length: number }>
}
```

## 2. Internal contract — `K1Extractor` interface

Unchanged from V1. `azureExtractor` implements exactly the same interface as `stubExtractor`, so the pipeline caller is agnostic.

```ts
// apps/api/src/modules/k1/extraction/K1Extractor.ts  (existing, unchanged)

export interface K1ExtractContext {
  k1DocumentId: string
  storagePath: string      // abs path resolved via config.storageRoot
  pdfSizeBytes: number
}

export interface ExtractSourceLocation {
  page: number
  bbox: [number, number, number, number]  // [x, y, w, h] in PDF points
}

export interface ExtractFieldValue {
  fieldName: string
  label: string
  section: 'entityMapping' | 'partnershipMapping' | 'core'
  required: boolean
  rawValue: string | null
  confidenceScore: number | null
  sourceLocation: ExtractSourceLocation | null
}

export interface ExtractIssue {
  issueType: 'MISSING_FIELD' | 'LOW_CONFIDENCE' | 'OCR_WARNING'
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  message: string
  /** Canonical fieldName if issue is field-scoped; null for document-level issues */
  relatedFieldName: string | null
}

export interface ExtractSuccess {
  ok: true
  fieldValues: ExtractFieldValue[]
  issues: ExtractIssue[]
  nextStatus: 'NEEDS_REVIEW' | 'READY_FOR_APPROVAL'
}

export interface ExtractFailure {
  ok: false
  errorCode: 'PARSE_NETWORK' | 'PARSE_AUTH' | 'PARSE_TIMEOUT' | 'PARSE_MODEL_ERROR' | 'PARSE_SCHEMA_MISMATCH'
  errorMessage: string
}

export type ExtractResult = ExtractSuccess | ExtractFailure

export interface K1Extractor {
  readonly backend: 'stub' | 'azure'
  extract(ctx: K1ExtractContext): Promise<ExtractResult>
}
```

### Selector

```ts
// apps/api/src/modules/k1/extraction/index.ts  (new)

import { stubExtractor } from './stubExtractor.js'
import { createAzureExtractor } from './azureExtractor.js'
import { config } from '../../../config.js'

let cached: K1Extractor | undefined

export function getExtractor(): K1Extractor {
  if (cached) return cached
  switch (config.k1ExtractorBackend) {
    case 'azure':
      cached = createAzureExtractor()
      break
    case 'stub':
    default:
      cached = stubExtractor
      break
  }
  return cached
}
```

### Pipeline integration

`apps/api/src/modules/k1/k1.routes.ts::runParsePipeline` changes **one import line**:

```diff
- import { stubExtractor } from './extraction/stubExtractor.js'
+ import { getExtractor } from './extraction/index.js'
...
- const result = await stubExtractor.extract({ k1DocumentId, storagePath, pdfSizeBytes })
+ const result = await getExtractor().extract({ k1DocumentId, storagePath, pdfSizeBytes })
```

No other pipeline changes.

## 3. Test fixture format

### 3.1 Fixture file

- Path: `apps/api/tests/fixtures/azure-di-analyze-result.sample.json`
- Content: a single JSON document representing the Azure DI `AnalyzeResult` body (the content of the poll response's `analyzeResult` property).
- All string/number values that would contain PII (EINs, TINs, partner names, currency amounts from real capital accounts) are replaced with stable synthetic data so the fixture can be committed safely.
- Structure:

```jsonc
{
  "apiVersion": "2024-11-30",
  "modelId": "prebuilt-tax.us.1065SchK1",
  "stringIndexType": "utf16CodeUnit",
  "content": "... (trimmed) ...",
  "pages": [ { "pageNumber": 1, "width": 8.5, "height": 11, "unit": "inch", "words": [], "lines": [], "spans": [] } ],
  "documents": [
    {
      "docType": "tax.us.1065SchK1",
      "confidence": 0.94,
      "boundingRegions": [ { "pageNumber": 1, "polygon": [0,0, 8.5,0, 8.5,11, 0,11] } ],
      "fields": {
        "Partnership": { "type": "object", "valueObject": {
          "Identifier": { "type": "object", "valueObject": {
            "Tin": { "type": "string", "valueString": "12-3456789", "content": "12-3456789", "confidence": 0.99, "boundingRegions": [ ... ] }
          } },
          "Name": { "type": "string", "valueString": "IRON TRIANGLE FUND LP (synthetic)", "confidence": 0.98, "boundingRegions": [ ... ] }
        } },
        "PartIII": { "type": "object", "valueObject": {
          "OrdinaryBusinessIncome": { "type": "currency", "valueCurrency": { "amount": 12345.67, "currencyCode": "USD" }, "confidence": 0.91, "boundingRegions": [ ... ] },
          "Distributions": { "type": "currency", "valueCurrency": { "amount": 50000, "currencyCode": "USD" }, "confidence": 0.96, "boundingRegions": [ ... ] }
        } }
      }
    }
  ]
}
```

### 3.2 Contract test assertions

`apps/api/tests/k1.azure-extractor.contract.test.ts` MUST assert:

1. `mapAzureAnalyzeResult(fixture, { k1DocumentId: 'k1-test' })` returns `ok: true`.
2. Every canonical `fieldName` in `azureFieldMap` appears exactly once in `result.fieldValues`.
3. `partnership_ein.rawValue === '12-3456789'`, `partnership_name.rawValue` starts with `'IRON TRIANGLE FUND'`.
4. `box_1_ordinary_income.rawValue === '12345.67'` (currency formatted to 2 decimals).
5. `box_19_distributions.rawValue === '50000.00'`.
6. For every `entry.required` in the map, if the fixture provides the value, `rawValue !== null`; if missing, a `MISSING_FIELD` issue with `relatedFieldName === entry.canonicalName` is emitted.
7. `nextStatus === 'READY_FOR_APPROVAL'` when no issues were emitted for the fixture; `'NEEDS_REVIEW'` when a `MISSING_FIELD` or `LOW_CONFIDENCE` issue was emitted.
8. Logger mock assertion: no log call's serialized payload contains any `valueString`, `valueNumber`, `valueCurrency`, `content`, or `valueDate` from the fixture.

### 3.3 Fixture regeneration

A dev-only script (not run in CI) can regenerate the fixture from a real PDF:

```bash
# from repo root
cd apps/api
npm run capture-di-fixture -- ./path/to/sample.pdf
```

The script:

1. Submits the PDF to Azure DI using the active `.env` credentials.
2. Writes the `analyzeResult` to `tests/fixtures/azure-di-analyze-result.sample.json`.
3. Runs a regex-based scrubber over the file to replace any 9-digit TIN pattern (`\d{3}-\d{2}-\d{4}`), 9-digit EIN pattern (`\d{2}-\d{7}`), and legal entity names with synthetic values, preserving the JSON structure.

This script is intentionally not part of `npm test`.
