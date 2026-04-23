# Phase 0 Research: Auth and Access

## Decision 1: Use server-managed session cookies after MFA verification

- Decision: Use opaque, server-managed session IDs stored in HttpOnly, Secure cookies for authenticated sessions; create session only after successful MFA verification.
- Rationale: Aligns with FR-009/FR-011 and reduces token exfiltration risk in browser JavaScript. Supports immediate revocation on role change, deactivation, password change, and MFA reset (FR-010).
- Alternatives considered:
  - JWT access/refresh tokens in browser storage: rejected due to higher leakage risk and revocation complexity.
  - Stateless JWT-only session without server table: rejected because immediate invalidation and auditable revocation events become harder.

## Decision 2: Enforce lockouts in persistent auth-attempt records

- Decision: Persist failed credential and MFA attempts per user/account key; lock account for 30 minutes after 3 consecutive failures for either credential or MFA challenge path.
- Rationale: Directly satisfies clarification + FR-005 and allows consistent cross-instance behavior in single-tenant deployments without requiring Redis.
- Alternatives considered:
  - In-memory counters only: rejected because counters reset on process restart and do not work for horizontal scaling.
  - External rate-limiter service (Redis): deferred as unnecessary complexity for current scale.

## Decision 3: TOTP enrollment is QR-only with admin recovery

- Decision: Use QR-based TOTP enrollment only; require successful code verification to finalize enrollment; no backup codes in V1; add admin-triggered MFA reset path.
- Rationale: Matches clarified spec (FR-019, FR-021a) and keeps initial UX straightforward while retaining account recovery via admin workflows.
- Alternatives considered:
  - TOTP + backup codes: rejected for V1 due to extra secret lifecycle/UI complexity.
  - Email/SMS OTP fallback: rejected because out of scope and weaker security posture for this product.

## Decision 4: Role model is minimal Admin/User with strict server-side enforcement

- Decision: Implement exactly two roles (`Admin`, `User`) and enforce authorization on server handlers for all admin endpoints in addition to client-side route gating.
- Rationale: Satisfies FR-013 to FR-017 and prevents privilege escalation through direct API calls.
- Alternatives considered:
  - Client-only gating: rejected as insufficient security control.
  - Fine-grained permission matrix in V1: rejected as unnecessary complexity before baseline auth is stable.

## Decision 5: Audit events are first-class write requirements (fail closed)

- Decision: Every security/admin mutation writes an audit event in the same logical transaction boundary; on audit write failure, reject the action.
- Rationale: Required by FR-024 to FR-027 and System Constitution §13 (never lose audit history).
- Alternatives considered:
  - Async best-effort audit logging: rejected because dropped events would violate constitution requirements.
  - Client-side audit events: rejected because client events are non-authoritative and tamper-prone.

## Decision 6: API contract style is OpenAPI 3.1 with explicit auth/admin endpoints

- Decision: Define a versioned REST contract (`/v1`) in OpenAPI 3.1 for login, MFA verify, session introspection/logout, user invitation, role updates, deactivate/reactivate, and MFA reset.
- Rationale: Provides a single contract source for frontend integration, API implementation, and contract testing.
- Alternatives considered:
  - Ad hoc JSON docs: rejected due to drift risk.
  - GraphQL: rejected because this feature is workflow/mutation-heavy with straightforward REST semantics.

## Decision 7: UI implementation remains Tailwind-based and catalog-normalized

- Decision: Keep Tailwind + headless primitives + framer-motion + lucide-react as the UI implementation substrate and normalize screens to Atlas component catalog names/contracts.
- Rationale: Matches clarified Q5 decision, amended UI Constitution §1, and existing generated screens/components in `apps/web`.
- Alternatives considered:
  - Rewrite to Material UI now: rejected due to rework and mismatch with current generation pipeline.
  - Unstructured one-off page components: rejected by UI Constitution §3 and §10.

## Decision 8: Auth/API module placement in monorepo

- Decision: Implement backend auth/access modules under `apps/api/src/modules/{auth,admin,audit}` with shared TypeScript types in `packages/types/src`.
- Rationale: Aligns with modular monolith architecture and keeps frontend/backend contracts cohesive.
- Alternatives considered:
  - Implement all logic in frontend mock service: rejected because FR-024+ audit and real authorization cannot be enforced client-side.
  - Split into independent microservices: rejected as unnecessary for single-tenant V1.
