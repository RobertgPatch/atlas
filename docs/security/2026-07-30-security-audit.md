# Security Audit — 2026-07-30

## Executive summary

The audit confirmed three high-impact authentication weaknesses:

1. A valid password created a fully authenticated session without completing the
   implemented MFA flow.
2. Invited accounts could attempt authentication with a shared bootstrap
   password before a real invitation-acceptance flow existed.
3. Passwords were stored as unsalted SHA-256 hashes.

This change closes those paths, adds storage-path containment at every PDF read
boundary, makes unsafe production configuration fatal at startup, and updates
the dependency tree to remove both critical advisories present at the start of
the audit.

## Scope and methods

The review covered:

- Fastify authentication, session, MFA, lockout, RBAC, and entity-scope paths
- K-1 upload, local PDF storage, PDF download, and Azure extraction boundaries
- SQL construction and parameterization
- outbound network calls and secret handling
- React authentication routing and dependency advisories
- AWS network, edge, database, secret, and runtime Terraform
- tracked source and the latest 100 commits for common credential signatures

Checks included targeted source review, route/pre-handler enumeration, secret
pattern scans, `npm audit`, API and web builds, focused authentication and path
containment tests, the complete non-database API/web test suites, and Terraform
format/validation.

## Remediated findings

### Critical: password login bypassed MFA

**Impact:** Anyone with a valid password received a session cookie directly,
including users whose account claimed to enforce MFA. The challenge and
enrollment handlers existed but the login response and web routes did not lead
through them.

**Resolution:** Password login now returns only a short-lived MFA challenge or
enrollment transaction. A session is created only after a valid TOTP. The web
client routes those responses to the existing MFA screens, and repeated
challenges invalidate prior challenges for the same user.

### Critical: invited accounts inherited a shared credential

**Impact:** Invitation records did not have an acceptance endpoint, but invited
user records received the shared `USER_PASSWORD`. Login accepted every status
except `Inactive`, so a guessed invited email and shared password could let an
attacker enroll their own MFA device.

**Resolution:** Only `Active` accounts may pass password authentication.
Invited records receive an unknowable random placeholder hash. Invitation
acceptance remains intentionally disabled until a token-bound password setup
flow is implemented.

### High: unsalted, fast password hashes

**Impact:** A database disclosure would make password cracking substantially
cheaper and would reveal equal passwords across accounts.

**Resolution:** New password hashes use Node's salted scrypt implementation.
Legacy 64-character SHA-256 hashes are accepted once and upgraded to scrypt
after a successful password check. Unknown-account checks execute the same
scrypt path to reduce timing-based account discovery.

### High: production started after security guardrail failures

**Impact:** Production logged warnings but continued with missing persistence
keys, missing session configuration, insecure cookies, open CORS configuration,
or disabled rate limiting. Default bootstrap passwords were also available
outside development.

**Resolution:** Production defaults no longer supply bootstrap passwords.
Startup now fails closed when the database, strong encryption/session secrets,
strong admin bootstrap password, allowed browser origin, secure cookies, rate
limiting, or private API caching policy is unsafe. Plaid remains an operational
warning because deployments may legitimately omit that integration.

### High: PDF reads did not consistently enforce storage-root containment

**Impact:** Upload writes were contained, but the review download and Azure
extractor rebuilt paths independently. A corrupted or attacker-influenced
storage record could read a file outside the configured storage root.

**Resolution:** All PDF reads now use the same containment resolver, with
regression tests for relative and absolute traversal attempts.

### Dependency advisories

At audit start, `npm audit` reported 20 findings: 2 critical, 12 high, 5
moderate, and 1 low. Production dependencies reported 12 findings: 9 high, 2
moderate, and 1 low.

Vitest, Vite, Fastify, React Router DOM, PostCSS, TSX, and affected
transitive packages were updated. The two critical advisories are removed.
The final complete tree reports 15 grouped findings (0 critical, 14 high, 1
moderate); the production tree reports 12 (0 critical, 11 high, 1 moderate).
The remaining groups are the ExcelJS and React Router cases below plus
development-only ESLint glob handling.

