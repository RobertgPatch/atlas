import type { K1TrackerWritableFieldKey } from '../../../../../packages/types/src/k1-tracker'

export type K1FormRegion =
  | 'item-k'
  | 'section-l'
  | 'part-iii-left'
  | 'part-iii-right'
  | 'supplemental-opening'
  | 'supplemental-book-tax'

export interface K1FormPlacement {
  fieldKey: K1TrackerWritableFieldKey
  region: K1FormRegion
  itemOrLine: string
  order: number
  code?: string
  sublabel?: string
}

export interface K1FormReferenceCell {
  region: 'part-iii-left' | 'part-iii-right' | 'part-ii-reference'
  itemOrLine: string
  label: string
  order: number
  status: 'NOT_TRACKED'
}

export interface K1FormIdentityContext {
  partnershipName: string
  partnershipEin: string | null
  partnershipAddress: string | null
  partnerName: string
}

const placement = (
  fieldKey: K1TrackerWritableFieldKey,
  region: K1FormRegion,
  itemOrLine: string,
  order: number,
  options: Pick<K1FormPlacement, 'code' | 'sublabel'> = {},
): K1FormPlacement => ({ fieldKey, region, itemOrLine, order, ...options })

export const K1_FORM_PLACEMENTS: K1FormPlacement[] = [
  placement('liability_nonrecourse_beginning', 'item-k', 'K', 1, { sublabel: 'Nonrecourse liabilities - beginning' }),
  placement('liability_nonrecourse_ending', 'item-k', 'K', 2, { sublabel: 'Nonrecourse liabilities - ending' }),
  placement('liability_qualified_nonrecourse_beginning', 'item-k', 'K', 3, { sublabel: 'Qualified nonrecourse financing - beginning' }),
  placement('liability_qualified_nonrecourse_ending', 'item-k', 'K', 4, { sublabel: 'Qualified nonrecourse financing - ending' }),
  placement('liability_recourse_beginning', 'item-k', 'K', 5, { sublabel: 'Recourse liabilities - beginning' }),
  placement('liability_recourse_ending', 'item-k', 'K', 6, { sublabel: 'Recourse liabilities - ending' }),

  placement('section_l_beginning_capital', 'section-l', 'L', 1, { sublabel: 'Beginning capital account' }),
  placement('capital_contributions', 'section-l', 'L', 2, { sublabel: 'Capital contributed during year' }),
  placement('section_l_current_year_net_income_loss', 'section-l', 'L', 3, { sublabel: 'Current-year net income (loss)' }),
  placement('section_l_other_increase_decrease', 'section-l', 'L', 4, { sublabel: 'Other increase (decrease)' }),
  placement('section_l_withdrawals_distributions', 'section-l', 'L', 5, { sublabel: 'Withdrawals and distributions' }),
  placement('section_l_ending_capital', 'section-l', 'L', 6, { sublabel: 'Ending capital account' }),

  placement('box_1_ordinary_income_loss', 'part-iii-left', '1', 100),
  placement('box_2_net_rental_real_estate_income_loss', 'part-iii-left', '2', 200),
  placement('box_3_other_net_rental_income_loss', 'part-iii-left', '3', 300),
  placement('box_4c_guaranteed_payments', 'part-iii-left', '4c', 403),
  placement('box_5_interest_income', 'part-iii-left', '5', 500),
  placement('box_6a_ordinary_dividends', 'part-iii-left', '6a', 601),
  placement('box_7_royalties', 'part-iii-left', '7', 700),
  placement('box_8_net_short_term_capital_gain_loss', 'part-iii-left', '8', 800),
  placement('box_9a_net_long_term_capital_gain_loss', 'part-iii-left', '9a', 901),
  placement('box_10_net_section_1231_gain_loss', 'part-iii-left', '10', 1000),
  placement('box_11_other_income_loss', 'part-iii-left', '11', 1100),
  placement('box_12_section_179_deduction', 'part-iii-left', '12', 1200),
  placement('box_13_other_portfolio_deductions', 'part-iii-left', '13', 1301, { code: 'W', sublabel: 'Other portfolio deductions' }),
  placement('box_13_management_fees', 'part-iii-left', '13', 1302, { code: 'W', sublabel: 'Management fees' }),

  placement('box_18a_nondeductible_expenses', 'part-iii-right', '18A', 1801, { sublabel: 'Nondeductible expenses' }),
  placement('box_18b_tax_exempt_income', 'part-iii-right', '18B', 1802, { sublabel: 'Tax-exempt income (basis only)' }),
  placement('box_18c_nondeductible_expenses', 'part-iii-right', '18C', 1803, { sublabel: 'Nondeductible expenses (basis decrease)' }),
  placement('box_19_distributions', 'part-iii-right', '19', 1900),
  placement('box_21_foreign_taxes', 'part-iii-right', '21', 2100),

  placement('opening_outside_basis', 'supplemental-opening', 'W1', 1),
  placement('opening_suspended_loss', 'supplemental-opening', 'W2', 2),

  placement('book_capital_account', 'supplemental-book-tax', 'W3', 1),
  placement('book_interest_income', 'supplemental-book-tax', 'W4', 2),
  placement('book_dividend_income', 'supplemental-book-tax', 'W5', 3),
  placement('book_realized_capital_gain_loss', 'supplemental-book-tax', 'W6', 4),
  placement('book_other_partnership_income_loss', 'supplemental-book-tax', 'W7', 5),
  placement('recon_section_704c', 'supplemental-book-tax', 'W8', 6),
  placement('recon_section_754', 'supplemental-book-tax', 'W9', 7),
  placement('recon_timing_differences', 'supplemental-book-tax', 'W10', 8),
  placement('recon_other_permanent_differences', 'supplemental-book-tax', 'W11', 9),
]

