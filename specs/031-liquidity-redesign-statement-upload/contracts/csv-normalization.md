# CSV Format and Financial Normalization Contract

Version 2.0.0. This is the authoritative mapping/calculation contract for the two supplied layouts and reviewed additional CSV profiles. All examples below are synthetic. Client holdings, amounts, identifiers and account names are not copied into this document.

## Record parsing

- Use a pinned maintained CSV parser, never `split(',')`. Support quoted commas, escaped quotes and quoted multiline fields. Record ordinals and physical line spans are distinct.
- Default comma delimiter and UTF-8 (optional BOM). Decode UTF-16 only with a recognized BOM and a permitted profile; a legacy encoding requires explicit profile selection. Never silently substitute replacement characters. Reject unsupported encodings/delimiters with an actionable issue.
- Keep all tokens as strings; no automatic number/date/boolean conversion. Preserve raw tokens separately from trimmed normalized forms.
- Enforce byte, record, field, column, metadata-scan, time and concurrency ceilings before expensive processing. No skip-on-error mode.
- Parse metadata/header discovery as a bounded preamble phase. Once a data header is accepted, require its exact width for data/total records. A known title record can have another width; global relaxed-width parsing must not hide truncated holdings.
- Reject duplicate normalized mapped headers, conflicting aliases and missing required headers. Profile signatures are header sets plus allowed metadata structure, not filenames/account names.
- Account for every record as `METADATA`, `HEADER`, `POSITION`, `TOTAL`, `BLANK`, or `UNSUPPORTED`. Unknown populated records block approval. Retain reason/location for any exclusion.
- Literal text, formula-like strings and instructions are inert. Never evaluate spreadsheet formulas or follow cell instructions. Numeric fields containing formulas are invalid numeric data.
- Additional layouts use a reviewed mapping profile with explicit column bindings, percent unit, date format/zone, currency, sign/unit rules and allowed row roles. Persist immutable profile revisions. No JavaScript/SQL/eval expressions.

## Layout A: positions_v1 (Living Trust example)

Detection requires the positions header signature below. The observed export has a quoted one-cell title followed by an empty record and the holdings header. Do not hardcode exactly two preamble records.

| Source header/record | Canonical meaning and rule |
|---|---|
| Title `Positions for account ... as of ...` | Account display name/mask and source local date/time; parse recognized grammar, review masked match. `ET` uses America/New_York date-aware zone conversion. |
| `Symbol` | Source symbol; preserve punctuation such as `BRK/B`. No quote-provider rewrite in source. |
| `Description` | Position description |
| `Qty (Quantity)` | Quantity, commas allowed; missing cash quantity stays null |
| `Price` | Source unit price; `Price Chng` is not the price |
| `Mkt Val (Market Value)` | Authoritative source position value |
| `Cost Basis` | Imported complete basis when numeric; `Incomplete` is explicit incomplete status |
| `Gain $ (Gain/Loss $)` | Signed source unrealized gain/loss dollars |
| `Gain % (Gain/Loss %)` | Source percentage in percent points with `%` suffix |
| `Day Chng $ (Day Change $)`, `Day Chng % (Day Change %)` | Source daily value change, separate from unrealized gain and unit-price change |
| `Price Chng $`, `Price Chng %` expanded headers | Optional unit-price change evidence, not account daily P/L |
| `Asset Type` | Map Equity -> equity; ETFs & Closed End Funds -> fund subtype retained; Cash and Money Market -> cash-equivalent category retaining instrument subtype |
| `% of Acct (% of Account)` | Optional rounded allocation check, never account value/basis |
| Ratings/reinvestment columns | Optional source evidence; not financial amounts |
| `Cash & Cash Investments` record | Real position; no ticker/quantity required, not a total row |
| `Positions Total` record | Account control values only; never a security |

Findings from authorized sample inspection:
- Position values reconcile to the source total and source gain dollars reconcile to their total.
- There is an explicit incomplete basis, missing basis markers on cash-equivalent rows, and a repeated money-market symbol on two distinct records.
- The sum of numeric position basis fields does not equal the footer basis as read; preserve scope/coverage and review this independently. Do not call all basis complete because a basis column exists.
- The footer must not be used to allocate a residual basis to an incomplete holding.

## Layout B: merrill_holdings_v1

