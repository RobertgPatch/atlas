# Feature Specification: User and IP Rate-Limit Hardening

**Feature Branch**: `030-user-ip-rate-limiting`
**Created**: 2026-08-29
**Status**: Draft
**Input**: User description: "Rate-limit by user and IP, prevent bots from abusing authentication URLs, and prevent gateway bypasses from reaching backend services or spiking the AWS bill."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep Authentication Usable During Bot Traffic (Priority: P1)

As the authorized user, I can sign in and complete MFA while automated password, MFA, and account-enumeration traffic is rejected before it consumes expensive authentication work.

**Why this priority**: Authentication is public by necessity and performs security-sensitive work. It is the most likely path for credential stuffing, account lockout abuse, and attacker-driven compute cost.

**Independent Test**: Exercise legitimate password and MFA attempts alongside excessive attempts from one address, rotating addresses, and rotating account identifiers; verify the legitimate bounded flow remains possible and excess work is rejected before password hashing, MFA material generation, audit amplification, or session creation.

**Acceptance Scenarios**:

1. **Given** a source address exceeds the authentication allowance, **When** it sends another password or MFA attempt, **Then** the attempt is rejected with a bounded retry response before expensive authentication work.
2. **Given** a bot rotates source addresses while targeting one account, **When** the account allowance is exhausted, **Then** further attempts are rejected without revealing whether the account exists.
3. **Given** a bot rotates both source addresses and account identifiers, **When** the global authentication ceiling is reached, **Then** excess authentication work stops while the condition is observable to the operator.
4. **Given** an authorized user remains below every applicable allowance, **When** they complete password and MFA steps, **Then** rate limiting does not change the successful authentication contract.

---

### User Story 2 - Enforce Independent User and Network Fairness (Priority: P1)

As the authorized user, my activity is bounded by both my authenticated identity and the network source, so creating extra sessions, changing addresses, or sharing an address cannot bypass every limit or unfairly consume backend capacity.

**Why this priority**: A session-only, address-only, or combined user-and-address key can be evaded. Independent dimensions are required to stop both one noisy client and one compromised identity.

**Independent Test**: Send the same route class through multiple sessions and addresses for one user, and through multiple users behind one address; verify each independent ceiling applies without merging or resetting the other dimensions.

**Acceptance Scenarios**:

1. **Given** one user creates multiple sessions, **When** their combined activity exceeds the user allowance, **Then** further requests are rejected even though individual sessions remain below their session allowances.
2. **Given** one authenticated session moves between network addresses, **When** an address exceeds its allowance, **Then** that address is limited without resetting the user's accumulated usage.
3. **Given** multiple legitimate users share an address, **When** one user exceeds their allowance but the shared address does not, **Then** the other users remain usable.
4. **Given** an unauthenticated request has no valid user or session, **When** it reaches an external route, **Then** source and global protections still apply.

---

### User Story 3 - Make the Protected Edge the Only Internet Entry (Priority: P1)

As the operator, I can prove that Internet clients cannot bypass the protected edge by addressing a load balancer, task, database, internal route, alternate hostname, or accidentally introduced public service endpoint.

**Why this priority**: Application limits and edge inspection provide no cost or access protection if an attacker can reach an unprotected origin directly.

**Independent Test**: Inspect the deployable infrastructure and run negative connectivity and routing checks showing that only the approved public edge accepts Internet traffic and every backend hop accepts traffic solely from its immediate upstream service.

**Acceptance Scenarios**:

1. **Given** the production infrastructure definition, **When** public entry points are inventoried, **Then** only the approved application edge is Internet-addressable.
2. **Given** an attacker knows a backend hostname or address, **When** they attempt direct access from the Internet, **Then** no application response is reachable.
3. **Given** a request targets an internal health, readiness, administration, scheduler, or service endpoint through the public edge, **When** no explicit public route is approved, **Then** it is not forwarded to the backend.
4. **Given** infrastructure drift would make a backend public or detach edge protection, **When** validation runs, **Then** deployment fails before production mutation.

---

### User Story 4 - Bound Cost-Producing Work After Edge Admission (Priority: P2)

