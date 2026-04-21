# Atlas System Constitution

## 1. Core Philosophy
Atlas is a client-centric financial intelligence system, not a full accounting system.

The system MUST:
- model the client's owned financial position
- prioritize correctness and auditability
- require human validation before finalization
- support extensibility for future document types

The system MUST NOT:
- assume complete external financial data
- infer values without traceability
- bypass review workflows for financial data

## 2. Data Source Hierarchy
All data in Atlas must be one of:
1. Parsed Data
2. Manual Data
3. Calculated Data

No value may exist without belonging to one of these categories.

## 3. K-1 Workflow Invariants
Lifecycle:
UPLOADED -> PROCESSING -> NEEDS_REVIEW -> READY_FOR_APPROVAL -> FINALIZED

Rules:
- No K-1 may skip states.
- FINALIZED requires explicit user approval.
- FINALIZED data is trusted for reporting.
- FINALIZED rows must be auditable.

A K-1 MUST NOT be finalized if:
- entity is not mapped
- partnership is not mapped
- tax year is missing
- partnership name is missing
- reported distribution from Box 19A is missing or invalid
- user approval is missing

## 4. Distribution Definition
In V1:
- Distribution = reported / expected distribution from K-1 Box 19A
- This is NOT actual cash received
- It must be stored distinctly from future actual cash values
- Naming must be explicit: `reported_distribution_amount`

## 5. Entity and Partnership Model
Entity:
- client-owned financial subject
- types: Individual, Trust, LLC, LP, Corporation, Foundation, Estate

Partnership:
- client investment position
- belongs to exactly one entity
- produces K-1 documents
- does not model the full outside ownership universe

## 6. Reporting Model
Reports derive from:
- finalized K-1 data
- partnership metadata
- FMV snapshots
- manual user inputs

The system MUST distinguish parsed vs manual vs calculated values.

## 7. Activity Detail Rules
Activity Detail rows are keyed by:
(entity_id, partnership_id, tax_year)

Created or updated only after K-1 finalization.
Manual fields persist across updates.
Parsed fields may be recalculated.
All changes must be audit logged.

## 8. Editing Rules
Editable financial data must:
- support inline editing
- persist immediately
- support single-step undo in V1
- create audit events

## 9. Security Requirements
- Email/password + MFA for all users
- RBAC
- encryption in transit
- encryption at rest
- audit logging

## 10. Deployment Model
- single-tenant per deployment
- VPS or on-prem supported
- no shared SaaS assumptions

## 11. Extensibility Rules
Support future document types through:
- generic documents table
- modular parser interface
- document-type aware workflow

V1 UI must remain K-1 focused.

## 12. UI Principles
- professional financial system
- clarity over decoration
- dense but readable data views
- shared dashboards first
- role-aware feature visibility, not separate apps

## 13. System Integrity Rules
The system MUST:
- never silently mutate financial data
- never overwrite user-corrected values without logging
- never lose audit history
- always preserve traceability to source documents
