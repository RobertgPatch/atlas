# Jackson System Architecture

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

## Holdings statement ingestion

Liquidity statement ingestion is a provider-neutral, versioned pipeline:

```text
immutable CSV/XLSX source
  -> bounded reader
  -> structural adapter registry
  -> format adapter(s)
  -> canonical statement draft and typed source evidence
  -> shared normalization and reconciliation
  -> explicit account selection/review
  -> atomic snapshot publication
```

Adapters represent export patterns, not custodians as a whole. The initial catalog contains Merrill Lynch holdings CSV, Charles Schwab positions CSV, and Morgan Stanley holdings XLSX. Detection uses validated structure and compatibility; filenames and user-supplied custodian labels do not select parsers. All adapters emit the same canonical model, so account replacement, symbol aggregation, valuation, review, and reporting contain no custodian branches.

CSV is decoded and tokenized with byte, row, column, field, and record limits. XLSX is treated as an untrusted ZIP/XML package: package type, entry names, duplicate entries, expansion, XML depth/attributes/text, relationships, worksheets, cells, strings, styles, and dimensions are bounded before interpretation. Formulas are never evaluated and external references are never fetched. Parsing runs in a time- and memory-bounded worker; immutable source hashes and fenced leases prevent late or duplicate publication.

Every relevant source record receives a disposition and every canonical value retains typed evidence. Adapter/version recipes, canonical hashes, reviews, account selections/exclusions, applications, and originals are retained. Reprocessing creates a new run and never rewrites an approved interpretation. There is no Plaid or other holdings provider in this path.