### Bug: Terraform referenced a missing secrets module

**Impact:** The AWS root module could not initialize or validate, so the
documented Secrets Manager injection path was not deployable from a clean
checkout.

**Resolution:** Added the referenced module with one managed secret per runtime
environment variable, non-secret name/ARN outputs, deletion recovery controls,
and optional Lambda rotation wiring. Terraform now initializes and validates.

## Residual risks and applicability

### AWS API origin is public and uses HTTP by default — high

Terraform defaults the CloudFront-to-ALB origin policy to `http-only`, exposes
the ALB on ports 80 and 443 to `0.0.0.0/0`, and defines only an HTTP listener.
This permits direct WAF bypass and leaves session-bearing origin traffic
unencrypted between CloudFront and the ALB.

This needs an infrastructure decision rather than a one-line policy change:

- Preferred: use a private ALB with a CloudFront VPC origin.
- Alternative: create a regional origin hostname/certificate, use an HTTPS-only
  ALB listener, restrict ingress to the AWS-managed CloudFront origin-facing
  prefix list, and add a rotated CloudFront origin-verification header as
  defense in depth.

Do not switch CloudFront to `https-only` until the ALB has a certificate whose
name matches the origin hostname.

### ExcelJS has no clean current advisory path — high, constrained

ExcelJS 4.4.0 pins old archive/glob/UUID dependencies and has no maintained 4.x
release that resolves the reported advisories. The affected archival stack is
used for workbook output; imported workbook parsing is separately exposed to
untrusted ZIP/XML complexity.

Near term, run workbook import/export in a worker with strict compressed and
expanded-size, entry-count, memory, and wall-clock limits. Longer term, replace
ExcelJS with a maintained library or a small service whose parsing process has
an explicit resource sandbox.

### React Router RSC advisory — high in audit, not applicable to this build

The remaining React Router advisory concerns server-side RSC action handling.
Atlas uses `BrowserRouter` in a client-only Vite build and does not enable React
Server Components or React Router actions. The client was still updated to the
latest published `react-router-dom` release. Reassess when a fixed compatible
DOM release is published or before enabling server/data-router features.

### ESLint glob advisory — high in audit, development-only

The compatible ESLint 9 toolchain retains a glob/brace-expansion advisory.
ESLint is not installed in or executed by the API or browser production
artifacts. ESLint 10 removes the advisory but also changes repository-wide rule
results; take that upgrade with the existing lint cleanup rather than masking
new diagnostics in this security patch.

### Authentication state is process-local — high for horizontal scaling

Users, sessions, MFA challenges, and enrollment transactions are served from
process-local maps with asynchronous database mirroring. Multiple ECS tasks,
rolling deployments, or abrupt process loss can produce inconsistent session
revocation and MFA flows.

Make PostgreSQL or Redis authoritative for sessions and MFA transactions. Use
atomic, one-time challenge consumption, indexed expiry, synchronous revocation,
and a distributed login/rate-limit counter before increasing the API service
above one task.

## Recommended architecture backlog

1. Close and encrypt the CloudFront-to-API origin path.
2. Implement invitation acceptance with a random single-use hashed token,
   explicit password creation, MFA enrollment, expiry, and atomic consumption.
3. Move auth/session/challenge state and rate limiting to a shared authoritative
   store.
4. Isolate workbook processing and replace the unmaintained ExcelJS dependency.
5. Add CloudFront HSTS/CSP/security-header policies for the SPA and API.
6. Add PostgreSQL row-level security as defense in depth for entity-scoped
   financial data.
7. Version encrypted secret envelopes and document key rotation/re-encryption.
8. Send append-only audit events and security alerts to a separately protected
   log destination.
9. Verify or remove the login page's SOC 2 and blanket encryption claims unless
   current evidence supports them.

## Operational notes

- Existing users with legacy SHA-256 hashes are upgraded on their next
  successful password verification.
- Existing users without enrolled MFA are required to enroll before a session
  is issued.
- Invited users cannot sign in until the invitation-acceptance feature is
  completed.
- Production deployments must populate the newly enforced configuration before
  rollout; otherwise the API will refuse to start by design.
