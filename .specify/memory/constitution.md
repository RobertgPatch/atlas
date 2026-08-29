<!--
Sync Impact Report
- Version change: unratified template -> 1.0.0
- Added principles:
  - I. Security, Privacy, and Compliance Are Release Gates
  - II. Unique Identity, Tenant Isolation, and Least Privilege
  - III. Financial Data Integrity, Provenance, and Auditability
  - IV. Architecture and Scale Before Implementation
  - V. Verification Evidence; No Shortcuts
  - VI. Recoverability and Continuity
  - VII. Observable and Incident-Ready Operation
- Added sections:
  - Engineering, Data, and Compliance Constraints
  - Delivery Workflow and Quality Gates
- Removed sections: placeholder-only template content
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
  - ✅ .specify/templates/commands/*.md (directory absent; no command templates to update)
- Active artifacts synchronized:
  - ✅ specs/029-local-dev-aws-production/plan.md
  - ✅ specs/029-local-dev-aws-production/spec.md
  - ✅ specs/029-local-dev-aws-production/tasks.md
  - ✅ specs/029-local-dev-aws-production/contracts/production-cost-model.md
- Follow-up items:
  - TODO(LEGAL-APPLICABILITY): Robert Patch must obtain qualified California legal or
    compliance review before Jackson is offered to an unrelated family office and must
    maintain the applicable-law register meanwhile.
  - TODO(DATA-INVENTORY): Inventory the approximately five real K-1 documents already used
    for OCR testing; verify authorization, storage, access, encryption, provider handling,
    logs, and deletion or approved retention.
  - TODO(IDENTITY-CUTOVER): Replace the shared admin login with Tony Patch's unique account,
    create a separate operator identity for Robert Patch, and require MFA before further
    production use of Restricted data.
  - TODO(RECOVERY-BASELINE): Implement and prove the ratified 15-minute RPO, eight-hour RTO,
    35-day database point-in-time recovery, isolated backups, and quarterly restore tests.
  - TODO(RETENTION-SCHEDULE): Robert Patch must approve a record-class retention and deletion
    schedule after input from the CPA and qualified counsel; no implementation may invent it.
-->

# Jackson Constitution

## Core Principles

### I. Security, Privacy, and Compliance Are Release Gates (NON-NEGOTIABLE)

Jackson MUST protect the confidentiality, integrity, availability, and lawful use of family
office information throughout collection, transmission, processing, storage, backup, export,
and deletion. Tax, financial, identity, estate, trust, ownership, agreement, communication, and
authentication information MUST be treated as Restricted unless an approved data inventory
assigns a stricter control or demonstrates that a lower classification is safe. Restricted data
MUST be encrypted in transit and at rest with current, supported cryptography and protected key
management. It MUST NOT enter source control, unapproved local environments, test fixtures,
URLs, telemetry, logs, uncontrolled caches, or unapproved third-party services.

Every feature that handles Restricted data MUST document its data flow, threats, authorization
rules, retention, provider disclosures, failure behavior, and incident impact before
implementation. Security controls MUST fail closed. Cost, schedule, convenience, backward
compatibility, and feature value MUST NOT justify public exposure, shared credentials, plaintext
secrets, weakened encryption, bypassed authorization, disabled safeguards, or release with a
known exploitable Critical or High vulnerability. This principle exists because a disclosure or
silent corruption could cause material financial, tax, legal, privacy, and personal harm.

### II. Unique Identity, Tenant Isolation, and Least Privilege (NON-NEGOTIABLE)

Every human login MUST identify one physical person; shared human accounts are prohibited.
Tony Patch's CPA access, Robert Patch's developer/operator access, service identities, and any
future user access MUST be distinct. MFA MUST protect every production human account that can
access Restricted data and every privileged AWS, GitHub, database, or deployment action.
Authorization MUST be enforced on the server for every request and background job using
deny-by-default tenant, role, entity, resource, field, and action scope. Hiding a page or control
in the web client is not authorization.

Application, database, AWS IAM, KMS, CI/CD, and third-party permissions MUST grant only the
actions and resources required for the shortest practical duration. Production access MUST use
short-lived roles where supported; long-lived access keys and wildcard permissions require a
documented technical impossibility and an equal or stronger compensating control. Break-glass
access MUST be unique, time-bounded, monitored, and audited.

Jackson is single-tenant until a reviewed design and automated isolation evidence prove
otherwise. No unrelated family office may be onboarded into a shared deployment or database
until tenant identity is mandatory on every applicable record and operation, cross-tenant
positive and negative tests pass, bulk/export paths are scoped, caches and jobs are isolated,
and a threat model demonstrates fail-closed separation. A dedicated AWS stack or database per
family office remains a valid design; a shared multi-tenant design is not presumed.

### III. Financial Data Integrity, Provenance, and Auditability (NON-NEGOTIABLE)

Jackson MUST make every material financial, tax, ownership, estate, trust, partnership,
property, capital, distribution, commitment, valuation, and document-derived value traceable to
its source, actor, time, tenant, method, and transformation. Calculations MUST use exact decimal
semantics, explicit currencies, explicit effective dates and time zones, deterministic rounding,
and documented reconciliation tolerances. Floating-point arithmetic MUST NOT be used for stored
or authoritative monetary calculations.

OCR, extraction, AI, imports, provider feeds, spreadsheets, and inferred matches MUST be treated
as untrusted inputs. They MUST be validated, reconciled, and presented as drafts until an
authorized person accepts them. Automated output MUST NOT silently overwrite an authoritative
record. Corrections MUST preserve prior values and record who changed what, when, why, and from
which source. Security, access, approval, import, export, financial-change, and destructive
events MUST produce durable, append-only or tamper-evident audit records without recording
secrets or unnecessary Restricted content.

Jackson may replace Excel as a source of truth only after documented migration, reconciliation,
and acceptance evidence proves completeness and accuracy. Schema and data migrations MUST be
transactional or restartable, preserve provenance, define compatibility and rollback limits,
and prohibit destructive production changes without a separately reviewed preservation and
recovery procedure. These rules exist because a plausible but unauditable number is not a
trustworthy family-office record.

### IV. Architecture and Scale Before Implementation

Every feature plan MUST evaluate boundaries, dependencies, data ownership, tenant and role
impact, failure modes, performance, observability, deployment, migration, rollback, recurring
cost, and expected scale before code is written. Designs MUST support the known domain of dozens
to hundreds of partnerships, properties, securities, cash positions, agreements, and related
records, plus multiple users with different permissions. Designs that could affect future
unrelated tenants MUST preserve a viable isolation path even while production remains
single-tenant.

Architecture decisions that affect security boundaries, tenancy, source-of-truth ownership,
data stores, public interfaces, availability, or recurring infrastructure MUST be recorded in a
versioned architecture decision record. The record MUST compare alternatives, capacity limits,
security consequences, migration and rollback paths, and total cost. New services, databases,
queues, frameworks, abstractions, or runtime tiers MUST solve a demonstrated requirement and
MUST NOT duplicate an existing owner. Rate limits, quotas, bounded concurrency, and cost alarms
MUST constrain abusive or accidental workloads without weakening authorized use.

Scale-aware does not mean speculative complexity: the smallest design that satisfies measured
requirements, preserves security boundaries, and has an evidenced evolution path MUST be
preferred. A temporary workaround MUST have an owner, documented risk, removal condition, and
expiration; unlabeled shortcuts and permanent TODO-based controls are prohibited.

### V. Verification Evidence; No Shortcuts (NON-NEGOTIABLE)

Acceptance criteria, failure cases, abuse cases, authorization rules, and a test strategy MUST
be defined before implementation for every behavior change. Changed behavior MUST have
automated tests at the lowest useful level and integration, contract, end-to-end, migration,
infrastructure, or recovery tests where boundaries are crossed. Authentication, authorization,
tenant isolation, file upload, financial calculations, reconciliations, exports, destructive
actions, migrations, secrets, infrastructure policy, and incident controls MUST include both
positive and negative tests. A numerical coverage target MUST NOT substitute for risk-based
evidence on critical paths.

Required builds, type checks, tests, dependency and secret scans, infrastructure validation,
security policy checks, and production-shaped validations MUST pass before release. Tests or
scanners MUST NOT be skipped, disabled, muted, rewritten to accept incorrect behavior, or
reclassified solely to make a gate pass. Flaky or unavailable gates fail closed until repaired
or an allowed, documented exception applies. Test and development data MUST be synthetic or
irreversibly de-identified; real Restricted production data MUST NOT be copied into a developer
machine, CI job, fixture, or shared test environment.

Defects affecting unauthorized access, tenant escape, financial corruption, data loss, secret
exposure, audit integrity, or recovery MUST receive root-cause analysis and regression tests.
This principle exists because passing evidence, not implementation confidence, establishes that
a sensitive change is safe.

### VI. Recoverability and Continuity (NON-NEGOTIABLE)

Production data MUST meet a recovery point objective of no more than 15 minutes and a recovery
time objective of no more than eight hours. PostgreSQL MUST have encrypted point-in-time
recovery retained for at least 35 days. Restricted S3 objects MUST use versioning, protected
encryption keys, and encrypted recovery copies in an isolated backup control plane. Daily
backup success MUST be monitored; destructive database or storage changes MUST create and
verify a recoverable checkpoint first. Backup retention beyond the operational window MUST
follow the approved record-class retention schedule.

Restore procedures MUST be documented, automated where safe, and tested at least quarterly in
an isolated environment. A restore test MUST verify data integrity, application compatibility,
authorization, required documents, and the measured RPO and RTO; the existence of a snapshot is
not recovery evidence. Recovery credentials and encryption keys MUST be protected independently
from ordinary application credentials. Final snapshots and retained backups MUST survive
routine infrastructure replacement or deletion.

Single-AZ RDS MAY serve the present single-user cost profile only while restore evidence proves
the ratified objectives and the accepted downtime is documented. Availability architecture MUST
be reassessed before onboarding unrelated tenants, accepting contractual service levels, or
exceeding the documented workload. Cost pressure MUST trigger an architecture decision, never
silent reduction of backup, encryption, deletion protection, or recovery testing.

### VII. Observable and Incident-Ready Operation

Production MUST emit structured, redacted, correlation-capable operational, security, access,
cost, and audit signals sufficient to detect failures, abuse, unauthorized access, unexpected
exports, privilege changes, data corruption, backup failure, and provider drift. Logs and
metrics MUST contain the minimum data required for their purpose and MUST NOT contain document
bodies, tax identifiers, account numbers, credentials, session tokens, MFA material, secret
values, or raw provider responses. Audit data access MUST itself be authorized and audited.

Jackson MUST maintain a written information security plan, data inventory, risk assessment,
incident response plan, breach-notification decision procedure, service-provider inventory, and
recovery plan before continued production handling of Restricted data. Incident procedures MUST
define containment, evidence preservation, credential and key rotation, legal and stakeholder
escalation, recovery, post-incident review, and tracked remediation. Exercises MUST occur at
least annually and after material architecture, tenant, provider, or regulatory change.

Alerts MUST be actionable, severity-classified, owned, and tested. Rate limits and cost alarms
MUST identify bot, abuse, and runaway-provider conditions without becoming the sole access
control. The system MUST fail safely when required telemetry, secrets, databases, migrations,
or readiness checks are unavailable.

## Engineering, Data, and Compliance Constraints

### Current technology baseline

Jackson is an npm-workspaces web application using Node.js 22; TypeScript; Fastify; React,
React Router, and Vite; PostgreSQL 16; Zod; AWS SDK v3; PowerShell 7-compatible operator tooling;
Terraform; Docker; Vitest; and GitHub Actions. Production uses AWS ECS/Fargate, private encrypted
RDS PostgreSQL, private encrypted S3, ECR, Secrets Manager, KMS, CloudFront, WAF, ALB,
CloudWatch, and related managed services in the committed production region.

This stack is a governed baseline, not a permanent ban on upgrades. A material framework,
database, cloud-service, region, tenancy, or deployment-model change MUST include an architecture
decision, supported-version and dependency review, security and data-migration analysis, cost
impact, compatibility plan, rollback plan, and verification evidence. Dependencies MUST be
pinned through lockfiles, continuously audited, and upgraded within a risk-based service level.

### Data handling baseline

The Restricted classification includes, at minimum, K-1 documents and extracted fields; SSNs,
TINs, EINs, signatures, birth dates, and addresses; bank, brokerage, Plaid, liquidity, holdings,
valuation, and transaction data; partnership, property, trust, trustee, beneficiary, estate,
ownership, tax-basis, capital-call, commitment, distribution, agreement, memo, and email data;
credentials and tokens; and sensitive audit records. Masked data remains Restricted when it can
be linked to a person, entity, account, or confidential family-office activity.

Restricted S3 buckets MUST block all public access at account and bucket scope, disable ACLs,
deny insecure transport, use approved KMS encryption, enable versioning, validate and quarantine
uploads, and grant object access only through short-lived, purpose-bound authorization. Database,
snapshot, backup, queue, log, and export storage MUST be encrypted and non-public. Encryption
keys MUST rotate where supported, use least-privilege policies, alert on deletion or disablement,
and have a recovery design.

Collection and display MUST be minimized to the business purpose. Sensitive identifiers MUST be
masked in normal views and omitted from exports unless expressly required and authorized. Data
MUST NOT be sold, used for advertising, or used to train a model. A third-party OCR, AI, email,
analytics, storage, or integration provider may receive Restricted data only after a documented
data-flow, retention, training-use, region, access, incident, deletion, contract, and security
review approves the exact purpose and minimum fields.

GitHub MUST contain source and sanitized artifacts only. Repositories containing Jackson source
MUST be private unless Robert Patch explicitly approves a reviewed open-source subset; human
accounts MUST use MFA, branch protections and least-privilege workflow permissions MUST be
enabled, and secret and dependency scanning MUST run. Git history is not a production-data
backup.

### Security and legal baseline

The following current standards are binding engineering baselines:

- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework) for governance,
  identification, protection, detection, response, and recovery.
- [NIST Secure Software Development Framework 1.1](https://csrc.nist.gov/projects/ssdf) for the
  software lifecycle and supply chain.
- [OWASP Application Security Verification Standard 5.0.0](https://owasp.org/www-project-application-security-verification-standard/)
  Level 2 for application controls and verification. Applicable Level 3 controls MUST be
  evaluated for authentication, authorization, tenancy, cryptography, file processing, and
  Restricted data.
- Applicable AWS Well-Architected Security Pillar and AWS Security Hub Foundational Security
  Best Practices controls, enforced through Terraform or documented evidence.
- The protective controls in IRS Publication 4557, IRS Publication 5708, and the FTC Safeguards
  Rule guidance for taxpayer and financial information. Jackson adopts these as a security
  baseline without asserting that the internal family office is legally a tax preparer or an
  FTC-regulated financial institution.

Jackson operates in California and MUST maintain reasonable security appropriate to personal
information, a breach-assessment and notification procedure, and an inventory of California
personal and sensitive information. Robert Patch MUST maintain a versioned applicability
register covering federal law, California law, CPA confidentiality duties, contracts, provider
terms, and family-office or investment-adviser status. The register MUST distinguish confirmed
legal requirements, counsel interpretations, adopted voluntary controls, and unresolved items;
engineering documentation MUST NOT claim legal compliance based only on this constitution.

Qualified legal or compliance review MUST occur before Jackson is offered to an unrelated family
office, processes another customer's information, materially changes how personal information is
used or shared, meets a privacy-law threshold, or relies on a family-office or investment-adviser
exclusion. CCPA/CPRA, FTC Safeguards Rule, SEC/state investment-adviser rules, tax-preparer rules,
contractual duties, and other state privacy or breach laws MUST be evaluated at that gate. The
applicable-law register and security baseline MUST be reviewed at least annually and whenever a
law, standard, provider, tenant model, data category, or business purpose materially changes.

## Delivery Workflow and Quality Gates

### Specification and design

Every feature specification MUST identify physical actors, tenant and entity scope, permissions,
data classifications and flows, source-of-truth and audit behavior, retention and deletion,
third-party processors, abuse and failure cases, recovery impact, scale, and measurable security
and correctness outcomes. Unresolved facts MUST be marked `NEEDS CLARIFICATION`; security,
privacy, legal applicability, data ownership, identity, tenancy, financial semantics, RPO, and
RTO MUST NOT be guessed or hidden as assumptions.

Every implementation plan MUST pass a Constitution Check before research and again after design.
It MUST include a threat model for new trust boundaries, an authorization matrix for new access,
an architecture decision for material choices, migration and rollback plans, capacity and cost
limits, observability, and verification evidence. A failed non-negotiable principle stops work.
Complexity may be justified only when it is the smallest safe response to a documented need.

### Implementation, review, and release

Tasks MUST make security, testing, data migration, auditability, observability, backup, recovery,
documentation, and cleanup first-class work rather than final polish. Implementations MUST use
the established stack and authoritative modules unless a reviewed architecture decision permits
a change. Generated, OCR, and AI-authored code or data MUST receive the same review and tests as
human-authored work.

Robert Patch is the sole current authority for architecture, constitution amendments, security
deferrals allowed below, and production releases. No two-person approval is required. Sole
authority does not remove evidence: each production mutation MUST bind to an identified operator,
clean reviewed source commit, immutable artifacts, validated saved plan where applicable,
preflight evidence, explicit confirmation, smoke results, and recovery checkpoint. Production
deployments MUST be reversible within documented limits and MUST stop on identity, target,
secret, data, security, cost, migration, readiness, or smoke-check failure.

Before further production use of Restricted data, the shared admin account MUST be replaced by a
unique Tony Patch account, Robert Patch MUST use a separate operator identity, MFA MUST be enabled,
the existing real K-1 test documents MUST pass the approved inventory, and the recovery and
incident-response baselines MUST have evidence. Until tenant isolation is proven, production MUST
remain single-tenant and MUST reject unrelated customer data.

### Security deferrals

There are no exceptions for encryption of Restricted data, unique human identity, production
MFA, server-side authorization, tenant isolation, S3 public-access blocking, secret protection,
audit integrity, backup before destructive change, or release with a reachable exploitable
Critical or High vulnerability.

Robert Patch MAY approve a temporary deferral for a lower-risk finding only when a versioned
record names the control, affected scope, evidence, justification, compensating safeguard, owner,
remediation plan, and expiration. The deferral MUST demonstrate that Restricted data and
non-negotiable principles remain protected, MUST expire within 30 days, MUST NOT renew
automatically, and MUST be visible to plans, reviews, and release gates. An emergency change MAY
use an expedited single-operator path but MUST NOT bypass non-negotiable controls; it requires
contemporaneous logging and a post-incident review within two business days.

## Governance

This constitution supersedes conflicting project practices, specifications, plans, tasks,
documentation, and convenience. When an artifact conflicts, the artifact MUST change or work
MUST stop; the constitution MUST NOT be silently diluted. Robert Patch is the ratifying authority
and may amend the constitution through a reviewed repository change that states the rationale,
affected principles, migration impact, required remediation, and effective date.

Constitution versions use semantic versioning:

- MAJOR for removal, reversal, or backward-incompatible redefinition of a principle or authority.
- MINOR for a new principle, mandatory section, or materially stronger requirement.
- PATCH for clarification that does not change obligations.

Compliance MUST be reviewed in every specification, plan, task set, pull request or equivalent
change review, and production release. Robert Patch MUST conduct a complete review at least
annually and after a security incident, legal or standard change, new data category, material
provider or architecture change, or planned onboarding of an unrelated family office. Review
evidence, unresolved applicability questions, approved deferrals, restore results, incidents,
and remediation MUST remain versioned and auditable.

This constitution is engineering governance, not legal advice or a certification. Legal
applicability MUST be confirmed by a qualified professional when required by the Security and
Legal Baseline; uncertainty MUST be recorded and resolved before the affected business change.

**Version**: 1.0.0 | **Ratified**: 2026-08-29 | **Last Amended**: 2026-08-29
