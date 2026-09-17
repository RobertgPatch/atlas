# C1 and C2 follow-up remediation requirements

This document defines the subsequent changes needed to close the two critical governance findings identified before feature 030 implementation. [EX-030-001](./EX-030-001.md) permits repository work while these items remain open; it does not authorize production.

## C1 - separate implementation readiness from production activation

### Problem

The plan correctly marks identity/MFA and legal/incident gates as `FAIL FOR REAL APPLY`, but constitution 1.0.0 treated every failed non-negotiable gate as a stop to all work. The plan's statement that repository implementation could continue was therefore internally inconsistent.

### Required change

- Preserve separate gate states for planning, local implementation/testing, review/merge, production deployment, and continued production use.
- For every failed or conditional gate, identify the exact blocked scope and cite either remediation evidence or an active exception ID.
- Keep the feature 029 unique Tony/Robert identities, production MFA, K-1 inventory, WISP/incident readiness, applicability review, backup/restore, and operator cost acknowledgement as production activation blockers.
- Ensure deployment scripts and production evidence fail closed when any production blocker or applicable exception has expired.
- Remove the C1 exception reference only after the plan, release checklist, and automated/policy gates agree on these boundaries.

### Acceptance evidence

1. Constitution check and production-activation evidence use the same scope vocabulary and blocker list.
2. A negative test proves repository-ready status cannot authorize a real AWS Apply.
3. An expired/missing exception blocks its affected action.
4. Review records distinguish implemented, mergeable, deployable, and production-active states.

## C2 - add the explicit authorization matrix

### Problem

The artifacts describe actors and trusted identity sources in prose, but they do not provide the required explicit matrix for new access and admission decisions.

### Required change

Add a versioned authorization matrix, referenced by the spec, plan, threat model, route-policy contract, and tests. At minimum, each row must include:

- physical or service actor;
- authentication and trusted identity source;
- tenant/entity/resource scope;
- route or operation class;
- required role/action permission;
- rate-limit subject dimensions applied independently;
- allowed outcome and explicit denied/cross-scope outcome;
- fail-closed behavior when identity, proxy, tenant, or admission state is missing;
- audit/metric evidence; and
- positive and negative test IDs.

The matrix must cover Tony Patch, Robert Patch, scheduler/workload identities, deployment/health automation, unauthenticated clients, authenticated automation, malicious clients, and direct-origin attempts. It must also cover login, MFA verify/enrollment, ordinary reads/writes, heavy reads/downloads, paid/provider work, uploads, internal routes, health checks, and unknown/unclassified routes.

### Acceptance evidence

1. Every external route class maps to exactly one matrix policy and owner.
2. Rate-limit admission is explicitly non-authorizing and cannot widen any role/entity permission.
3. Negative tests cover unauthenticated, wrong-role, wrong-entity, request-supplied tenant, untrusted proxy, direct-origin, and unclassified-route cases.
4. Route inventory and matrix validation fail when a route or actor/action pair lacks an explicit policy.

## Closure

Robert Patch closes EX-030-001 only after both acceptance-evidence sets are versioned and passing. If remediation is incomplete on 2026-09-28, work in the excepted scope stops unless a new dated exception record is approved; the current record must not be edited to extend its expiry.
