# Normalization and Financial Control Contract

## Canonical values and precedence

Every adapter emits the same fields, regardless of how many columns its source provides. Preserve source meaning, original field/location, availability, units, and completeness. Richer exports fill more supported fields; sparse exports use only applicable shared derivations. Extra unsupported columns remain locatable in the protected original, without creating speculative financial fields.

| Field | Precedence and missing behavior |
|---|---|
| Currency | Explicit source currency; otherwise the confirmed USD default with provenance. No implicit FX. Explicit unsupported non-USD/mixed currency cannot be relabeled USD or summed into USD portfolio totals. |
| Asset category | Reviewed choice; specific tested adapter instrument mapping; unambiguous source product classification; compatible vetted symbol fallback; Other. Record original product label and interpretation. |
| Quantity | Source quantity in declared units. Optional for cash; do not invent one share or set quantity equal to dollars. Missing non-cash quantity remains unavailable and prevents unit-based calculations. |
| Price | Source quote in declared units. Unknown quote convention is not a reason to discard a usable reported market value. |
| Market value | Complete reported amount. If missing, exact quantity × price × supported multiplier may be derived only when currency, units, accrual inclusion, and pricing semantics are verified. Otherwise a required-value finding blocks that account. |
| Basis | Reviewed basis; usable imported canonical basis; value minus compatible dollar unrealized gain; estimated value / (1 + compatible gain ratio); confirmed cash convention; unavailable. Explicit source-incomplete basis never becomes complete through these fallbacks. |
| Unrealized gain | Usable reported gain on the same basis/value convention; otherwise value minus complete compatible basis. Unknown/incomplete gain remains unavailable. |
| Gain ratio | Usable source ratio with declared units; otherwise compatible gain / positive basis. Zero or negative basis does not produce an invented return percentage. |
| Day change | Preserve reported dollar/ratio change when available. Do not derive portfolio day change from price change without established quantity/timing semantics. Missing data is nonblocking; display restoration is out of scope. |
| Accrued interest | Preserve separately, with explicit included/excluded/unknown market-value convention. Never add it to a value that may already include it. |

Use explicit zero as a valid value. Null, `--`, supported missing markers, and incomplete indicators are not zero. Malformed required numeric input is not a permitted optional omission. Nonblocking absent fields should not require repeated warning acknowledgment just to upload a statement.

## Morgan Stanley basis decision

The user selected **Adjusted Cost first, with Total Cost fallback when adjusted cost is unavailable**. Store both source observations and a `basisSourceField` interpretation. An explicit zero adjusted cost wins over a nonzero total cost. An explicitly incomplete adjusted cost is not treated as an ordinary blank and does not become complete automatically.

When both complete values differ, use adjusted cost and preserve total cost as supporting evidence; the difference alone is not an error. Validate reported gain against the selected basis only if the adapter establishes that it uses the same adjusted-cost convention. A proven inconsistency becomes an actionable finding; unknown compatibility leaves the ratio/gain unavailable for incompatible derivations rather than silently switching basis to make arithmetic match.

Source Total Cost and Adjusted Cost footers remain distinct controls with their respective reported-field subsets. Neither is automatically a control for the canonical mixed adjusted/fallback/derived basis total.

## Cash rules

Cash and cash-like classification requires an explicit source category or a tested instrument identity/program rule. Initial named cases include the user's Merrill bank deposit program spellings and BLF FEDFUND; Morgan deposit categories and the verified money-market instrument belong in its adapter/catalog fixtures.

- Confirmed value-only cash can use `basis = marketValue`; preserve quantity and price as unavailable.
- Confirmed at-par cash or money-market holdings can use `basis = marketValue` when complete basis/gain/ratio are absent and their valuation convention supports par accounting.
- Existing compatible reported basis or gain takes precedence. Foreign-currency cash, known non-par instruments, explicitly incomplete source basis, and contradictory data do not receive a fabricated zero gain.
- `price == 1` without confirmed cash semantics is never sufficient. A non-cash Other Holding at one retains missing basis as missing.

Derive gain as value minus basis when permitted, so confirmed cash at value produces zero. This is unrelated to the partnership capital-activity display floor: legitimate negative unrealized gain/loss in Liquidity must remain negative.

## Exact decimals, percentages, and rounding