As the operator, I can rely on exact application ceilings and kill switches so a missed, delayed, internally sourced, or distributed edge request cannot create unbounded provider, queue, storage, database, export, or background-processing cost.

**Why this priority**: Edge rules are approximate and still incur request charges. Authoritative cost control must occur before downstream work.

**Independent Test**: Exceed each protected workload's user and global allowance and verify every rejected request produces zero new provider calls, queue messages, stored objects, exports, or automatic capacity growth.

**Acceptance Scenarios**:

1. **Given** a paid or resource-heavy workload is over quota, **When** a request passes edge inspection, **Then** the workload is rejected before downstream work begins.
2. **Given** a protection dependency cannot make an authoritative cost decision, **When** new cost-producing work is requested, **Then** the request fails closed while already-completed low-cost reads follow their approved degraded policy.
3. **Given** a retry storm or duplicate operation, **When** repeated equivalent requests arrive, **Then** they cannot multiply downstream work beyond the approved idempotency and retry budgets.
4. **Given** abusive request volume, **When** system capacity is evaluated, **Then** no request-count-based scaling can increase the production runtime fleet.

---

### User Story 5 - Detect and Safely Tune Abuse Controls (Priority: P2)

As the operator, I can observe low-cardinality rejection, saturation, and cost signals, introduce stricter rules without locking out the authorized user, and roll back a false-positive threshold without disabling the hard global cost ceiling.

**Why this priority**: An unobservable limiter can silently deny service, generate log cost, or fail to stop a distributed attack.

**Independent Test**: Introduce synthetic bounded traffic, review count-only evidence, enable enforcement, trigger each rejection class, and verify alerts, redaction, expiring overrides, and rollback behavior.

**Acceptance Scenarios**:

1. **Given** a new edge threshold is not yet proven, **When** it is introduced, **Then** it can observe matching traffic before blocking it.
2. **Given** a limit is exceeded, **When** the event is recorded, **Then** the record identifies the route class, scope, and reason without raw addresses, emails, cookies, credentials, MFA material, or account identifiers.
3. **Given** a legitimate request is incorrectly limited, **When** the operator applies an emergency adjustment, **Then** the adjustment is narrower or lower-risk, expires automatically, is audited, and does not remove the global paid-work ceiling.
4. **Given** attack traffic raises edge, authentication, or downstream saturation signals, **When** alert evaluation completes, **Then** the operator receives an actionable notification within five minutes.

### Edge Cases

- IPv4-mapped IPv6 addresses and IPv6 privacy addresses must not create unbounded distinct identities; IPv6 sources are normalized to an approved network prefix.
- A user changing networks mid-session must remain subject to the same user ceiling while each network retains its own ceiling.
- Multiple legitimate users behind a shared NAT must not be collapsed into one user identity, though the shared address remains protected by an independent ceiling.
- Missing, malformed, duplicated, or spoofed forwarding headers must not bypass inspection or become attacker-controlled limiter keys.
- Missing or invalid cookies must be treated as unauthenticated and must not create high-cardinality persistent state.
- A distributed botnet rotating addresses and account identifiers must still meet a global authentication ceiling.
- Per-account lockout must not become an unbounded denial-of-service primitive against the authorized user.
- Health probes and cached liveness checks must remain cheap and must not share a bucket that can make internal health evaluation fail under public abuse.
- A task restart, clock boundary, configuration reload, or HMAC-key rotation must not silently reset authoritative paid-work limits or create duplicate work.
- An unavailable limiter store, database, metrics sink, or alert destination must follow the documented fail-closed or low-cost degraded policy instead of defaulting to unlimited work.
- Rejected traffic must not produce unbounded request logs, unique metric dimensions, audit rows, database writes, or WAF log-ingestion cost.
- Edge rate enforcement is approximate; a small evaluation delay must not allow downstream paid work to exceed exact application ceilings.
- A presigned upload URL is a Restricted bearer capability that intentionally leaves the gateway after issuance; replay, excessive lifetime, or loose object scope must not create additional stored versions or unbounded request/storage cost.

