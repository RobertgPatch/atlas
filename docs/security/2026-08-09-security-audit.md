# Security Audit — 2026-08-09

## Executive summary

This follow-up reviewed the remediated `agent/security-audit` branch, the committed
cash-flow/private-investment feature in PR #18, and security-sensitive local
database-credential work without modifying the user's active checkout.

No additional critical application-layer authorization bypass was confirmed.
The audit did find three newly disclosed high-severity dependency paths and
updated them on the security branch. The resulting dependency audit has zero
critical and zero high findings. Two moderate findings remain behind ExcelJS's
unmaintained `uuid@8` dependency and are not reachable through Atlas's UUID use.

PR #19 is still a release-blocking security change. It contains the earlier
authentication, tenant-isolation, upload, export, configuration, and sensitive-file
fixes and must land before feature PR #18. PR #18 must then be rebased so its older
lockfile does not restore vulnerable packages.

## Scope and method

Reviewed areas:

- Authentication, MFA, sessions, account status, lockout, cookies, CORS, and rate limiting.
- Route authentication and role guards across Admin, K-1, review, partnership,
  K-1 tracker, Plaid, reports, TIC registry, and private-investment endpoints.
- Object and tenant authorization in handlers and repository queries, including
  parent-child ID binding for commitments, NAV, cash flows, assets, report rows,
  imports, and Plaid connections.
- Dynamic SQL construction, parameter binding, export encoding, file/path handling,
  PDF generation, spreadsheet parsing, outbound service calls, and secret handling.
- AWS network, load balancer, database, task-role, runtime-secret, and scheduler configuration.
- Tracked files, high-risk filenames, secret-like literals, and the previously
  identified tax document retained in Git history.
- Runtime and development dependency advisories with `npm audit`, dependency-tree
  verification, API/web builds, tests, and Terraform validation.

This was a source and configuration audit, not a production penetration test.
Database-gated integration suites require `ATLAS_TEST_DATABASE_URL` and remain
explicitly skipped when that isolated test database is unavailable.

## Findings fixed in this run

### SEC-2026-08-09-01 — Vulnerable URI canonicalization

**Severity:** High
**Status:** Fixed on PR #19

Fastify's schema/compiler dependency graph resolved `fast-uri@3.1.4` and
`fast-uri@4.1.1`, both affected by host-confusion behavior involving a backslash
authority introducer. Atlas does not currently use user-controlled remote URLs in
these schema paths, reducing demonstrated exploitability, but a framework-level URL
canonicalization flaw is not acceptable in the production dependency closure.

The security branch now resolves `fast-uri@3.1.5` and `fast-uri@4.1.2`.

### SEC-2026-08-09-02 — Generator denial of service

**Severity:** High advisory; low current reachability
**Status:** Fixed on PR #19

The web build graph resolved `nanoid@3.3.16`, whose custom generators can loop
indefinitely for a zero size. Atlas does not call the affected custom generator API,
but the vulnerable package was removed from the dependency closure. It now resolves
to `nanoid@3.3.18`.

### SEC-2026-08-09-03 — YAML quadratic CPU consumption

**Severity:** High advisory; development-only
**Status:** Fixed on PR #19

ESLint resolved `js-yaml@4.3.0`, affected by quadratic CPU consumption during
`!!omap` resolution. This path is development-only and Atlas does not parse
attacker-controlled YAML through ESLint, but CI and developer machines should not
retain the vulnerable parser. It now resolves to `js-yaml@4.3.1`.

## Confirmed controls

- Protected API routes use signed, HTTP-only session cookies and reject missing,
  expired, revoked, or inactive-user sessions.
- Password verification is salted with scrypt, unknown users take the same expensive
  verification path, and legacy SHA-256 hashes migrate after a valid login.
- Session issuance occurs only after successful MFA enrollment or verification;
  MFA flow records expire and are consumed.
- Admin writes require an Admin role, while non-admin reads are narrowed to entity
  memberships before filters, aggregation, pagination, and export.
- Nested resource mutations bind child IDs to the authorized parent ID in the same
  database query or transaction.
- Private-investment JSON and PDF endpoints reload data server-side, apply entity
  scope before composition, validate filters and column identifiers, and never trust
  browser-provided rows or totals.
- SQL values are parameterized. Remaining interpolated fragments are closed enums,
  generated placeholders, or internally constructed clauses.