| Source header | Canonical meaning and rule |
|---|---|
| `COB Date` | Account observation date (US M/D/YYYY); date-only close-of-business precision |
| `Security #` | Brokerage-local identifier; never globally unique by itself |
| `Symbol` | Source symbol; `--` is unavailable, not a ticker |
| `CUSIP #` | Identifier string, preserving leading zeroes |
| `Security Description` | Position description and evidence for reviewed classification |
| `Account Nickname`, `Account Registration`, `Account #` | Account grouping/matching evidence; require entity-authorized binding; mask ordinary displays |
| `Quantity`, `Price ($)`, `Value ($)` | Source quantity, unit price, authoritative position value |
| `Unrealized Gain/Loss ($)` | Signed unrealized dollar result used in basis derivation |
| `Unrealized Gain/Loss (%)` | Bare percent points: `-20.27` means -20.27%, not -2027% |
| `Cumulative Investment Return ($)`, `Cumulative Investment Return (%)` | Distinct return measures; never substitutes for unrealized gain/loss or cost basis |
| `Accrued Interest ($)` | Separate nullable interest; do not add to position value unless documented value convention excludes it |

The observed layout has no explicit cost basis, asset-type, currency-code, daily-change or account-total column. The current statement workflow defaults absent currency to USD and absent classification to `unknown`; no total is invented. All observed priced equity rows with dollar unrealized results support basis = value - signed gain/loss, and their displayed percentages agree after rounding. Rows with a $1 source price and no gain/loss dollars or percentage use the named `CASH_AT_PAR` convention.

Group by the account identifier within the authorized entity and custodian, then require consistent COB date per account. A nickname/mask match alone cannot bind or merge accounts. Mixed account dates are allowed across groups; contradictory dates inside one full snapshot block review.

## Exact normalization

Canonical quantities/prices/money are bounded decimal strings backed by PostgreSQL numeric. Proposed storage: numeric(28,8) quantities, numeric(28,8) prices/money and numeric(28,12) ratios. Reject excess precision/overflow unless an explicit profile rule records rounding; do not silently truncate. Use scaled BigInt arithmetic or a reviewed exact decimal library, never parseFloat/Number for authoritative results.

Normalize numeric whitespace, currency glyphs, thousands separators and parentheses under the profile's locale:
- `($250.50)` and `-250.50` -> `-250.50`.
- `--`, `-`, `N/A`, blank -> null plus the appropriate unavailable/not-applicable reason.
- `Incomplete` -> null plus `INCOMPLETE_SOURCE`; preserve any separately supplied partial basis as partial, not complete.
- A real numeric zero remains zero.
- Currency must be source-stated, profile-documented and reviewer-confirmed, or explicitly selected during review. A dollar sign alone is not proof of USD. Group/total by currency; do not sum mixed currencies as USD.
- Dates come from structured title/COB data first. Filename is only a suggested fallback that requires confirmation. Never use upload time silently. Date-only COB does not invent an exact quote timestamp. Reject genuinely future as-of dates relative to the source zone unless corrected with evidence.

## Field precedence and calculations

Let M = source market value, B = complete basis, G = signed unrealized gain/loss dollars and p = percentage expressed as a decimal ratio. Operands must share position, currency, scope and as-of convention.

| Priority/field | Rule |
|---|---|
| Reviewer correction | Highest reviewed value, with reason, evidence and immutable original retained. Recompute dependents. |
| Explicit complete basis | Use imported B. Independently compare imported G and p where present. Never overwrite B to force reconciliation. |
| No B, numeric M and G | Derive B = M - G. This is the Merrill default. A loss is negative, so subtracting it increases basis. |
| Numeric M and complete B, no G | Derive G = M - B. |
| Numeric G and complete B > 0, no p | Derive p = G / B. Otherwise p is unavailable; zero basis does not mean zero percent. |
| Only M and reported p supports B | Derive labeled estimate B = M / (1 + p), for positive-basis long-position semantics. Require denominator > 0 and known percent units. Do not derive for p <= -100%. Retain `estimated=true` because displayed percentages are rounded. |
| G / p | Algebraically possible when semantics match and p != 0, but not the default when M and G exist. Near-zero rounded p makes it unstable. No automatic use. |
| Explicitly incomplete basis | Do not reconstruct a whole position from potentially partial G/p. Keep unavailable until scope is confirmed/corrected. |
| Average unit basis | B / quantity only for nonzero quantity and a supported unit convention. Bonds/options may require factors. |
| Missing market value | Blocking unless derivable with verified currency, quantity, price, quote unit and multiplier. No generic multiplication for unknown instruments. |

Synthetic examples: M=800, G=-200 -> B=1000; M=1250, G=250 -> B=1000; M=800 and p=-20% -> estimated B=1000. Explicit B=1000 is retained if other data conflicts. If M=800 and both G and p are missing, B is unknown unless the $1 cash rule applies or the row is explicitly classified as value-only cash without quantity.

