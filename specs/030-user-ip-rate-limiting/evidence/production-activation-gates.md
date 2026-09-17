# Feature 030 production activation gates

**Re-checked**: 2026-08-29 (America/Los_Angeles)  
**Constitution**: Jackson Constitution 2.0.0  
**Decision**: `BLOCK REAL AWS PLAN/APPLY AND PRODUCTION USE`

## Scope decision

[EX-030-001](./EX-030-001.md) is active through 2026-09-28 and explicitly permits feature 030 local implementation/testing, review, commit/push, and merge. It explicitly prohibits a real AWS production plan/apply, production traffic activation, and continued Restricted-data use. Repository-ready, mergeable, deployable, and production-active are therefore distinct states:

| State | Status | Basis |
|---|---|---|
| Local implementation and bounded tests | Allowed and complete | Constitution 2.0.0 exception process plus EX-030-001 |
| Code review and merge | Allowed | EX-030-001 explicitly names both scopes |
| Production deployment/activation | Blocked | Not within exception scope; unresolved gates below |
| Continued production handling of Restricted data | Blocked | Constitution identity, data, incident, and recovery requirements |

An expired, revoked, or missing exception stops its affected repository scope. It cannot be used by the production deployment workflow as an Apply authorization.

## Unresolved real-activation blockers

| Required evidence | Status | Closure required before production |
|---|---|---|
| Unique Tony Patch application identity and separate Robert Patch operator identity | OPEN | Remove shared human credentials; record unique account/role evidence and least-privilege access. |
| Production MFA | OPEN | Enable and verify MFA for both production human identities and privileged AWS/GitHub/deployment actions. |
| Restricted-data/K-1 inventory | OPEN | Inventory the approximately five real OCR test documents, authorization, locations, access, encryption, provider flow, logging, and deletion/approved retention. |
| WISP and incident readiness | OPEN | Approve the WISP, risk assessment, incident/breach decision procedure, provider inventory, owners, escalation contacts, and exercise evidence. |
| Operator edge-cost acknowledgement | OPEN | Robert Patch must acknowledge that pay-as-you-go CloudFront/WAF request charges cannot be reduced to zero by origin rate limits, and accept the reviewed response/runbook and $106.20 monthly upper estimate. |
| Production recovery evidence | OPEN | Prove 15-minute RPO, eight-hour RTO, 35-day PostgreSQL PITR, isolated encrypted recovery copies, alerting, and a production-shaped isolated restore. The disposable local 1.02-second restore is compatibility evidence only. |

The legal/applicability register and approved retention schedule also remain constitutional follow-up requirements; feature 030 introduces no exception for them.

## Passing repository evidence that does not remove the block

- Production plan-policy fixtures reject disabled MFA, public/origin bypass, unbounded capacity, state hazards, cost drift, and unsafe WAF rollout states.
- The production deployment fixture flow binds prepared plans/artifacts and stops on failed preflight/smoke conditions without mutating AWS.
- Application, migration, Terraform, redaction, bounded-observability, alarm, rollout, and cost evidence is green.
- The application retains one public CloudFront/WAF boundary, a private origin, fixed service capacity, and exact downstream admission.

These results show that the repository implementation can be reviewed. They do not establish the human, organizational, live AWS, or recovery facts listed above.

## C1/C2 follow-up

[c1-c2-remediation.md](./c1-c2-remediation.md) remains required in subsequent changes. C1 must automate the scope separation and prove repository readiness cannot authorize Apply. C2 must add and validate the explicit actor/action/resource authorization matrix. EX-030-001 must not be edited to extend its expiry and may be closed only after both acceptance-evidence sets pass.

## Release decision

Do not run `Prepare` against live AWS, approve a saved production plan, run `Apply`, change production WAF enforcement, or route production traffic to feature 030. Re-check every row above and the exception status at the future production change window; any missing evidence fails closed.
