# Security audit — 2026-10-01

## Executive summary

The audit covered the API, web client, statement-import worker, authentication and session lifecycle, dependency graph, AWS Terraform, CI security gates, repository history, and GitHub security settings at commit `af351af`.

The most serious code-level issue was a fail-open XLSX resource-control boundary: the production import service sent only the CSV subset of the configured limits to the worker. XLSX-specific inflation, XML, ZIP-entry, worksheet, relationship, string, and populated-cell ceilings were consequently `undefined` inside the parser. A small authenticated upload could therefore consume enough memory to terminate the API task. The patch sends the complete validated configuration to the worker and applies the configured V8 old-generation heap ceiling at worker creation.

The most urgent outstanding issue is operational rather than patchable in a normal pull request. The public repository's Git history still contains `new_k1.pdf`, which appears to be a real tax document, in blob `0234badb51021c4fa63ca45760cdf69c24c2cdc4`. Removing the file from the current tree did not remove it from commit history. Repository administrators should treat this as a potential data-exposure incident and complete the response in the priority order below.

## Findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| Critical | A sensitive tax document remains retrievable from the public Git history. | Open; requires repository-admin incident response and a coordinated history rewrite. |
| High | XLSX parser controls failed open because the worker received only partial CSV limits and no V8 heap ceiling. | Fixed; the worker now receives the full validated config and a bounded old-generation heap. |
| High | Fastify 5.12.1 was affected by upstream request-validation, authorization-bypass, and denial-of-service advisories. | Fixed by upgrading to 5.12.5; production and full npm audits report zero vulnerabilities. |
| High | Existing sessions remained usable after account deactivation, reinvitation, or MFA reset; MFA completion could race an account-status change. | Fixed by enforcing Active status at session creation/hydration, revoking sessions and pending auth artifacts on identity-state changes, and rechecking state after asynchronous MFA work. |
| Medium | Unhandled errors and two partnership handlers could expose internal exception details or stack traces. | Fixed with a global redacted 5xx response and structured, bounded server-side error metadata. |
| Medium | User-controlled text in CSV exports could be interpreted as a spreadsheet formula. | Fixed in API K-1/partnership exports and the web investment export while preserving numeric negative values. |
| Medium | The legacy K-1 multipart endpoint trusted the declared PDF MIME type without checking the file signature. | Fixed by requiring the `%PDF-` signature before accepting the upload. |
| Medium | Production allowed an absent/shared persistence key and allowed MFA login to be disabled. | Fixed with production fail-closed key-length/key-separation checks and an immutable Terraform MFA guardrail. |
| Governance | `main` has no branch protection, Dependabot alerts are disabled, and no CodeQL analysis is present. | Open; enable the controls listed below. |
| Informational | Secret scanning flags a provider-shaped fake AWS access-key fixture in repository history. | The current fixture no longer resembles a provider credential. Resolve alert 1 as a test value after review; do not publish the historical fixture in tickets or logs. |

## Fixes included in the pull request

- Pass all statement/XLSX parser limits across the worker boundary and enforce the configured worker heap ceiling.
- Upgrade Fastify to the patched 5.12.5 release and make the runtime audit launcher avoid shell execution when npm exposes its CLI path.
- Require Active users for sessions and MFA verification; revoke all sessions and one-time auth artifacts on deactivation, reinvitation, and MFA reset.
- Require distinct, bounded production session and persistence secrets and require production MFA in both application validation and Terraform.
- Redact every unhandled 5xx response and remove raw error, stack, and financial-value debug logging.
- Neutralize spreadsheet formulas in all audited CSV export paths.
- Reject MIME-spoofed PDF uploads at the legacy K-1 endpoint.
- Replace the provider-shaped fake key in the environment-boundary test.

## Required repository-admin actions

1. Restrict or temporarily make the repository private while the historical document exposure is assessed.
2. Identify the owner of `new_k1.pdf`, determine whether regulated personal or tax data was exposed, preserve the minimum incident evidence, and follow the organization's legal/privacy notification process.
3. Rewrite all reachable refs containing blob `0234badb51021c4fa63ca45760cdf69c24c2cdc4`, force-push the sanitized refs, invalidate caches where supported, and require every clone/fork under organizational control to be replaced. A normal merge cannot do this.
4. Rotate or replace any identifiers, credentials, or account data exposed in the document where applicable.
5. Resolve secret-scanning alert 1 as a test credential only after confirming the historical value was never issued by AWS.
6. Enable branch protection for `main` with required review and required `security-ci` checks. Enable Dependabot alerts/security updates, secret push protection, and CodeQL default setup.

## Architectural recommendations

### 1. Isolate document parsing from the API task

Keep the new worker heap bound, but move untrusted CSV/XLSX parsing into a separately deployed, no-egress worker with operating-system/container CPU, memory, file, and wall-clock limits. The current Node worker shares the API task's process failure domain, so a runtime or native-library failure can still affect request serving.

### 2. Make PostgreSQL authoritative for authentication state

Sessions, MFA challenges, enrollments, and password-change artifacts are currently coordinated through process-local maps with asynchronous persistence. That design relies on a single API task and becomes inconsistent when the service scales or restarts. Store and atomically consume these artifacts in PostgreSQL, validate account status in the same transaction, and use server-side revocation/version checks on every authenticated request.

### 3. Add database-enforced tenant boundaries

Application authorization is substantial, but the financial and entity tables should also use PostgreSQL row-level security keyed to the authenticated user/entity scope. RLS makes an omitted repository predicate fail closed instead of becoming a cross-entity disclosure.

### 4. Eliminate shared bootstrap credentials

The invited-user repository path can still hash the configured shared user password. Replace it with random, single-use, short-lived invite/reset tokens stored only as hashes, with explicit expiry and atomic consumption. No shared human bootstrap credential should exist after initial administrator recovery is complete.

### 5. Encrypt every network hop and centralize redacted telemetry

The CloudFront-to-ALB/API path is private but includes an HTTP hop. Terminate and re-establish verified TLS at each hop (or use service-to-service mTLS). Adopt a single structured logging layer with field allowlists and automated redaction tests so handlers cannot reintroduce raw exceptions, financial values, tokens, or document contents.

## Verification performed

- API and web production builds.
- Focused regression tests for statement worker limits, authentication lifecycle, 5xx redaction, CSV injection, PDF signature validation, and production configuration.
- Full API suite: 1,152 passed and 189 skipped across 203 files.
- Full web suite: 435 passed across 96 files.
- `npm audit` for the complete dependency graph and production-only API/web dependencies.
- Runtime dependency audit, route-policy audit, environment-topology validation, production smoke contract, and production cost-envelope checks.
- Terraform formatting, initialization, validation, production plan-policy tests, and 24 Terraform security/architecture tests.

## Residual risk

The history exposure and repository governance gaps remain open until an administrator completes them. The worker boundary now prevents the identified configuration bypass and bounds V8 old-generation memory, but complete hostile-document containment still requires process/container isolation. The authentication changes close the known local-state transitions; horizontally scaled authentication should wait for the PostgreSQL-authoritative design.
