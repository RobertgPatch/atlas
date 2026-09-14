# Security Audit — 2026-09-13

## Executive summary

This audit reviewed `origin/main` at `75be8a4` across authentication, authorization,
financial-provider integrations, document ingestion, exports, error handling,
runtime configuration, dependencies, Terraform, tracked files, and Git history.

The review found one critical authorization class affecting Plaid-connected financial
accounts, four high-risk authentication/configuration/error-handling/dependency classes,
and two medium-risk input/output handling bugs. The accompanying change set fixes each
of those current-code findings and adds regression coverage.

One critical data-handling issue cannot be fixed safely in an ordinary pull request:
the deleted `new_k1.pdf` remains in reachable Git history. Repository administrators
must assess the document's sensitivity, purge it from all refs if it contains real tax
data, invalidate old clones/caches where possible, and rotate or replace any exposed
identifiers or credentials.

## Scope and method

- Reviewed all API route registration and protection-policy coverage, auth/session/MFA
  flows, entity and provider data scoping, document upload paths, CSV generators,
  persistence and cryptography configuration, response/error paths, and AWS Terraform.
- Scanned the current tracked tree for common private-key, AWS, GitHub, and OpenAI key
  signatures and for accidentally tracked environment/key files.
- Inspected reachable Git history for the previously removed K-1 PDF.
- Audited production and development dependencies with npm.
- Ran TypeScript builds, targeted security regression tests, the API and web test
  suites, repository security gates, and Terraform formatting/validation checks.

## Findings fixed in this pull request

### Critical — Plaid account operations crossed user ownership boundaries

Non-admin handlers listed and changed the global investment-account collection.
Selection updates could modify another user's accounts, account clearing could delete
all connected users' Plaid state, manual holdings refreshes could include accounts the
caller did not own, and an existing Plaid Item could be reassigned to another owner.
An orphan account also passed the visibility check.

The repository now scopes connections and accounts to the requesting owner, fails
closed on orphaned records, preserves administrator-wide behavior explicitly, limits
clears and refreshes to visible accounts, and rejects Plaid Item owner reassignment.
The database upsert also preserves the original owner atomically, so a second API
process cannot race the in-memory ownership check and transfer an Item.

### High — account lifecycle state was not enforced consistently

Password login accepted `Invited` users, allowing the shared bootstrap password to
enter the MFA enrollment path. Existing sessions and MFA challenges also remained
usable after a user left the active state, and reactivation could make an old session
token usable again. Login, session creation/hydration, and MFA completion now require
`Active` status; lifecycle changes and MFA resets revoke sessions and invalidate MFA
artifacts. Tests cover invitation, deactivation, reactivation, challenge, reset, and
enrollment cases.

### High — production credentials and encryption configuration failed open

When production credential variables were absent, the API fell back to the public
development password `password123`. The Plaid-secret encryption codec could also use
the database connection string as key material when `PERSISTENCE_SECRET_KEY` was
missing. Production startup now requires a dedicated persistence secret distinct from
the session secret, distinct non-default admin/user passwords, secure cookies, valid
bounded session lifetimes, and MFA. Terraform independently refuses to disable MFA.

### High — unhandled errors could expose internal exception details

The Fastify error handler returned raw thrown errors, and one partnership update path
returned the exception message directly in a 500 response. Internal failures now
return only a stable error code and request ID. Server logging records bounded error
metadata without serializing the exception message or stack into the response, and a
financial-value debug log was removed.

### High advisory, development scope — `js-yaml` CPU denial of service

The web lint toolchain resolved `js-yaml` 4.3.1, affected by
GHSA-2883-xcg3-v3hh. A root override and regenerated lockfile now force 4.3.2. This
dependency is build/test tooling rather than deployable runtime code, but malicious
repository content can reach developer and CI tooling. Both full and production-only
npm audits now report zero advisories.

### Medium — exported CSV content allowed spreadsheet formula execution

K-1, partnership, report, and browser-side investment CSV exporters escaped delimiters
but did not neutralize cells beginning with spreadsheet formula prefixes. The server
uses a shared CSV encoder and the browser exporter applies the same rule. Both prefix
dangerous string cells while preserving legitimate numeric values, including negative
amounts.

### Medium — legacy K-1 upload trusted a spoofable MIME type

The legacy multipart K-1 route accepted arbitrary bytes labeled `application/pdf` and
stored them for parsing. It now requires the PDF file signature before persistence.
The newer batch pipeline already performs deeper structural, encryption, size, and
page-count checks.

## Findings requiring operational action

