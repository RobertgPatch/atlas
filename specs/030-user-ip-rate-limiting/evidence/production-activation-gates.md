# Feature 030 production activation gates

**Re-checked**: 2026-09-16 (America/Los_Angeles)
**Constitution**: Jackson Constitution 2.0.0  
**Decision**: `EX-030-003: CURRENT MAIN AND BOTH GREEN GITHUB SECURITY JOBS`

## Scope decision

[EX-030-001](./EX-030-001.md) remains the C1/C2 implementation exception. [EX-030-003](./EX-030-003.md) supersedes the earlier time-limited release rule in EX-030-002. The two GitHub security jobs must succeed on the exact current `main` commit before the existing AWS release workflow may run:

| State | Status | Basis |
|---|---|---|
| Local implementation and bounded tests | Allowed and complete | Constitution 2.0.0 exception process plus EX-030-001 |
| Code review and merge | Allowed | EX-030-001 explicitly names both scopes |
| Production deployment/activation | Eligible from green current `main` | EX-030-003: successful Application and Terraform security gates on its `push` run; execution must still succeed |
| Continued single-tenant production handling of Restricted data | Open operational risk | EX-030-003 does not assert compliance or remediate EX-030-002's recorded risks |

PR-only or stale CI does not authorize Apply. AWS identity, target, valid artifacts, runtime compatibility, and smoke results are execution checks, not additional manual approval gates.

## Deferred operational risks, not deployment-eligibility blockers

| Required evidence | Status | Required remediation |
|---|---|---|
| Unique Tony Patch application identity and separate Robert Patch operator identity | OPEN | Remove shared human credentials; record unique account/role evidence and least-privilege access. |
| Production MFA | OPEN | Enable and verify MFA for both production human identities and privileged AWS/GitHub/deployment actions. |
| Restricted-data/K-1 inventory | OPEN | Inventory the approximately five real OCR test documents, authorization, locations, access, encryption, provider flow, logging, and deletion/approved retention. |
| WISP and incident readiness | OPEN | Approve the WISP, risk assessment, incident/breach decision procedure, provider inventory, owners, escalation contacts, and exercise evidence. |
| Operator edge-cost acknowledgement | OPEN | Robert Patch must acknowledge that pay-as-you-go CloudFront/WAF request charges cannot be reduced to zero by origin rate limits, and accept the reviewed response/runbook and $106.20 monthly upper estimate. |
| Production recovery evidence | OPEN | Prove 15-minute RPO, eight-hour RTO, 35-day PostgreSQL PITR, isolated encrypted recovery copies, alerting, and a production-shaped isolated restore. The disposable local 1.02-second restore is compatibility evidence only. |

The legal/applicability register and approved retention schedule remain follow-up requirements. None of the rows above is represented as CI-passing or complete. EX-030-003 removes their separate pre-deployment sign-off while retaining them as open operational risks.

## Repository evidence and its limit

- Production plan-policy fixtures reject disabled MFA, public/origin bypass, unbounded capacity, state hazards, cost drift, and unsafe WAF rollout states.
- The production deployment fixture flow binds prepared plans/artifacts and stops on failed preflight/smoke conditions without mutating AWS.
- Application, migration, Terraform, redaction, bounded-observability, alarm, rollout, and cost evidence is green.
- The application retains one public CloudFront/WAF boundary, a private origin, fixed service capacity, and exact downstream admission.

These results support the exact-main CI release decision. They do not establish the human, organizational, live AWS, or recovery facts listed above.

## C1/C2 follow-up

[c1-c2-remediation.md](./c1-c2-remediation.md) remains required in subsequent changes. C1 must distinguish repository readiness from the owner-directed EX-030-003 release rule. C2 must add and validate the explicit actor/action/resource authorization matrix.

## Release decision

Production release eligibility requires the current canonical `main` SHA and a successful `push` run containing both named GitHub security jobs. The deferred evidence rows do not block `Plan`, `Prepare`, or `Apply`; a technical execution failure must still stop the release. Do not weaken the security jobs or use this decision to claim the deferred work complete.