- Preserve source strings and XLSX numeric XML lexemes. Expand scientific notation with a bounded BigInt coefficient/exponent routine, never Number/parseFloat.
- Canonical quantity/price/money scales remain eight decimal places; ratios use twelve. Enforce existing database magnitude limits. More source precision is quantized explicitly with half away from zero, recording raw evidence and the rounding operation. Do not round to display cents before aggregation.
- Perform addition/subtraction/multiplication/division in exact fixed-scale arithmetic, with documented final quantization and overflow/zero-denominator checks.
- Numeric XLSX cells formatted as percentages represent ratios; text percent tokens represent percentage points. Plain numeric percentage columns follow the adapter's declared export convention. Reject a contradictory field convention rather than divide twice.
- Percentage-derived basis uses `value / (1 + ratio)` only when the ratio is a whole-position unrealized gain on compatible basis and the denominator is positive. Mark the result estimated because source percentage rounding loses precision. Cumulative investment return, account performance, allocation percentage, and day change are not substitutes.
- Every declared total has its own exact tolerance. Default USD market-value control tolerance is $0.01. An adapter may declare a greater rounding bound only when its source rounding convention supports it and tests prove the bound. Review cannot change a tolerance merely to silence an error.
- Source percentage comparisons use the rounding interval implied by reported precision. Dollar comparisons using estimated percentage-derived basis must not create a false exact-source mismatch.

## Valuation conventions and quote eligibility

Canonical convention fields include price unit (`PER_UNIT`, `PERCENT_OF_PAR`, `PER_CONTRACT`, `UNKNOWN`), quantity unit, exact multiplier, currency, accrued-interest inclusion, and verified provider identity.

Synthetic example: quantity 1,000 principal and quote 98 percent of par gives value 980 with multiplier 0.01 when the export convention is confirmed. A different instrument with price 98 dollars/share and quantity 1,000 has different semantics. Source market value remains the authority when supplied.

Only instruments with supported equity/fund identity and complete verified unit, multiplier, quantity, currency, and timestamp conventions may use live quotes under the existing flag. Cash, bonds, options, private/other instruments, ambiguous symbols, and unknown conventions retain statement values. Average cost/share and price displays follow those same unit checks. File type and source-kind labels never establish quote eligibility.

## Source controls versus final coverage

Each control is tied to an account, currency, measurement, location, and explicit original row subset. Compare against original imported operands, not normalized additions or user edits. Include a source scope rule and covered occurrence IDs in immutable evidence. A known subtotal is still a control and must match its defined subset; partial does not mean ignore inconsistencies.

Synthetic example: two rows report basis 100 and 200, and a third confirmed cash row has value 50 but no reported basis. A source basis footer of 300 matches the two reported rows. After normalizing cash, Liquidity's complete basis is 350. Both figures are correct for their different scopes.

| Condition | Outcome |
|---|---|
| No reported total | `NOT_PROVIDED`; not a blocking finding |
| Complete value control matches account positions | `MATCHED` |
| Complete value control differs beyond supported tolerance | `MISMATCH`; blocks selected account |
| Explicit partial basis/gain control matches its original subset | `MATCHED`; show partial source coverage separately |
| Explicit partial control mismatches its defined subset | `MISMATCH`; actionable review finding |
| Footer membership/measurement cannot be established | `UNVERIFIABLE`; warning, plus completeness blocker if selected account coverage is uncertain |
| Optional source basis unavailable | Coverage remains partial/unavailable; never imply zero total basis |
| Normalization adds permitted cash/estimated basis | Update canonical coverage; leave original source comparison intact |
| Reviewer corrects value/control | Preserve original comparison; compute compatible reviewed overlay and resolve the effective finding when valid; new preview required |

Subtotal rows and account totals never become holdings. Use only totals whose grain is known; a workbook overview is not a second account's positions. Multiple currencies and included/excluded accrued interest cannot be mixed within a control.

## Review findings

Findings have stable IDs derived from run, scope, location, field/control, and rule version. Include category/severity, account occurrence, sheet/row/column, rule code, actionable text, and authorized exact expected/actual/difference values when relevant.

- Global integrity issues prevent application of any account.
- Account-specific blocking findings prevent application of that account; the reviewer can still select it to inspect and correct the finding. Excluding a demonstrably independent account does not conceal a global or shared-section issue.
- Missing optional data displays availability rather than repeated blocking warnings.
- Estimates and supported formula caches are material warnings; acknowledgments bind to the reviewed value/control hash and run and are invalidated by relevant changes.
- A category change reruns dependent cash rules and invalidates the preview. It cannot mutate a historical approval.
- The review summary links to each blocking field and remains visible after Save review. Currency amounts use USD formatting under the current US workflow, with source precision available in evidence.

Authorized corrections resolve only their compatible effective comparison. Original mismatches remain auditable but are not permanent unresolvable blockers. Simply hiding an issue, clearing a total, or changing a tolerance is not a correction; the reviewed overlay must identify the corrected operand/control and reason.

## Aggregation compatibility

Preserve one parent for compatible same-symbol holdings with differing descriptions, including the user's two-custodian equity case. Extend shared grouping to check currency, instrument/quantity units, price convention, and conflicting reliable CUSIP/ISIN identity. Do not combine incompatible quantities or label mixed-currency values as USD. Represent incompatible observations separately with a clear reason while retaining their legitimate account snapshot values. A broker-local security ID difference alone does not establish a conflict across custodians.
