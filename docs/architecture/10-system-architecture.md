# Atlas System Architecture

## Architecture Style
Modular monolith, single-tenant per deployment.

## Modules
1. Auth & Access
2. Documents
3. K-1 Processing
4. Review & Finalization
5. Entities
6. Partnerships
7. FMV
8. Reports
9. Dashboards
10. Admin
11. Audit
12. Export

## K-1 Flow
Upload -> Store document -> Parse -> Persist fields -> Raise issues if needed -> Review -> Approve -> Finalize -> Update annual activity -> Surface in reports and dashboards

## Extensibility
Use generic documents + parser interface + document-type aware workflow.
V1 UI stays K-1 only.
