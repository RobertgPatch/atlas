# Security Audit Follow-up - 2026-08-02

## Executive summary

This follow-up audited the hardened `agent/security-audit` branch because `main`
has not advanced since the 2026-07-30 audit and the original draft security PR
is still open. The review found one additional critical broken-access-control
boundary in Plaid account management and one critical repository data-exposure
issue. The Plaid boundary is fixed in this branch. The tracked K-1 document has
been removed, but its Git history still requires an administrator-led purge and
exposure review.

The follow-up also fixed a rate-limit bypass/memory-growth issue, CSV formula
injection, MIME-only PDF validation, inactive-account session acceptance,
reinvitation-based role/status mutation, and an internal error response leak.

See `docs/security/2026-07-30-security-audit.md` for the preceding authentication,
session, configuration, dependency, storage-path, and Terraform findings.

## Scope and method

The review covered:

- every Fastify route and its session, role, entity, K-1, and partnership scope;
- Plaid connection ownership, account selection, clearing, holdings visibility,
  manual refresh, scheduled refresh, and persistence behavior;
- session lifecycle and admin invitation behavior;
- file upload boundaries, local storage paths, PDF serving, workbook parsing,
  and export generation;
- dynamic SQL construction and user-controlled sort/filter inputs;
- API error handling, rate limiting, CORS, caching, and security headers;
- Terraform networking, CloudFront, WAF, ALB, ECS, RDS, IAM, and secrets;
- tracked secret/document patterns and sensitive binary artifacts;
- production dependency advisories from `npm audit --omit=dev`.

Static checks included route enumeration, dangerous-API/pattern searches, SQL
interpolation review, tracked-secret pattern searches, and Git-history searches
for common private-key and provider-token formats. The tracked PDF was inspected
only for the presence of tax-document and sensitive-identifier patterns; no
personal values were printed into audit output.

## Findings and disposition

### Critical - Plaid owner authorization missing from management and refresh

**Status: fixed in this branch.**

Plaid connections had an `owner_user_id`, and consolidated-report reads applied
owner visibility for non-Admins. However, the account-management handlers called
global repository methods. Any authenticated user could:

- enumerate all connected investment accounts and display metadata;
- change selection state for every owner's accounts;
- delete every Plaid connection, account, holding, and snapshot;
- trigger a manual refresh using every owner's selected account and access token.

The fix passes one owner/admin visibility context through list, selection, clear,
and manual-refresh operations. Non-Admin clearing deletes only caller-owned
connections and holdings, scrubs those account IDs from shared snapshot/attempt
metadata, and preserves other owners' data. Manual refreshes select only visible
accounts and connections. Missing connection ownership now fails closed, and an
existing Plaid Item cannot be reassigned to a different owner in memory or by the
database upsert.

Regression tests cover cross-owner listing, selection mutation, deletion,
refresh selection, and Plaid Item reassignment.

### Critical - Real K-1 tax document committed to Git

**Status: removed from the branch; history remediation remains required.**

The repository tracked `/new_k1.pdf` from commit `36e35c3`. The file is a Schedule
K-1 with an unmasked tax-identifier pattern and an address and is not marked as a
sample, dummy, or filing example. A tracked live-check script also referenced the
local document and embedded development credentials.

This branch deletes both artifacts and adds narrow ignore rules. That stops future
branches from carrying the working-tree copy, but it does not delete the blob from
Git history or existing clones. Required follow-up:

1. Treat the document as exposed to every person and system with repository read
   access since commit `36e35c3`.
2. Confirm the affected taxpayer/partnership and execute the organization's tax
   data incident process; determine whether identifier replacement, monitoring,
   notification, or counsel is required.
3. Purge the blob from all refs with `git filter-repo` or GitHub's sensitive-data
   removal process, force-update protected refs under a coordinated maintenance
   window, invalidate caches/forks where possible, and require fresh clones.
4. Add repository secret/PII scanning that rejects unapproved tax forms and other
   financial source documents before commit.

### High - Rate limit bypass and unbounded bucket growth

**Status: fixed in this branch.**

The application keyed rate-limit buckets by the raw request path and never removed
expired buckets. An attacker could vary arbitrary or parameterized paths to obtain
a fresh request budget and grow the process map indefinitely. The limiter now uses
Fastify's normalized route pattern, isolates buckets per application instance, and
periodically removes expired entries. A regression test verifies that unique
unmatched URLs share the same route bucket.

The limiter remains process-local and should be replaced with an authoritative
edge/shared limiter before horizontal scaling.

### High - Spreadsheet formula injection in CSV exports

**Status: fixed in this branch.**

K-1, partnership, and report exports quoted delimiters but allowed user-controlled
strings beginning with spreadsheet formula prefixes. Opening a CSV in Excel or a
similar client could interpret entity names, partnership names, notes, or imported
descriptions as formulas. All CSV producers now use one escaping function that
prefixes dangerous string cells with an apostrophe while preserving numeric values.