- CSV exports neutralize spreadsheet formulas, PDF uploads verify the file signature,
  and storage reads enforce resolved-path containment.
- Production startup fails closed when durable persistence, signing/encryption keys,
  secure cookies, allowed origins, rate limiting, or cache policy are insecure.

## Remaining risks and required actions

### 1. Purge the historical K-1 and complete an exposure review

**Priority:** Release blocker

`new_k1.pdf` was removed from the branch in the prior run, but the real-world tax
document remains retrievable from commit `36e35c3`. Deleting a file in a later commit
does not remove the blob from Git history.

Repository administrators must rewrite the repository history, force-update affected
refs, expire cached artifacts where possible, and require fresh clones. Treat the
document as exposed to every person or automation that could read the repository;
review its contents and rotate or monitor any identifiers that can be rotated.

### 2. Land PR #19 before PR #18 and rebase the feature

**Priority:** Release blocker

The committed PR #18 lockfile reports two critical and thirteen high advisories in a
full package-lock audit. The critical result is the Vitest UI arbitrary file
read/execution issue and is development-tooling exposure rather than an Atlas
production endpoint. Several high results are likewise build-only or apply to React
Router server/RSC modes Atlas does not enable. Even with reduced reachability, the
branch must not merge with that dependency state.

Merge PR #19 first, rebase PR #18 onto the secured base, resolve the lockfile in favor
of the secured versions, and rerun both production-only and full dependency audits.

### 3. Authenticate and encrypt the CloudFront-to-ALB hop

**Priority:** High architecture change

The ALB is internet-facing and the current origin path uses HTTP. Move the origin to
HTTPS with an ACM certificate, restrict ALB ingress to the CloudFront managed prefix
list, and require a rotated origin-verification header or another authenticated-origin
control. This prevents direct-origin bypass of CloudFront controls and protects the
origin hop in transit.

### 4. Make authorization durable and authoritative

**Priority:** High architecture change

Sessions, MFA challenges, enrollment flows, and some lock/rate state remain partly
process-local, with several database writes queued asynchronously. Move these to an
authoritative shared store with atomic issuance, consumption, revocation, expiry, and
failure accounting. Store a directly indexed session-token hash rather than scanning
process memory. Use the same shared service across every API task.

### 5. Add PostgreSQL row-level security

**Priority:** High defense in depth

Application scope checks are now consistent, but one missed predicate can still
expose financial or tax data. Add PostgreSQL RLS policies keyed to a transaction-local
actor/entity context. Keep application checks for clear errors, while making the
database the final tenant boundary.

### 6. Isolate document parsers and bound decompression

**Priority:** High architecture change

PDF extraction and ExcelJS workbook parsing process complex, attacker-influenced
formats in the API process. Run parsers in a disposable worker with strict CPU,
memory, wall-clock, file-count, row/column, and expanded-byte limits; disable network
access; and exchange only a validated normalized result. Replace ExcelJS or pin a
maintained fork that removes its legacy UUID dependency.

### 7. Require verified RDS TLS in the managed-password work

**Priority:** High before committing the current local change

The local managed-database pool configuration currently uses
`rejectUnauthorized: false`. Encryption without server certificate verification is
vulnerable to endpoint impersonation and credential interception. Ship an AWS RDS CA
bundle and use certificate verification/hostname validation (`verify-full`
semantics). The security automation did not edit this uncommitted user work.

### 8. Centralize edge-aware rate limiting

**Priority:** Medium architecture change

The bounded in-process limiter is a useful last-resort guard but is neither shared
across tasks nor an authoritative abuse control. Enforce primary limits at AWS WAF or
API Gateway and use a shared store for identity-sensitive limits. Configure trusted
proxy handling deliberately so client identity cannot be spoofed or collapsed to the
load balancer address.

## Verification target

Before production deployment, the release candidate should satisfy all of the following:

- Zero critical and zero high findings in `npm audit --omit=dev`.
- Any remaining full-audit finding has documented reachability and ownership.
- API and web builds and test suites pass from a clean install.
- Database authorization suites pass against an isolated PostgreSQL database.
- Terraform formats and validates for staging and production inputs.
- PR #18 is based on the commit containing PR #19, not its older dependency graph.
- The historical K-1 purge and exposure review are complete.