## Security, Privacy & Operational Requirements *(mandatory)*

### Actors, Tenancy & Authorization

- **Actors**: Tony Patch as the current production application user; Robert Patch as the production operator; distinct scheduler and workload service identities; health and deployment automation; unauthenticated Internet clients; authenticated automation; and malicious or compromised clients.
- **Tenant/Entity Scope**: Production remains one family-office tenant. Limits may be scoped by source, account identifier, user, session, tenant, route class, workload, and global environment, but must not weaken existing entity/resource authorization.
- **Authorization**: Rate-limit admission supplements server-side session, role, entity, CSRF, scheduler-identity, and action authorization. It never grants access. Production human accounts remain unique and MFA-protected; service endpoints require their dedicated identities and are not publicly routable unless explicitly approved.

### Data Protection & Audit

- **Classification**: Raw addresses, email/account identifiers, cookies, session identifiers, authentication outcomes, MFA material, limiter secrets, and detailed security events are Restricted. Aggregated anonymous counts and non-sensitive rule identifiers are Internal.
- **Data Flow**: Requests enter only through the protected public edge, pass network and application admission, then reach authorization and business handlers. Raw identifiers may be used transiently to make an admission decision but must be converted to keyed, non-reversible fingerprints before storage or correlation. Third-party processing does not change for this feature.
- **Source of Truth**: Edge and in-process counters are early shedding signals. Durable application admission remains authoritative for exact cross-task paid-work, concurrency, retry, and global cost decisions. Versioned policy configuration and append-only security/audit evidence identify rule, scope, outcome, actor where known, and time without storing raw secrets or unnecessary Restricted content.
- **Retention/Deletion**: Transient limiter entries expire no later than their approved window plus bounded cleanup time. Security logs follow the existing 30-day operational retention unless the approved record schedule requires otherwise. This feature does not change long-lived business or financial record retention.

### Threats, Failure & Recovery

- **Threat/Abuse Cases**: Credential stuffing; password spraying; MFA guessing; account enumeration; deliberate lockout; session multiplication; stolen-session use across addresses; IPv6/address rotation; distributed botnets; spoofed proxy headers; direct-origin discovery; public-endpoint drift; internal service abuse; retry storms; high-cardinality state or logging; provider-cost exhaustion; database-write amplification; and request-driven scaling.
- **Failure Behavior**: Public excess receives a bounded response with retry guidance. New paid or materially resource-consuming work fails closed when authoritative admission is unavailable. Approved completed-data reads may use their existing low-cost degraded behavior. Missing protection configuration, missing edge attachment, public-origin drift, or an unverifiable trusted-proxy chain blocks production startup or deployment.
- **Recovery Impact**: No business-data migration is expected. New durable limiter state must be restartable, disposable after expiry, and compatible with the existing 15-minute RPO and eight-hour RTO. Rollback restores the prior versioned rules and application artifacts without rewinding business data or disabling hard cost ceilings.
- **Incident/Compliance Impact**: Abuse alerts and response steps extend the existing WISP, incident, cost-abuse, and breach-assessment procedures. No new processor or legal claim is introduced. Any paid bot-management service or new externally processed request signal requires separate provider, privacy, and recurring-cost review.

### Approved Exceptions