### Medium - Non-PDF content accepted by the PDF ingestion path

**Status: fixed in this branch.**

The upload endpoint trusted the multipart `Content-Type` value. An authenticated
caller could store and submit arbitrary bytes to the PDF extraction pipeline. The
endpoint now requires the PDF header before storage, audit creation, or extraction.
This is a boundary check, not a complete malicious-PDF defense; parser isolation is
still required.

### Medium - Non-active sessions and duplicate invitation mutation

**Status: fixed in this branch.**

Session middleware accepted a valid session without requiring the current user to
remain `Active`. Separately, inviting an existing active/inactive email mutated its
role and status through a path that did not apply role-change session revocation.
Session hydration now fails closed for non-active users, and invitation creation
returns `409 USER_ALREADY_EXISTS` for active/inactive accounts. The synthetic
two-person-review fixture now explicitly activates its second reviewer.

### Low - Internal database errors returned to clients

**Status: fixed in this branch.**

The partnership update handler logged an internal error and also returned its raw
message in the HTTP 500 response. It now retains server-side diagnostics while
returning only `INTERNAL_ERROR`.

## Dependency findings

`npm audit --omit=dev` reports zero critical, two high, and two moderate grouped
findings:

- React Router's high RSC-mode CSRF advisory affects the installed version, but
  this application uses browser routing and does not enable React Server Components
  or server actions. Upgrade to a fixed supported release when the major-version
  migration is validated.
- ExcelJS pulls a vulnerable `uuid` version. The reported vulnerable buffer API is
  not used directly by Atlas, but ExcelJS still parses untrusted workbooks in the
  API process and remains an isolation/availability concern.

There is currently no non-breaking audited upgrade path reported by npm for either
group. Do not suppress the advisories globally; document the reachability decision
and keep them in dependency monitoring.

## Infrastructure and architectural changes

### P0 - Close and encrypt the CloudFront-to-API origin

The API ALB is public, its security-group input defaults to `0.0.0.0/0`, and the
CloudFront origin policy defaults to `http-only`. Direct ALB access bypasses WAF and
CloudFront controls, while financial/API traffic to the origin is not TLS protected.

Prefer a CloudFront VPC origin with an internal ALB. If that cannot be adopted
immediately, restrict the public ALB to the CloudFront origin-facing prefix list,
require a high-entropy CloudFront custom origin header in the ALB listener, remove
the direct forwarding default action, and add an origin certificate with
`https-only`. Enforce PostgreSQL TLS as well.

### P1 - Make tenant ownership authoritative in PostgreSQL

Application filters are necessary but not sufficient for financial multi-user data.
Make Plaid ownership non-null, add ownership-aware repository interfaces everywhere,
and introduce PostgreSQL row-level security for Plaid, entity, partnership, K-1,
and report-source tables. Set the authenticated actor/tenant in each transaction and
test direct query attempts that cross owners.

### P1 - Centralize authentication flows, sessions, and abuse controls

Sessions are persisted, but process memory remains authoritative after bootstrap;
MFA challenges/enrollments and the API limiter are process-local. Multiple ECS tasks
can therefore disagree about revocation, role/status changes, MFA flows, and rate
limits. Move these states to transactional PostgreSQL or a shared TTL store, use
atomic consume/update operations, and read current user/session status authoritatively
on each security-sensitive request.

### P1 - Isolate document and workbook parsers

PDF extraction and ExcelJS workbook loading run inside the API process. Move both to
a queue-backed worker with file-count, compressed-size, expanded-size, row/cell,
CPU, memory, and wall-clock limits; malware/content-disarm scanning; outbound-network
restrictions; and a quarantine bucket. Use presigned object access rather than local
filesystem paths. Retain the new header checks as inexpensive front-door validation.

### P2 - Complete browser and export hardening

Add a tested Content Security Policy and HSTS at CloudFront, keep authenticated API
caching disabled, and disallow `SameSite=None` unless a CSRF-token/origin-validation
design is implemented. Add PII-aware pre-commit and CI scanning for PDF, Office, and
archive artifacts, not only plaintext secrets.

## Validation

- `npm run --workspace=api build`: passed.
- Full API suite: 85 files passed, 328 tests passed, 15 files/56 tests skipped
  because `ATLAS_TEST_DATABASE_URL` was not configured.
- Focused exploit regressions: 32 tests passed across Plaid ownership, uploads,
  CSV escaping, rate limiting, active sessions, and duplicate invitations.
- Web production build: passed; full web suite: 58 files/171 tests passed.
- Terraform recursive format check and validation: passed.
- `npm audit --omit=dev`: 0 critical, 2 high, 2 moderate grouped findings.
- Current-tree and Git-history common secret-pattern searches: no private key,
  GitHub token, OpenAI key, or AWS access-key matches found.
- Docker/PostgreSQL integration validation could not run because Docker Desktop and
  a local PostgreSQL listener were unavailable. The database-gated CI suite remains
  required before merge, especially for scoped Plaid clearing.
