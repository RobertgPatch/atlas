# Implementation Plan: Auth and Access

**Branch**: `001-auth-and-access` | **Date**: 2026-04-20 | **Spec**: `specs/001-auth-and-access/spec.md`
**Input**: Feature specification from `/specs/001-auth-and-access/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deliver mandatory two-factor authentication and role-based access for Atlas with a secure login -> MFA -> verified session flow, Admin/User route gating, and admin user lifecycle operations (invite, role change, deactivate, MFA reset), all with immutable audit events. Implementation will use the existing React + TypeScript + Tailwind web app (`apps/web`) and add an API service in `apps/api` backed by PostgreSQL tables already defined in `docs/schema/21-postgres-ddl.sql` plus feature-specific auth/session/invitation tables.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript (web uses TS `~6.0.2`), Node.js 22 LTS runtime for API, SQL (PostgreSQL)  
**Primary Dependencies**: React 19, Vite 8, React Router 7, Tailwind CSS 3, Framer Motion, Lucide React; API stack selected in research as Fastify + Zod + PostgreSQL client + TOTP library  
**Storage**: PostgreSQL (single-tenant deployment), including `users`, `roles`, `user_roles`, `audit_events`, plus new auth/session/invitation tables defined by this feature  
**Testing**: Vitest + Testing Library (web), API unit/integration tests via Vitest + HTTP contract tests, Playwright smoke path for login->MFA->dashboard  
**Target Platform**: Browser-based web UI + Linux-hosted API service in single-tenant deployment
**Project Type**: Monorepo web application (frontend + API + shared packages)  
**Performance Goals**: `SC-002` login+MFA happy path <30s user completion; auth endpoints p95 <250ms excluding password hash cost; authorization checks on protected routes <50ms server processing  
**Constraints**: MFA required for all users; lockout after 3 failed attempts for 30 minutes; idle timeout 15m and absolute session timeout 8h; fail-closed on audit persistence failure; generic auth error messaging only  
**Scale/Scope**: Single-tenant family office deployment; low-to-medium user counts (tens to low hundreds), but strict security/audit requirements

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Primary constitutions used for gating:
- `specs/000-constitution.md` (system constitution)
- `specs/001-ui-constitution.md` (UI constitution)

Pre-Phase 0 gate check:

1. **Security invariants (000 §9, §13)**: PASS
  - Plan enforces email/password + MFA, RBAC, route/data gating, audit event requirements, and fail-closed admin actions when audit write fails.
2. **Role-aware unified UI (000 §12, 001 §7)**: PASS
  - Single `AppShell` with conditional admin navigation; no separate admin app shell.
3. **Shared UI patterns + states (001 §3, §4, §10)**: PASS
  - Feature scope includes normalization to catalog components and explicit loading/empty/error/populated/permission-restricted states.
4. **Single-tenant deployment assumptions (000 §10)**: PASS
  - Plan assumes single-tenant session, role, and invitation data model.

Post-Phase 1 re-check:

1. **Contracts include server-side authorization and audit semantics**: PASS (captured in `contracts/auth-access.openapi.yaml`)
2. **Data model preserves auditability and traceability**: PASS (captured in `data-model.md` entities and state transitions)
3. **UI normalization rule honored**: PASS (captured in quickstart and implementation guidance)

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-and-access/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/
├── web/
│   ├── src/
│   │   ├── pages/                    # LoginPage, MFAPage, Dashboard, admin pages
│   │   ├── components/shared/        # AppShell, PageHeader, StatusBadge, DataTable...
│   │   ├── auth/                     # auth client/state helpers
│   │   └── features/
│   └── tests/                        # web unit + integration + e2e smoke (to add)
└── api/
    ├── src/
    │   ├── modules/auth/
    │   ├── modules/admin/
    │   ├── modules/audit/
    │   └── infra/db/
    └── tests/                        # contract + integration tests

packages/
├── types/src/                        # shared API/types contracts
└── ui/src/components/                # reusable normalized UI primitives

docs/
├── schema/21-postgres-ddl.sql        # baseline schema
└── ui/                               # screen map, generation contract, component catalog
```

**Structure Decision**: Use the existing web app in `apps/web` for all auth/MFA/RBAC UI and establish `apps/api` as the auth/access service boundary. Shared contracts/types should live in `packages/types`; normalized reusable UI remains in `packages/ui` and `apps/web/src/components/shared` during transition.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
