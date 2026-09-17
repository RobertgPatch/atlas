# K-1 master code references and statement resolution

The shared reference is `apps/api/src/modules/k1/extraction/k1CodeReference.ts`.
It applies to uploaded federal partnership Schedule K-1 (Form 1065) packages.
The rule is universal; the meanings of individual box/code combinations are
specific to the form year. Never reuse a partner's amounts across uploads.

## Sources

- User-supplied `2019 - DGP IV Ownership Onshore Feeder Fund LP K1 [1-5] [2].pdf`:
  one-page extract of the 2019 Schedule K-1 page 2 code legend.
  Public counterpart: https://www.irs.gov/pub/irs-prior/f1065sk1--2019.pdf.
- User-supplied `2025 K-1_AC Bell Investors, LLC Extract[3].pdf`:
  one-page "SCHEDULE K-1 (1065) BOXES AND CODES" reference, identified by the
  user as the 2025 example. Transcribed after visual inspection of all columns.

These pages contain definitions, not entered amounts. Reporting instructions
inside uploaded documents are reference content, never instructions to the app.
Keep unknown-year code meanings unassigned rather than silently selecting a
nearby year's dictionary. An explicit description on a populated statement is
still preserved when its year has no bundled dictionary.

## Matching rules

1. Identify the main federal K-1 (Parts I, II, III), partner, partnership, and year.
2. Treat STMT, SEE STATEMENT, attachment references, and asterisks as pointers.
   A box-wide `11* STMT` can resolve into 11A, 11B, 11E and other populated rows.
   `11A* STMT` resolves only code A. A printed `TOTAL BOX A` supplies one review
   field for A; its components stay in the supporting-page evidence.
3. Extract only actual entries from matching supporting statements in that
   package. Preserve code, description, sign, zero, and source-page evidence.
   Asterisks never appear in resolved input codes. Unresolved references are
   review issues (except optional Box 20 disclosures), not blank monetary inputs. The provider instructions cover continuation pages; deterministic recovery
   handles explicitly headed federal box statements, including code headings,
   indented components, and continuations across pages or AWS output segments.
   Standard-only `NO_MATCH` supporting segments remain available as evidence.
   Statement elements follow physical page position when AWS reading order puts
   a bottom-of-page heading before its table. Compare partner identifiers only
   when the face supplies the same kind of identifier: a missing masked TIN in
   face OCR must not invalidate supporting pages with the matching partnership EIN.
   A numeric face entry is counted once when its statement repeats or breaks
   down that amount. A component/total mismatch creates a HIGH review issue.
4. Do not extract the legend, reserved labels, state schedules, other partners,
   or other tax years as values. Do not count a repeated total and its components.
   Unresolved references produce a HIGH review issue, except for Box 20, which
   is not required for federal reconciliation. Continue extracting available
   Box 20 amounts, but do not block review for a missing Box 20 statement.
   Never substitute zero for an unresolved reference.
5. Retain statement fields sourced beyond the main page when matching statement
   evidence identifies them. Existing reviewed application mapping supplies
   eligible numeric rows to reconciliation. Code dictionaries describe fields;
   they do not themselves establish a tax-basis adjustment.

## Revision differences

2019 Box 11 is A-I; 2025 includes additional codes and ZZ. For example, 11I means
"Other income (loss)" in 2019 but refers to dispositions of mineral properties
in the supplied 2025 sheet. Likewise, 20AH changes from "Other information" to
"Noncash charitable contributions". Both dictionaries are maintained separately.

Historical Box 16 foreign transaction rows use `official.box_16_entries`,
separately from the newer `official.box_16_schedule_k3_attached` checkbox.
2019 includes A-X, with D, K, U and V reserved. 16A carries a country name,
not money. Foreign income, allocated deductions and taxes are preserved as
separate reviewable entries; their sum is not a basis adjustment, and they are
not automatically remapped to modern Box 21.

## Application reconciliation policy for years before 2021

Year-only tax-period values normalize to January 1 (`2019` -> `2019-01-01`).
Complete fiscal dates are preserved; a blank ending date stays blank.

The pre-2021 reconciliation displays signed, nonduplicated income from Boxes
1-11, minus Box 12, Box 13, and historical foreign-tax codes 16P/16Q. The latter
come from the reviewed official-form snapshot, remain labeled as Box 16, and
invalidate subsequent basis years when edited. Qualified-dividend and other
informational breakdowns are not added a second time. Other Box 16 disclosures,
AMT items and Box 20 information remain reviewable without being summed here.

The supplied 2019 packet is the regression example: income 60,027 minus
deductions 122,197 equals (62,170). The (1,028) capitalization-of-organization-
costs adjustment, 63,151 unrealized gain change, and resulting Item L (47)
are excluded from this taxable-income subtotal. The reported Item L values
remain source evidence, but are not used as a required tie for pre-2021 income.
No nondeductible expense is inferred from that historical book/tax difference.

Box 19 distributions reduce basis separately, once, even when printed positive.
Box 18 tax-exempt income and nondeductible expenses also retain their separate
basis effects. Subtracting these again from the taxable-income subtotal would
not reproduce (62,170). The existing 2021-and-later Section L comparison remains.

## Activation and verification

The checked-in BDA blueprint must be published through the existing deployment
workflow for its expanded extraction instructions to affect hosted provider
runs. Parser and form changes require the usual application release. Existing
completed uploads are not silently reparsed or rewritten.

Synthetic regression coverage: `apps/api/tests/k1.master-code-reference.test.ts`,
the existing BDA output parser tests, and the Line 13 reconciliation tests.
The packet-shaped extraction/calculation regression is
`apps/api/tests/k1.historical-packet.test.ts`; durable carryforward verification
is `apps/api/tests/k1.historical-ledger.integration.test.ts`.