const reference = (
  region: K1FormReferenceCell['region'],
  itemOrLine: string,
  label: string,
  order: number,
): K1FormReferenceCell => ({ region, itemOrLine, label, order, status: 'NOT_TRACKED' })

export const K1_FORM_REFERENCE_CELLS: K1FormReferenceCell[] = [
  reference('part-iii-left', '4a', 'Guaranteed payments for services', 401),
  reference('part-iii-left', '4b', 'Guaranteed payments for capital', 402),
  reference('part-iii-left', '6b', 'Qualified dividends', 602),
  reference('part-iii-left', '6c', 'Dividend equivalents', 603),
  reference('part-iii-left', '9b', 'Collectibles gain (loss)', 902),
  reference('part-iii-left', '9c', 'Unrecaptured section 1250 gain', 903),
  reference('part-iii-right', '14', 'Self-employment earnings (loss)', 1400),
  reference('part-iii-right', '15', 'Credits', 1500),
  reference('part-iii-right', '16', 'Schedule K-3 is attached if checked', 1600),
  reference('part-iii-right', '17', 'Alternative minimum tax items', 1700),
  reference('part-iii-right', '20', 'Other information', 2000),
  reference('part-iii-right', '22', 'More than one activity for at-risk purposes', 2200),
  reference('part-iii-right', '23', 'More than one activity for passive activity purposes', 2300),
  reference('part-ii-reference', 'G', 'General or limited partner classification', 700),
  reference('part-ii-reference', 'H', 'Domestic or foreign partner classification', 800),
  reference('part-ii-reference', 'J', 'Partner profit, loss, and capital percentages', 1000),
  reference('part-ii-reference', 'M', 'Built-in gain or loss contributing partner', 1300),
  reference('part-ii-reference', 'N', 'Partner share of net unrecognized section 704(c) gain or loss', 1400),
]

export const placementsForRegion = (region: K1FormRegion): K1FormPlacement[] =>
  K1_FORM_PLACEMENTS.filter((item) => item.region === region)

export const referenceCellsForRegion = (region: K1FormReferenceCell['region']): K1FormReferenceCell[] =>
  K1_FORM_REFERENCE_CELLS.filter((item) => item.region === region)

