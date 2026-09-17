# Feature 030 requirements traceability

**Captured**: 2026-08-29  
**Status**: Implementation map; verification becomes complete only when the named task evidence passes.

## Functional requirements

| Requirement | Story | Contract | Primary implementation | Verification task/evidence |
|---|---|---|---|---|
| FR-001 | US2/US3 | Route policy | `routePolicy.registry.ts`, inventory generator | T005, T012, T040, T054 |
| FR-002 | US2 | Route policy, threat model | `localRateLimiter.plugin.ts` | T032-T036 |
| FR-003 | US2 | Route policy | `principalRateLimiter.ts`, `session.middleware.ts` | T033, T037-T041 |
| FR-004 | US2/US4 | Route policy, data model | policy defaults, admission services | T033, T040, T055-T065 |
| FR-005 | US2 | Route policy, ADR | local/principal limiter | T005, T032-T037 |
| FR-006 | US1 | Route policy, threat model | durable/auth admission and auth handlers | T018-T029 |
| FR-007 | US1 | Response and route policy | auth handlers and error mapping | T008, T019-T021, T027-T030 |
| FR-008 | US1 | Route policy, data model | `password.service.ts` hash lease | T019, T026, T031 |
| FR-009 | US1 | Threat model | lockout/auth-attempt migration | T017, T021-T022, T030 |
| FR-010 | US3 | Origin/route policy | WAF class rules and root inputs | T042, T047-T054 |
| FR-011 | US1/US3 | Route policy, ADR | durable auth global plus WAF auth global | T018, T023-T025, T042, T047 |
| FR-012 | US1/US4 | Route policy, response | auth/cost admission before handlers | T018-T030, T056-T066 |
| FR-013 | US4 | ADR, threat model | workload admission/repository | T055-T065 |
| FR-014 | All | Response contract | `protection.errors.ts` and every admission call site | T008, T013, story rejection tests |
| FR-015 | Foundation/US3 | Origin boundary | request source identity/boundaries | T007, T014, T045, T053 |
| FR-016 | Foundation | Origin boundary, data model | request source identity | T007, T014 |
| FR-017 | US1/US5 | Observability, threat model | fingerprints, auth migration, redaction | T009, T015, T017, T021-T030, T069, T082 |
| FR-018 | US1/US2/US5 | Data model, observability | durable/global ordering, partitioned local store, aggregation | T018, T021-T025, T034-T035, T069, T073-T074 |
| FR-019 | US3 | Origin boundary | edge/network Terraform and plan policy | T043-T053 |
| FR-020 | US3 | Origin boundary | network/API/database ingress | T043-T053 |
| FR-021 | US3 | Origin boundary | CloudFront behavior and topology validation | T043-T045, T049-T054 |
| FR-022 | US3 | Origin boundary | production plan policy | T043-T045, T052-T054 |
| FR-023 | US3 | ADR, origin boundary | fixed API capacity and plan policy | T042-T044, T048, T052 |
| FR-024 | US5 | Observability contract | counter buffer and instrumentation | T069, T073-T076 |
| FR-025 | US5 | Observability contract | Terraform alarms/dashboard and runbook | T071, T076, T078, T080 |
| FR-026 | US5 | ADR, observability | WAF action inputs and rollout validator | T071, T075, T079-T080 |
| FR-027 | US5 | Data model | protection-control contracts | T070, T074, T079 |
| FR-028 | Foundation/US3 | Route/origin policy | validated config, startup and plan gates | T006, T011-T014, T042-T054 |
| FR-029 | All | Threat model | bounded fixtures and fake adapters | T002, T016, all story tests, T083-T086 |
| FR-030 | US5 | ADR, observability | Terraform/cost policy prohibitions | T072, T075-T079 |
| FR-031 | US4 | Origin boundary | K-1 slot service and S3 policy | T058, T063, T066-T068, T076 |

## Success criteria

| Criterion | Story | Contract | Primary verification |
|---|---|---|---|
| SC-001 | US2/US3 | Route policy | T005, T012, T040, T054; route baseline/final inventory |
| SC-002 | US1 | Response/route policy | T018-T021 and T019/T020 side-effect spies |
| SC-003 | US2 | Route policy | T033 fairness integration |
| SC-004 | US1 | Threat model | T018 rotating-pair/global-cap test |
| SC-005 | US3 | Origin boundary | T043-T045, T052-T054 and Terraform evidence |
| SC-006 | Foundation/US3 | Origin boundary | T007, T014, T045, T053 |
| SC-007 | US4 | Route/response policy | T055-T068, especially T057/T058 |
| SC-008 | Cross-cutting | Quickstart | T086 retained-flow validation |
| SC-009 | Cross-cutting | Plan benchmark rule | T081 and application-gate evidence |
| SC-010 | US5 | Observability | T069-T080; five-minute alarm evidence |
| SC-011 | US1/US5 | Observability/threat model | T017, T021, T069, T082 |
| SC-012 | US5 | ADR/observability | T071-T077 and executable cost gate |
| SC-013 | US4 | Origin boundary | T058, T066-T068 replay/version tests |

## Governance traceability

- C1/C2 are governed by [EX-030-001](./EX-030-001.md) and the objective follow-up in [c1-c2-remediation.md](./c1-c2-remediation.md).
- Production activation remains separately blocked and is re-evaluated by T087.
- Real AWS Apply and production load/abuse testing are outside every requirement and task above.
