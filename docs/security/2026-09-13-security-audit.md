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

### High — account lifecycle state was not enforced consistently

Password login accepted `Invited` users, allowing the shared bootstrap password to
enter the MFA enrollment path. Existing sessions and MFA challenges also remained
usable after a user left the active state. Login, session creation/hydration, and MFA
completion now require `Active` status; lifecycle changes revoke sessions and
invalidate MFA artifacts. Tests cover invitation, deactivation, challenge, and
enrollment cases.

### High — production credentials and encryption configuration failed open

When production credential variables were absent, the API fell back to the public
development password `password123`. The Plaid-secret encryption codec could also use
the database connection string as key material when `PERSISTENCE_SECRET_KEY` was
missing. Production startup now requires an independent persistence secret, distinct
non-default admin/user passwords, secure cookies, valid bounded session lifetimes, and
MFA. Terraform independently refuses to disable MFA.

### High — unhandled errors could expose internal exception details

The Fastify error handler returned raw thrown errors, and one partnership update path
returned the exception message directly in a 500 response. Internal failures now
return only a stable error code and request ID. Server logging records bounded error
metadata without serializing the exception message or stack into the response, and a
financial-value debug log was removed.

### High (development tooling) â€” js-yaml CPU denial-of-service advisory

The web lint toolchain resolved `js-yaml` 4.3.1, which is affected by the
merge-source CPU exhaustion advisory fixed in 4.3.2. A root override and regenerated
lockfile now force 4.3.2. This dependency is build/test tooling rather than deployable
runtime code, but malicious repository content can reach developer and CI tooling.

### Medium — exported CSV content allowed spreadsheet formula execution

K-1, partnership, report, and client-side investment CSV exporters escaped delimiters
but did not neutralize cells beginning with spreadsheet formula prefixes. A shared CSV
encoder now prefixes dangerous string cells while preserving legitimate numeric
values, including negative amounts.

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

### High — database peer identity is not explicitly verified by application config

The production image installs the AWS RDS trust bundle, and the database is private,
but the application creates `pg.Pool` from `DATABASE_URL` without requiring
`sslmode=verify-full`. Confirm `rds.force_ssl=1`, require certificate and hostname
verification in production startup, and add a production-shaped TLS integration test.

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
   expiring invite/reset tokens, require password creation before activation, revoke all
   sessions on lifecycle changes, and make credential rotation update the database rather
   than only the Secrets Manager value.
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

## Verification record

- `npm audit --omit=dev --json`: 0 production advisories.
- `npm audit --json`: 0 advisories across production and development dependencies.
- Current-tree credential scan: no matching plaintext credential or private-key
  signature; only examples and secret/password implementation files matched filename
  review.
- `npm run build:api`: passed.
- Full API suite: 569 passed, 103 skipped.
- Full web suite: 318 passed; the stale compact-currency assertion was corrected to
  match the unchanged `$2M` formatter output.
- API and web production builds: passed.
- `terraform fmt -check -recursive infra/aws/terraform`: passed.
- Terraform configuration validation (excluding its separately executed test fixtures):
  passed; `terraform test`: 19 passed.
- Dependency, environment-topology, production smoke-contract, route-policy,
  production-plan policy, and production-cost gates: passed.

## Residual-risk note

This was a source and infrastructure review, not a penetration test or cloud-account
configuration assessment. IAM policy behavior, deployed RDS parameters, WAF behavior,
Secrets Manager values, CloudTrail/alert routing, backup restoration, and third-party
provider dashboards should be verified against the live production account before the
next release.