Cash conventions:
- A same-currency row with source price exactly $1 and no G or p has economic basis = value and unrealized gain = 0 under the named `CASH_AT_PAR` rule. This is liquidity presentation, not tax-lot evidence; label its derivation.
- An explicitly classified cash holding may omit quantity and price. When it has a complete market value but no B, G or p, use market value as basis under the named `CASH_VALUE_BASIS` rule and derive unrealized gain as zero. Do not invent a quantity.
- A confirmed stable-value money-market position with numeric G=0 supports B=M-G even if the basis cell says N/A. Missing G is not automatically zero; any at-par convention requires confirmed instrument/currency/price semantics.
- Foreign-currency cash, floating-NAV funds and negative balances need their actual valuation/sign convention. Do not apply the same-currency cash rule.
- Accrued interest stays separate unless a documented profile defines clean/dirty value. Never double-count it or derive basis using incompatible value/G scopes.

## Reconciliation and coverage

1. Independently sum approved position source values per account/currency, excluding control rows.
2. For a source total displayed to cents and positions also displayed to cents, default permissible absolute difference is one cent. If source rounding units differ, compute the bound from half each declared position rounding unit plus half the total rounding unit and show it. Do not widen tolerances ad hoc to pass.
3. Validate M = B + G where all inputs are complete and compatible. Use source rounding units; a mismatch creates a blocking issue until corrected or the differing source scope is established.
4. Compare imported percentage by rounding calculated 100*G/B to the source's declared decimal places (half-away-from-zero). Values inside half a displayed unit are consistent; outside are a review issue. Percent checks never replace dollar checks.
5. Basis/gain footer checks operate only over compatible coverage; a footer may include amounts omitted on detail rows. Report `PARTIAL_SOURCE_COVERAGE` with the affected count and reason. A coverage warning cannot be used to excuse a mismatch among fully comparable rows.
6. If no independent source total exists, `NOT_PROVIDED` is the result. Show calculated total and full-export confirmation without creating a review finding; never mark it `MATCHED`.
7. Totals include all known market values. Basis/gain totals show known sums, unknown/incomplete counts and estimated/convention amounts. The full total is null if incomplete; a separately labeled known subtotal is permitted. Aggregate percentages use matching numerator/denominator coverage, never sum percentages or divide a partial gain by total basis.
8. Missing daily change remains unavailable and does not create a review finding. Do not populate or display it as zero, or infer it from unrealized gain or movement since the previous upload.

## Duplicate positions and complete exports

Every source record has its own immutable ID. A symbol is not a row key. Repeated symbols, multiple tax lots, cash sweeps and missing tickers are preserved. Aggregate only confirmed same-instrument/currency/unit rows for display: sum quantity/value/compatible basis and G, derive weighted price and ratio from totals. Any incomplete contributing row makes the corresponding aggregate incomplete.

Identical repeated rows trigger review, not silent deletion. Distinguish repeated rows from duplicate files: file hash idempotency applies to imports; row identity preserves occurrences.

The user confirmed each CSV is a complete snapshot from one custodian. A full replacement applies to exactly the reviewed account(s) within that custodian and entity. A same-symbol holding at another custodian or another account remains unchanged; accounts absent from the file are not cleared. Scope replacement by stable source-account identity, never ticker or custodian name alone. Absent assets leave only that account's current composition; keep historical evidence and do not invent realized sale proceeds or liquidation events. Show rows added/changed/removed, total change and coverage in preview. Large changes are visible and require acknowledgment; they are not proof of a bad file. Partial/filtered exports cannot replace the account. An empty account needs recognized structure, explicit zero-position confirmation and reason.

## Source dates and pricing

Preserve uploaded price/value, basis and effective time forever. Only when `REAL_TIME_EQUITIES_ENABLED=true` can a recognized eligible equity quote produce a separate newer value using approved quantity and supported multiplier. Default false uses CSV values even if a newer cached quote exists; all Liquidity refresh entry points must skip quote-provider work. Recompute displayed unrealized G against that displayed value and the same complete B; retain imported G for evidence. Source daily changes stay labeled with their original date and are not carried forward as today's movement.

Unknown/ambiguous symbol mapping, unsupported bond/option conventions or price timestamps before the source observation retain CSV value. No security matching by description alone for repricing. Current portfolio totals may mix holdings/price dates; expose the range and coverage.

## References

CSV record handling follows [RFC 4180](https://www.rfc-editor.org/info/rfc4180/). The selected parser supplies BOM, string casting controls, raw record/info, and size limits ([csv-parse options](https://csv.js.org/parse/options/)). Export defenses follow [OWASP CSV Injection guidance](https://community.owasp.org/attacks/CSV_Injection). Broker mappings and formula checks above come from the two user-supplied files and exact arithmetic, not external financial assumptions.

## Implemented release boundary

The tokenizer accepts variable-width metadata arrays; recognized profiles enforce exact header widths on all populated data/control records before creating holdings. UTF-16 BOM decoding is automatic; Windows-1252 requires explicit mapping after an encoding failure. Percent-only estimates and cash-at-par inference are enabled through the named rules above; quantity/price reconstruction remains disabled. Absent currency and asset type use the explicit USD/unknown defaults for this US-only statement workflow.
