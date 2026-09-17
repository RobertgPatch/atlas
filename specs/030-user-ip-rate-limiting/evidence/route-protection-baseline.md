# Route protection baseline

**Generated**: 2026-08-29  
**Command**: `node scripts/security/generate-route-protection-inventory.mjs`  
**Source**: Fastify registration from `apps/api/dist/app.js`

## Bounded inventory

- Declared external routes: **125**
- Unique canonical route keys: **125**
- Routes missing protection policy: **0**

| Existing route class | Count |
|---|---:|
| `ADMIN_WRITE` | 48 |
| `AUTHENTICATED_READ` | 33 |
| `AUTH_ATTEMPT` | 3 |
| `BUSINESS_WRITE` | 13 |
| `DATABASE_HEAVY_READ` | 12 |
| `DOCUMENT_DOWNLOAD` | 1 |
| `EXPORT_DOWNLOAD` | 4 |
| `EXTERNAL_PROVIDER` | 3 |
| `INTERNAL_SCHEDULER` | 1 |
| `K1_UPLOAD_ADMISSION` | 4 |
| `PAID_EXTRACTION` | 2 |
| `PUBLIC_HEALTH` | 1 |

## Authentication routes

| Method/path | Existing owner | Authentication | Existing class | Cost |
|---|---|---|---|---|
| `POST /v1/auth/login` | `platform-security` | public | `AUTH_ATTEMPT` | password hash |
| `POST /v1/auth/mfa/enroll/complete` | `platform-security` | public | `AUTH_ATTEMPT` | password hash |
| `POST /v1/auth/mfa/verify` | `platform-security` | public | `AUTH_ATTEMPT` | password hash |
| `GET /v1/auth/session` | `platform-security` | session | `AUTHENTICATED_READ` | request |
| `POST /v1/auth/session/extend` | `platform-security` | session | `AUTHENTICATED_READ` | request |
| `POST /v1/auth/logout` | `platform-security` | session | `AUTHENTICATED_READ` | request |

The three public auth-work routes are the required initial members of the canonical `auth` risk class. Future password recovery or authentication-work routes must fail inventory validation until they join the same class and WAF scope.

## K-1 bearer-capability and paid routes

| Method/path | Existing class | Capability/cost boundary |
|---|---|---|
| `POST /v1/k1-documents` | `K1_UPLOAD_ADMISSION` | file, byte, storage-byte-day admission |
| `POST /v1/k1-ingestion-batches` | `K1_UPLOAD_ADMISSION` | file, byte, storage-byte-day admission |
| `POST /v1/k1-ingestion-batches/:batchId/complete-uploads` | `K1_UPLOAD_ADMISSION` | completes issued upload capabilities |
| `PUT /v1/k1-ingestion-items/:itemId/local-upload` | `K1_UPLOAD_ADMISSION` | local-only upload path |
| `POST /v1/k1-documents/:k1DocumentId/reparse` | `PAID_EXTRACTION` | document/page/provider/queue admission |
| `POST /v1/k1-documents/:k1DocumentId/retry-extraction` | `PAID_EXTRACTION` | document/page/provider/queue admission |

K-1 capability issuance is in feature 030 scope even though AWS issuance remains disabled by default. The final policy must enforce source, validated user, deployment tenant, exact operation/byte/type admission, short TTL, signed conditional write, and replay safety before a URL can be returned.

## Review findings

- Coverage is complete on the existing registry: 125 declared and 125 classified.
- Existing class names are pre-feature-030 names and need canonical aggregation into `liveness`, `auth`, `general_api`, `heavy_read`, `download`, `write`, `paid_work`, and `internal` without losing the more specific policy key/cost metadata.
- The generator's final prose says the inventory changed from 141 to 144 even though the generated counters report 125. That stale sentence must be removed or derived during T012.
- The baseline does not yet prove independent source and validated-user decisions; that is the behavior introduced by feature 030.
