# ADR-032: Versioned Statement Adapters and Exact File Readers

**Status**: Planned design, 2026-09-28.

**Decision owner**: Robert Patch.

**Scope**: CSV/XLSX holdings interpretation inside the existing Liquidity application. No production authorization.

## Context

The application has separate Merrill and Schwab CSV parsers and shared downstream financial/snapshot services. Dispatch, upload/storage typing, and several source-kind assumptions remain CSV-specific. Morgan Stanley supplies an XLSX export with metadata, holdings, partial cost/gain controls, and footnotes. Future custodians will introduce new patterns.

## Decision

1. Use one versioned adapter per custodian/export pattern, with a static code registry and structural matching.
2. Separate CSV and exact-lexeme XLSX readers from adapters and shared canonical normalization.
3. Reuse review, account matching, immutable snapshot application, history, and report owners, with explicit controls/units and legacy compatibility.
4. Run bounded parser work in a terminable worker managed by the existing API lease owner.
5. Add formats through Codex/developer changes tested against synthetic fixtures and local sample verification. Keep one-off CSV mapping; defer a reusable admin adapter builder.
6. Discover supported accounts/sheets and let the Admin select complete account snapshots. Persist exclusions and apply selected accounts atomically.

## Alternatives

| Alternative | Decision |
|---|---|
| Continue extending a conditional dispatcher | Reject: mixes input kind and format dispatch, weak independent versioning, difficult extension tests |
| Generic column-name heuristic for every file | Reject: cannot establish row grain, hidden account sections, partial totals, or broker-specific financial conventions |
| Reusable no-code mapping product | Defer: user chose Codex-assisted onboarding; complex XLSX still needs tested interpretation rules |
| ExcelJS as authoritative XLSX reader | Reject: numeric coercion loses raw decimal lexemes; retain it for existing exports and fixtures |
| ExcelJS plus a second raw XML pass | Reject initially: duplicated parsing and cross-model cell alignment without a demonstrated benefit |
| Bounded ZIP/XML table reader | Select: preserves exact source tokens and supports the required structured export subset |
| AI/OCR or separate extraction service | Reject: does not solve a demonstrated need for these structured files and introduces cost/data-flow complexity |

## Consequences

There is some new reader/conformance code, but new adapters do not require shared report or financial forks. The supported catalog is explicit, and unsupported files receive a clear draft outcome. Additional format patterns require code/tests rather than silent runtime guessing.

Source evidence becomes richer and more accurate; it requires additive location/recipe/selection metadata and compatibility handling. Scoped controls and explicit units prevent false mismatches and unsafe repricing. Historical approvals do not change when adapters improve.

## Security, capacity, migration, and cost

The [security contract](./security-and-operations.md) and [reader bounds](./readers-and-adapters.md) define ZIP/XML handling, worker termination, data minimization, and tests. Worker isolation is not an OS sandbox; raw values are untrusted and only reviewed code executes. No new external data processor or always-on service is introduced.

The [migration contract](./migration-and-rollout.md) defines additive changes, two-generation reads, activation, and rollback limits. Costs remain existing object/database storage plus bounded parser CPU/memory; deployment-shaped measurements determine whether current resource sizing is sufficient.

## Superseded and preserved decisions

032 supersedes 031's CSV-only input restriction, global parser-version coupling, inferred footer scopes, and price-of-one cash inference. It preserves complete account snapshots, explicit review/apply, missing optional data, immutable history, USD defaults, category review, server-controlled optional quotes, existing roles/scope, and Plaid removal.
