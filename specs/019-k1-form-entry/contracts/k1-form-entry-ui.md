# UI Contract: K-1 Form-Inspired Annual Entry

## Complete-Form Contract Amendment (2026-07-19)

This section supersedes the read-only identity, reference-only landmark, and unchanged-API statements in the original contract below.

- All 48 official-form keys are editable when `canEdit` is true and disabled when it is false.
- Header controls cover final/amended status and tax-period dates. Part I covers A-D. Part II covers E, F, G, H1/H2, I1/I2, J percentages and sale/exchange, K2/K3, the L method, M, and N beginning/ending values.
- Part III adds editable money controls for 4a, 4b, 6b, 6c, 9b, and 9c; repeatable code/detail rows for 11, 13, 14, 15, 17, 18, 19, 20, and 21; and checkboxes for 16, 22, and 23.
- Existing calculation-backed fields still emit `K1TrackerFieldChange[]`. Official-form state is normalized into a full-replacement `officialFormData` object and may be saved with zero calculation changes.
- The update response returns the saved official object. Official-only changes increment the selected-year revision and invalidate its sign-off without changing the calculation result.
- API validation rejects unknown keys, incorrect per-field value kinds, malformed money/percentage/date values, unsupported choices, empty code rows, and mutually conflicting final/amended status.
- Inventory tests require the union of header, identity, and Part III official placements to equal the complete official key set with no duplicates.

## Purpose

This contract defines where existing Jackson fields and complete official-form data appear and which interactions remain stable.

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
| Other official identity/tax cells | no existing source | Not available or Not tracked in Jackson |

Identity cells are editable under the complete-form amendment; existing values are defaults rather than locked text.

## Item K Mapping

| Visual row | Beginning field | Ending field | Behavior |
|---|---|---|---|
| Nonrecourse liabilities | `liability_nonrecourse_beginning` | `liability_nonrecourse_ending` | Existing nonnegative/carryforward rules |
| Qualified nonrecourse financing | `liability_qualified_nonrecourse_beginning` | `liability_qualified_nonrecourse_ending` | Existing nonnegative/carryforward rules |
| Recourse liabilities | `liability_recourse_beginning` | `liability_recourse_ending` | Existing nonnegative/carryforward rules |

Item K percentages, checkboxes, and other reference items without existing fields are static and not tracked.

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
| 4c | `box_4c_guaranteed_payments` | Guaranteed payments | Signed |
| 5 | `box_5_interest_income` | Interest income | Signed |
| 6a | `box_6a_ordinary_dividends` | Ordinary dividends | Signed |
| 7 | `box_7_royalties` | Royalties | Signed |
| 8 | `box_8_net_short_term_capital_gain_loss` | Net short-term capital gain (loss) | Signed |
| 9a | `box_9a_net_long_term_capital_gain_loss` | Net long-term capital gain (loss) | Signed |
| 10 | `box_10_net_section_1231_gain_loss` | Net section 1231 gain (loss) | Signed |
| 11 | `box_11_other_income_loss` | Other income (loss) | Signed |
| 12 | `box_12_section_179_deduction` | Section 179 deduction | Nonnegative |
| 13 | `box_13_other_portfolio_deductions` | Other portfolio deductions | Nonnegative subrow |
| 13 | `box_13_management_fees` | Management fees | Nonnegative subrow |
| 18A | `box_18a_nondeductible_expenses` | Existing Jackson 18A nondeductible-expense field | Nonnegative; preserve current calculation semantics |
| 18B | `box_18b_tax_exempt_income` | Tax-exempt income (basis only) | Signed; preserve current calculation semantics |
| 18C | `box_18c_nondeductible_expenses` | Nondeductible expenses (basis decrease) | Nonnegative; preserve current calculation semantics |
| 19 | `box_19_distributions` | Distributions | Nonnegative; read-only when dated distributions or recallable distributions exist |
| 21 | `box_21_foreign_taxes` | Foreign taxes paid | Nonnegative |

The line 18 labels above deliberately preserve Jackson's existing historical field contract. This visual feature does not remap stored values to different tax semantics.

## Part III Reference-Only Landmarks (superseded)

These historical rules are replaced by the complete-form contract. Lines 4a, 4b, 6b, 6c, 9b, 9c, 14, 15, 16, 17, 20, 22, and 23 now render typed inputs and persist through `officialFormData`.

- They remain absent from the numeric calculation change set unless already mapped to a canonical calculation field.
- They are present in official-form state, validation, dirty tracking, revert, and save behavior.

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

1. Initialize values by iterating the canonical 42 editable definitions.
2. On preview/save, iterate the same canonical definitions rather than visual cells.
3. Skip fields managed by dated cash activity.
4. Normalize using the existing `allowNegative` rule.
5. Emit only values that differ from the initial normalized value.
6. Use `MANUAL_ENTRY` unless manual override is enabled.
7. When override is enabled, require and include the trimmed reason and use `MANUAL_OVERRIDE`.
8. Normalize and emit official-form state separately when any official value changed.

## Responsive and Accessibility Contract

- Wide desktop: recognizable left identity/Item K/Section L region and right Part III region.
- Narrow viewport: one-column logical flow; no page-level horizontal overflow at 390 CSS pixels.
- Tables may adapt into labeled row groups rather than requiring page scroll.
- Every input has a programmatic label and visible line/item context.
- Status is not communicated by color alone.
- Focus is visible against both white and gray form cells.
- Controls are keyboard operable and action buttons wrap without clipping.
- Repeatable coded sections add and remove rows with keyboard-operable 44-pixel controls.

## As-Built Notes

- The calculation placement inventory exactly matches the 42 canonical `K1_EDITABLE_FIELDS`, while the official placement inventory exactly matches all 48 official-form keys.
- Part I and Part II reuse the already-loaded partnership summary as editable defaults; saved tax-year-specific values take precedence.
- No static **Not tracked in Jackson** landmarks remain. Official-only values use the optional update request property and migration 025 JSONB storage, while supplemental opening-balance and book-tax inputs remain in the canonical numeric change set.
- Official-only updates are calculation-neutral, revisioned, audited, and sign-off invalidating.
- The Net Cash Activity table keeps its intentional contained horizontal scroller on narrow screens. Its visually empty actions column now uses an accessible column label without an off-canvas screen-reader element, preventing page-level overflow at 390 CSS pixels.