- **EX-030-001**: Allows repository implementation, bounded local/CI testing, review, and merge while C1/C2 governance remediation is completed in subsequent changes. It does not authorize AWS production mutation, production traffic, or continued production handling of Restricted data. See [the exception record](./evidence/EX-030-001.md) and [remediation requirements](./evidence/c1-c2-remediation.md). Approved by Robert Patch on 2026-08-29; expires 2026-09-28.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every externally reachable route MUST have an explicit, canonical protection class and owner; production startup and deployment MUST fail when a route is unclassified.
- **FR-002**: Every non-liveness external request MUST be evaluated against an independent source-address allowance before authentication or business handling.
- **FR-003**: Every authenticated external request MUST be evaluated against an independent user allowance after trusted authentication, regardless of session or address changes.
- **FR-004**: Session, tenant, route-class, workload, and global allowances MUST remain separately enforceable where their risk class requires them.
- **FR-005**: A combined user-and-address key MUST NOT replace the independent user and source decisions.
- **FR-006**: Password login, MFA verification, MFA enrollment completion, and any future authentication-work endpoint MUST have source, account-identifier, and global ceilings before expensive authentication work.
- **FR-007**: Authentication MUST preserve indistinguishable public failure behavior for known and unknown account identifiers.
- **FR-008**: Authentication concurrency MUST be globally bounded, and an exhausted concurrency budget MUST reject new expensive work rather than queueing without limit.
- **FR-009**: Account protection MUST balance guessing prevention with denial-of-service resistance through bounded lockout, observable recovery, and no permanent attacker-triggered lockout.
- **FR-010**: Edge protections MUST distinguish general API, authentication, resource-heavy, paid-admission, and global-emergency traffic so each class can have an independently reviewed threshold and action.
- **FR-011**: Distributed authentication traffic MUST be subject to a global emergency ceiling that cannot be bypassed by rotating addresses or account identifiers.
- **FR-012**: The system MUST reject excess work before password hashing, MFA/QR generation, database-heavy aggregation, export generation, object storage, queueing, provider calls, or other defined cost drivers.
- **FR-013**: Exact paid-work, duplicate-work, retry, concurrency, backlog, and daily/monthly ceilings MUST remain authoritative inside the application even if edge controls are absent, delayed, or bypassed by an internal caller.
- **FR-014**: A rejected request MUST return a stable bounded error contract with a retry interval and MUST perform zero downstream work prohibited by its rejection reason.
- **FR-015**: Source identity MUST be derived only from a verified proxy chain; client-controlled forwarding headers MUST NOT create arbitrary limiter identities.
- **FR-016**: IPv4, IPv4-mapped IPv6, and IPv6 source identities MUST be normalized consistently, with an approved IPv6 prefix size that balances rotation resistance and shared-network fairness.
- **FR-017**: Raw addresses, emails, cookies, session tokens, MFA values, passwords, and provider secrets MUST NOT be persisted in limiter state, logs, metrics, or error responses.
- **FR-018**: Attacker-controlled limiter, lockout, challenge, idempotency, log, metric, and audit state MUST be bounded in cardinality and expire or aggregate on a documented schedule.
- **FR-019**: The approved public edge MUST be the only Internet-addressable application entry point.
- **FR-020**: Backend load balancers, runtime tasks, databases, service endpoints, and storage origins MUST remain private and accept ingress only from their approved immediate upstream identity or security boundary.
- **FR-021**: Public routing MUST NOT forward internal readiness, administration, scheduler, worker, metadata, or service-only endpoints unless an explicit reviewed contract permits the exact route and identity.
- **FR-022**: Infrastructure validation MUST fail on an Internet-facing origin, public runtime address, public database, broad backend ingress, alternate public API endpoint, direct-origin DNS routing, missing edge protection, or request-count autoscaling.
- **FR-023**: The runtime fleet MUST remain fixed at the reviewed one-user capacity; abusive request volume MUST NOT create additional tasks or workers.
- **FR-024**: Rate-limit and cost signals MUST be low-cardinality, redacted, correlated, and sufficient to distinguish edge block, local throttle, user throttle, global throttle, quota rejection, concurrency saturation, and workload disablement.
- **FR-025**: Actionable edge, authentication, runtime, database, queue, provider, and cost alarms MUST be tested and owned; billing alerts MUST NOT be treated as the real-time admission control.
- **FR-026**: New or materially changed edge rules MUST support observation before enforcement, with false-positive review and a versioned rollback path.
- **FR-027**: Runtime overrides MUST only lower risk, MUST be scoped, audited, time-bounded, and automatically expire; they MUST NOT disable the hard global paid-work ceiling.
- **FR-028**: Production protection settings MUST fail closed when missing, malformed, inconsistent with the declared topology, or weaker than the approved minimums.
- **FR-029**: Local and automated tests MUST use bounded synthetic traffic and fake providers; production load or abuse testing is prohibited.
- **FR-030**: Optional challenge, CAPTCHA, bot-management, or other paid edge capabilities MUST NOT be enabled until their browser behavior, accessibility, privacy, false-positive risk, and worst-case recurring/request cost are separately reviewed.
- **FR-031**: Direct-to-service bearer capabilities such as presigned uploads MUST be issued only after exact source, user, global, byte, and operation admission; MUST use a short bounded lifetime and exact resource scope; MUST prevent a second successful write for the same admitted operation; and MUST have redaction, request/storage-growth alarms, and a kill switch.

