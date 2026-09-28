# Threat Model: Liquidity CSV Imports

Restricted assets: original CSV, account identity, row/field evidence, monetary values, corrections and approved holdings. Boundaries: browser/API, purpose-bound object upload/download, object/API parser, DB draft/apply, market-price enrichment and spreadsheet export. File content is data and cannot direct the assistant or application.

| Threat | Control | Verification |
|---|---|---|
| Formula/instruction-like CSV cells | Never evaluate; strict numeric grammar; escaped UI; spreadsheet-safe generated export text | Formula, control-prefix, HTML and instruction strings remain inert; signed losses remain numeric |
| Huge fields, malformed quotes, mixed widths or invalid encoding | Byte/row/column/field/preamble/runtime caps; streaming parse; no skip-on-error | Boundary/over-limit/truncated/multiline fixtures |
| Header spoofing/prototype keys | Parse arrays; explicit canonical field allowlist; reject duplicate mapped headers; no object key execution | Ambiguous aliases and dangerous header names rejected |
| Silently omitted/duplicated holdings | Source-record disposition, footer separation, occurrence IDs, no ticker dedupe | Repeated funds, totals, unsupported rows, missing tickers |
| Wrong basis/gain due sign, percent or scope | Exact arithmetic, precedence, signed dollar derivation, percentage units, coverage checks | Negative/near-zero/-100%/incomplete/mixed-scope cases |
| Partial export wipes positions | Full-account preview/declaration; empty requires reason; parser failure cannot publish | Filtered/blank/truncated/zero-account workflows |
| Old file overwrites current data | Effective date ordering; explicit same-day ambiguity resolution; optimistic revisions | Backdated uploads and concurrent same-day corrections |
| Unauthorized account/file access | Session/Admin/entity checks on every route/job/evidence request | Cross-entity IDOR, hash existence and mapping tests |
| Capability replay/storage amplification | Conditional create, short expiry, verified storage version/hash, durable quota | Replayed PUT/complete cannot create accepted extra work |
| Retry/race duplicates | Unique attempts, leases/generation, applied idempotency keys and locks | Crash/reclaim/replay and stale worker tests |
| Raw financial data in logs/errors | Finite reason codes, protected evidence, opaque IDs only when needed | Canary scans of telemetry, errors and audit summaries |
| Default-off flag bypass/cached quote leakage | Enforce flag in all Liquidity read/export/auto/manual/scheduled paths, mode-aware cache | False/true/false and existing cached-quote tests; zero calls while false |
| Incorrect quote mapping | Vetted identifier aliases, instrument/currency/unit eligibility; CSV fallback | Slash symbols, unknown securities, cash, bonds/options |
| History look-ahead/false return | Account-wise effective snapshots, no today's holdings backfill, actual interval/coverage | Independent upload dates and sparse observation tests |
| Loss of source/history | Immutable approved evidence, additive migrations, versioned storage and recovery | Restartable backfill, last-good rollback, restore evidence |
| Plaid secret leakage | No secret copy to neutral tables; redacted revoke/null procedure | Secret/config regression tests |
| Unintended AI disclosure/cost | No extraction adapter invocation or automatic fallback in CSV pipeline | Provider-call spies remain zero for valid and malformed CSV |

## Failure behavior

Malformed/unsupported records or unresolved financial contradictions cannot produce an active snapshot. Known omissions such as unavailable basis may publish only under explicit reviewed coverage policy. No source total is a distinct acknowledged condition, never a false reconciliation pass.

Parser failure retains prior approved data and a durable finite status. Database/audit failure rolls back apply. Newer review or lease generation rejects stale completion. Kill switches stop admission/parse/apply independently without deleting evidence.

## Residual risks

A valid CSV can still be a deliberately filtered export; structural validation cannot prove completeness when the broker supplies no independent total. Full-account declaration and visible removals/value delta reduce that risk without inventing evidence. Uploaded positions can become outdated before another export. Unsupported instrument pricing remains at CSV values. Existing project retention/identity/recovery risks remain tracked under feature 030.
