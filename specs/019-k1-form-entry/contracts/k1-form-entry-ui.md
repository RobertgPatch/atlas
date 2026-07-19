# UI Contract: K-1 Form-Inspired Annual Entry

## Purpose

This contract defines where Jackson K-1 fields appear and which interactions remain stable. Preview and save continue to use `K1TrackerFieldChange[]`; non-monetary fields use its optional `textValue` property with `amount: null`.

## Form-Level Contract

- The annual editor is one semantic `<form>`.
- All existing supported fields remain present in the DOM without tabs, steps, or required expansion.
- Visual desktop placement may use CSS Grid, but DOM and keyboard order remain: header, Part I, Part II/Item K/Section L, Part III, supplemental workpaper, override, draft, actions.
- The selected tax year is visible in the header.
- The interface states that it is a Jackson data-entry view inspired by Schedule K-1, not an official filed form.
- Preview Calculation, Revert, and Save revisions retain their existing roles and behavior.

## Read-Only Identity Contract

| Form location | Existing source | Missing state |
|---|---|---|
| Part I partnership name | `summary.partnership.name` | Not available |
| Part I EIN | `summary.partnership.ein` | Not available |
| Part I address | composed `summary.partnership.address*` | Not available |
| Part II partner name | `summary.partnership.entity.name` | Not available |
| Other identity-only cells | no existing source | Not available |

Identity cells are read-only. Part II tax classifications and reporting fields are editable:

| Form item | Field keys | Control |
|---|---|---|
| G | `item_g_partner_type` | Select |
| H1–H2 | `item_h_partner_residency`, `item_h2_foreign_country_code` | Select and text |
| I1–I2 | `item_i1_partner_entity_type`, `item_i2_retirement_plan` | Text and checkbox |
| J | six beginning/ending profit, loss, and capital percentage keys plus `item_j_decrease_due_sale_exchange` | Percentage inputs and checkbox |
| M | `item_m_contributed_property_with_built_in_gain_loss` | Yes/no select |
| N | beginning and ending `item_n_unrecognized_section_704c_*` keys | Signed money inputs |

## Item K Mapping

| Visual row | Beginning field | Ending field | Behavior |
|---|---|---|---|
| Nonrecourse liabilities | `liability_nonrecourse_beginning` | `liability_nonrecourse_ending` | Existing nonnegative/carryforward rules |
| Qualified nonrecourse financing | `liability_qualified_nonrecourse_beginning` | `liability_qualified_nonrecourse_ending` | Existing nonnegative/carryforward rules |
| Recourse liabilities | `liability_recourse_beginning` | `liability_recourse_ending` | Existing nonnegative/carryforward rules |

## Section L Mapping

| Visual row | Canonical field | Behavior |
|---|---|---|
| Beginning capital account | `section_l_beginning_capital` | Signed; existing carryforward placeholder |
| Capital contributed during year | `capital_contributions` | Nonnegative; read-only when dated capital calls exist |
| Current-year net income (loss) | `section_l_current_year_net_income_loss` | Signed |
| Other increase (decrease) | `section_l_other_increase_decrease` | Signed |
| Withdrawals and distributions | `section_l_withdrawals_distributions` | Nonnegative |
| Ending capital account | `section_l_ending_capital` | Signed |

`section_l_capital_contributed` remains deprecated provenance and is never writable. The canonical `capital_contributions` value continues to feed both basis and Section L.

## Part III Supported Mapping