### Key Entities

- **Protection Policy**: Versioned rule ownership and behavior for one canonical route or route class, including applicable scopes, thresholds, response, failure mode, and cost drivers.
- **Subject Fingerprint**: A non-reversible keyed identifier for a source prefix, account identifier, user, session, tenant, operation, or global environment.
- **Rate Window**: Bounded usage for one policy and subject scope, including window start, duration, count, limit, expiry, and rejection reason.
- **Concurrency Lease**: Time-bounded authorization for one expensive in-flight operation, including global or workload scope and automatic expiry.
- **Protection Override**: Audited, expiring, narrower policy adjustment with owner, reason, scope, effective period, and rollback behavior.
- **Abuse Signal**: Redacted low-cardinality event or metric describing a decision, rule, route class, scope, and outcome without raw subject data.
- **Origin Boundary**: The approved public edge and ordered private backend hops, including the only allowed ingress relationship at each hop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of externally reachable routes have one canonical protection classification, and adding an unclassified route fails automated validation.
- **SC-002**: In bounded authentication tests, every attempt after the configured source, account, concurrency, or global ceiling performs zero additional password hashes, MFA secret/QR generation, session creation, or provider work.
- **SC-003**: One user distributed across at least 10 sessions and 10 addresses is stopped by the same user ceiling, while changing sessions or addresses does not reset accumulated user usage.
- **SC-004**: At least 100 synthetic rotating source identities and account identifiers cannot exceed the configured global authentication-work ceiling.
- **SC-005**: Negative connectivity and infrastructure tests find zero Internet-reachable backend load balancers, runtime tasks, databases, internal endpoints, or alternate API origins.
- **SC-006**: Direct-origin, forwarding-header spoof, missing-header, IPv4-mapped, and IPv6-prefix tests all produce the intended single normalized protection identity or fail closed.
- **SC-007**: Every rejected paid or resource-heavy request produces zero new provider calls, queue messages, stored objects, exports, or request-driven runtime capacity.
- **SC-008**: The authorized single-user password, MFA, dashboard, liquidity, investment tracker, TIC registry, and entity flows complete successfully below approved limits with no user-visible rate-limit delay.
- **SC-009**: Protection overhead for legitimate below-limit traffic remains within the larger of 5% or 1 millisecond at p95 in a repeatable controlled benchmark.
- **SC-010**: Every abuse and saturation class produces a redacted actionable signal, and tested urgent alarms notify the operator within five minutes.
- **SC-011**: Automated redaction tests find zero raw addresses, emails, passwords, cookies, session tokens, MFA material, or provider secrets in limiter state, shared logs, metrics, and responses.
- **SC-012**: The production cost model identifies every new recurring or request-priced protection component, and no paid bot-management capability is introduced without an approved cost and privacy decision.
- **SC-013**: In bounded presigned-upload replay tests, one admitted operation creates at most one object version; every replay is rejected without issuing another slot or URL and without starting downstream processing.

## Assumptions

- Production remains the documented one-user, single-tenant AWS deployment while this feature is implemented.
- The existing session and MFA authentication flows, retained application pages, authoritative workload-admission module, and production deployment workflow remain in scope and are extended rather than replaced.
- Existing business authorization, financial calculations, provider behavior, and record retention do not change.
- Edge thresholds will be tuned from bounded synthetic and count-only evidence; the specification defines required dimensions and safety outcomes rather than hard-coding final traffic values.
- The branch remains stacked on feature 029 until pull request 37 merges, after which it will be rebased onto `origin/main` before implementation review.
