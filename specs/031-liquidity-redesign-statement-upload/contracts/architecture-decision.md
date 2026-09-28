# ADR-031, Revision 2: CSV Holdings as Liquidity Source

**Status**: Proposed implementation design, superseding the unimplemented PDF-first design.
**Decision owner**: Robert Patch.
**Scope**: Planning revision; no production mutation.

## Decision

Use deterministic CSV parsing on the existing API runtime, immutable originals and parse evidence, a concise authorized review and atomic provider-neutral account snapshot publication. Support irregular upload dates, direct and safely derived fields, and retained equity price updates behind `REAL_TIME_EQUITIES_ENABLED=false`. No AI/OCR/Bedrock/BDA dependency or automatic fallback.

## Evidence

The supplied positions layout has complete column headers but missing/incomplete values, a title prefix, two same-symbol occurrences, a cash summary position and a control footer. Merrill has structured value/dollar gain/percent fields, allowing exact basis derivation with rounded-percent validation; no explicit account total/type/day-change fields. Both require predictable mapping/validation rather than text extraction. See normalization contract and research.

## Alternatives

| Option | Benefit | Decision |
|---|---|---|
| Versioned CSV adapters + reviewed mapping | Exact structured fields, transparent formulas, no per-page extraction charge | Selected |
| CSV split/regex only | Small dependency count | Reject: quoted fields/record boundaries and format drift create omissions |
| Browser-only parsing | Responsive preview | Optional cosmetic preview only; server parsing remains authoritative |
| Synchronous request parsing | Least job plumbing | Reject for durable processing/restart requirements; use API DB-leased job with caps |
| Existing K-1 BDA workflow | Existing provider platform | Unnecessary for CSV; keep separate K-1 behavior |
| PDF/OCR/AI fallback | Possible future unusual inputs | Last resort future amendment only; not triggered automatically |
| Partial holding merge | Handles filtered exports | Not in v1: absence cannot distinguish a sale from omitted data |

## Boundaries and ownership

API owns CSV parsing/review; neutral repository owns account source truth; reports compose analytics; market-data owns later eligible prices. S3 holds original evidence. Source account entity authorization is mandatory. No new third-party disclosure or cross-tenant mode.

Full exports replace an account. Current selection uses effective date/confirmed ordering, not completion time. Earlier snapshots/revisions are immutable. All field transformations carry source/formula evidence. Missing basis/price identifiers never remove value-bearing holdings.

## Capacity and cost

10 MiB, 5,000 data rows by default (25,000 opt-in ceiling after larger-runtime verification), bounded field/record widths, one parse/API process, 30-second processing bound and at most two transient retries. Operational target is <=2,000-row exports in p95 <=5 seconds; measure before claiming it. Default volume envelope is 200 files/rolling 30 days per tenant, configurable.

No extraction-model usage fees and no added always-on service. Existing API CPU, encrypted object storage, KMS requests, DB storage and logs remain metered. At the maximum upload envelope raw new input is bounded at roughly 2 GiB per 30 days before evidence/version/recovery multipliers; retention has no invented expiry. Track actual usage and revisit caps/resources before exceeding limits.

## Security, migration and rollback

Strict input grammar, exact decimals, inert cells, protected originals, entity scope, stale-preview guards and transactional audit. Additive neutral migration preserves historical Plaid source dates/values/parents and price-history FKs. Publish only reviewed imports. Observe repeated CSV replacements/corrections before token retirement; post-retirement rollback serves last approved neutral snapshots without reconnecting Plaid.

## Consequences

Known exports become inexpensive to process and easy to explain. New formats need header mappings/profile tests; unsupported instruments need explicit classification/quote conventions. Sparse CSV observations do not provide transaction history or live account quantities. This limits certain return calculations but does not justify invented values.

Pricing and missing-basis behavior are user-confirmed; full-export feedback and the protective confirmation rule are tracked in the spec. No implementation task may silently change full-snapshot or financial field semantics.