| Form line/code | Existing field key | Jackson display qualifier | Behavior |
|---|---|---|---|
| 1 | `box_1_ordinary_income_loss` | Ordinary income (loss) | Signed |
| 2 | `box_2_net_rental_real_estate_income_loss` | Net rental real estate income (loss) | Signed |
| 3 | `box_3_other_net_rental_income_loss` | Other net rental income (loss) | Signed |
| 4a | `box_4a_guaranteed_payments_services` | Guaranteed payments for services | Signed |
| 4b | `box_4b_guaranteed_payments_capital` | Guaranteed payments for capital | Signed |
| 4c | `box_4c_guaranteed_payments` | Guaranteed payments | Signed |
| 5 | `box_5_interest_income` | Interest income | Signed |
| 6a | `box_6a_ordinary_dividends` | Ordinary dividends | Signed |
| 6b | `box_6b_qualified_dividends` | Qualified dividends | Signed informational subset |
| 6c | `box_6c_dividend_equivalents` | Dividend equivalents | Signed informational amount |
| 7 | `box_7_royalties` | Royalties | Signed |
| 8 | `box_8_net_short_term_capital_gain_loss` | Net short-term capital gain (loss) | Signed |
| 9a | `box_9a_net_long_term_capital_gain_loss` | Net long-term capital gain (loss) | Signed |
| 9b | `box_9b_collectibles_gain_loss` | Collectibles gain (loss) | Signed informational subset |
| 9c | `box_9c_unrecaptured_section_1250_gain` | Unrecaptured section 1250 gain | Signed informational subset |
| 10 | `box_10_net_section_1231_gain_loss` | Net section 1231 gain (loss) | Signed |
| 11 | `box_11_other_income_loss` | Other income (loss) | Signed |
| 12 | `box_12_section_179_deduction` | Section 179 deduction | Nonnegative |
| 13 | `box_13_other_portfolio_deductions` | Other portfolio deductions | Nonnegative subrow |
| 13 | `box_13_management_fees` | Management fees | Nonnegative subrow |
| 14 | `box_14_code`, `box_14_self_employment_earnings_loss` | Self-employment items | Code plus signed amount |
| 15 | `box_15_code`, `box_15_credits` | Credits | Code plus signed amount |
| 16 | `box_16_schedule_k3_attached` | Schedule K-3 attached | Checkbox |
| 17 | `box_17_code`, `box_17_alternative_minimum_tax_items` | Alternative minimum tax items | Code plus signed amount |
| 18A | `box_18a_nondeductible_expenses` | Existing Jackson 18A nondeductible-expense field | Nonnegative; preserve current calculation semantics |
| 18B | `box_18b_tax_exempt_income` | Tax-exempt income (basis only) | Signed; preserve current calculation semantics |
| 18C | `box_18c_nondeductible_expenses` | Nondeductible expenses (basis decrease) | Nonnegative; preserve current calculation semantics |
| 19 | `box_19_distributions` | Distributions | Nonnegative; read-only when dated distributions or recallable distributions exist |
| 20 | `box_20_code`, `box_20_other_information` | Other information | Code plus signed amount |
| 21 | `box_21_foreign_taxes` | Foreign taxes paid | Nonnegative |
| 22 | `box_22_multiple_at_risk_activities` | Multiple at-risk activities | Checkbox |
| 23 | `box_23_multiple_passive_activities` | Multiple passive activities | Checkbox |

The line 18 labels above deliberately preserve Jackson's existing historical field contract. This visual feature does not remap stored values to different tax semantics.

## Typed Value Contract

- Money fields normalize to two-decimal strings in `amount` and send `textValue: null`.
- Text and code fields trim their value and send it through `textValue` with `amount: null`.
- Percentage fields accept 0 through 100 with up to six decimal places and persist the normalized percentage through `textValue`.
- Select fields accept only a declared option value and persist it through `textValue`.
- Checkboxes persist `"true"` when checked and `null` when unchecked.
- Informational subset and coded amounts are persisted but are not added independently to existing basis formulas.

## Jackson Supplemental Workpaper Mapping

### Opening and limitation balances

| Field key | Existing behavior |
|---|---|
| `opening_outside_basis` | Nonnegative; prior-year carryforward placeholder |
| `opening_suspended_loss` | Nonnegative; prior-year carryforward placeholder |

### Book-tax inputs

| Field key | Existing behavior |
|---|---|
| `book_capital_account` | Signed |
| `book_interest_income` | Signed |
| `book_dividend_income` | Signed |
| `book_realized_capital_gain_loss` | Signed |
| `book_other_partnership_income_loss` | Signed |
| `recon_section_704c` | Signed |
| `recon_section_754` | Signed |
| `recon_timing_differences` | Signed |
| `recon_other_permanent_differences` | Signed |

These fields remain inside the same form and change set but outside the K-1 facsimile region.

## Annotation Contract

Each supported field retains, when applicable:

- its current accessible label;
- source type/provenance;
- carryforward year and formatted amount;
- **Calculated from dated cash activity** read-only explanation;
- source conflict or legacy line 13 message;
- validation error and form notice;
- disabled state when the user lacks edit permission or an operation is pending.

## Change-Set Contract

1. Initialize values by iterating the canonical 74 editable definitions.
2. On preview/save, iterate the same canonical definitions rather than visual cells.
3. Skip fields managed by dated cash activity.
4. Normalize according to `inputKind`; money also uses the existing `allowNegative` rule.
5. Emit only values that differ from the initial normalized value.
6. Use `MANUAL_ENTRY` unless manual override is enabled.
7. When override is enabled, require and include the trimmed reason and use `MANUAL_OVERRIDE`.
8. Do not emit unavailable read-only identity facts.

## Responsive and Accessibility Contract

- Wide desktop: recognizable left identity/Item K/Section L region and right Part III region.
- Narrow viewport: one-column logical flow; no page-level horizontal overflow at 390 CSS pixels.
- Tables may adapt into labeled row groups rather than requiring page scroll.
- Every input has a programmatic label and visible line/item context.
- Status is not communicated by color alone.
- Focus is visible against both white and gray form cells.
- Controls are keyboard operable and action buttons wrap without clipping.

## As-Built Notes

- The implemented writable placement inventory exactly matches the 74 canonical `K1_EDITABLE_FIELDS`.
- Part I and Part II reuse the already-loaded partnership summary for available identity context and render explicit **Not available** values without introducing another request or editable identity state.
- Every formerly static official landmark is now a typed input, and the supplemental opening-balance and book-tax inputs remain inside the same form and change set.
- The Net Cash Activity table keeps its intentional contained horizontal scroller on narrow screens. Its visually empty actions column now uses an accessible column label without an off-canvas screen-reader element, preventing page-level overflow at 390 CSS pixels.