### Critical — a K-1 PDF remains in reachable Git history

`new_k1.pdf` was removed from the current tree, but reachable commits including
`36e35c3` still contain the object. If the file contains real tax or personal data,
normal deletion is insufficient. Treat this as a potential disclosure until a
repository-admin history rewrite and exposure review are complete. Coordinate the
rewrite because commit hashes will change and all collaborators must replace old
clones; do not perform it as part of a routine application PR.

### High — internal transport peer identity is not fully verified

The production image installs the AWS RDS trust bundle, and the database is private,
but the application creates `pg.Pool` from `DATABASE_URL` without requiring
`sslmode=verify-full`. CloudFront also reaches the private ALB using HTTP. Confirm
`rds.force_ssl=1`, require database certificate and hostname verification in production
startup, terminate authenticated TLS on the ALB origin, and add production-shaped TLS
integration tests for both paths.

## Architectural recommendations

1. **Make PostgreSQL authoritative for identity and financial-provider state.** Auth,
   MFA challenge, session, lockout, Plaid connection, and refresh state are currently
   held in process memory and hydrated at startup, with several writes mirrored
   asynchronously. The one-task Terraform cap prevents immediate divergence but also
   blocks safe scaling and makes restarts/races harder to reason about. Use transactional
   database reads/writes or a shared strongly consistent session/state service before
   raising the ECS task count.
2. **Add database-enforced tenant isolation.** Application-layer predicates are the
   only boundary today. Introduce PostgreSQL row-level security keyed to the authenticated
   user/entity context, least-privilege application roles, and integration tests proving
   cross-tenant denial even when a repository query omits a filter.
3. **Replace bootstrap passwords with one-time identity provisioning.** Use unique,
   expiring invite/reset tokens, require password creation before activation, preserve
   the new session-revocation invariant on every lifecycle change, and make credential
   rotation update the database rather than only the Secrets Manager value.
4. **Consolidate document ingestion.** Remove the legacy multipart path after client
   migration so all uploads use one hardened batch flow. Run parsing in an isolated,
   resource-bounded worker and apply structural validation, encryption rejection,
   malware/content scanning, page limits, and decompression limits before extraction.
5. **Centralize safe telemetry.** Route all background and persistence errors through a
   structured logger with field allowlists and redaction. Provider and database exception
   messages should not be persisted as user-visible parse or synchronization messages.
6. **Create a sensitive-file prevention control.** Add a pre-commit/CI rule for tax
   documents and large binaries, secret scanning with push protection, and a documented
   incident runbook for history rewrites and credential rotation.
7. **Encrypt and authenticate every production hop.** Require verified TLS from the
   application to RDS and from CloudFront to the private ALB; fail production startup or
   deployment policy checks when either transport is downgraded.

## Verification record

- `npm audit --omit=dev --json`: 0 production advisories.
- `npm audit --json`: 0 advisories across production and development dependencies.
- Current-tree credential scan: no matching plaintext credential or private-key
  signature; only examples and secret/password implementation files matched filename
  review.
- API and web production builds: passed (existing web large-chunk warning only).
- Security-focused regression sets: passed across authentication, authorization, error
  redaction, upload validation, CSV handling, and route policy.
- Full API suite, serialized: 569 passed, 103 database/environment-dependent tests
  skipped. A parallel run's two timing-only failures passed in isolation and in the
  serialized full run.
- Full web suite, serialized: 318 passed.
- `terraform fmt -check -recursive infra/aws/terraform`: passed.
- Terraform configuration validation (excluding its separately executed test fixtures):
  passed; `terraform test`: 19 passed.
- Dependency, environment-topology, production smoke-contract, route-policy,
  production-plan policy, and production-cost gates: passed.
- Database-backed integration tests and the production-shape image build were not run
  because Docker Desktop was unavailable on the audit host. `gitleaks`, `semgrep`, and
  `trivy` were also unavailable; the audit used repository-native gates, npm advisory
  data, targeted source review, and regex secret scanning instead.
- Standalone web lint and project-reference typecheck are not clean on this branch:
  they report React effect-rule, shared-type import, and strict typing failures in files
  unchanged by this security work. The production web build and all 318 web tests pass;
  that pre-existing static-analysis debt should be handled separately.

## Residual-risk note

This was a source and infrastructure review, not a penetration test or cloud-account
configuration assessment. IAM policy behavior, deployed RDS parameters, WAF behavior,
Secrets Manager values, CloudTrail/alert routing, backup restoration, and third-party
provider dashboards should be verified against the live production account before the
next release.
