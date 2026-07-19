import type { K1TrackerWritableFieldKey } from '../../../../../packages/types/src/k1-tracker'

export type K1FormRegion =
  | 'part-ii'
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
  placement('item_g_partner_type', 'part-ii', 'G', 700),
  placement('item_h_partner_residency', 'part-ii', 'H1', 801),
  placement('item_h2_foreign_country_code', 'part-ii', 'H2', 802),
  placement('item_i1_partner_entity_type', 'part-ii', 'I1', 901),
  placement('item_i2_retirement_plan', 'part-ii', 'I2', 902),
  placement('item_j_profit_beginning_percent', 'part-ii', 'J', 1001, { sublabel: 'Profit - beginning' }),
  placement('item_j_profit_ending_percent', 'part-ii', 'J', 1002, { sublabel: 'Profit - ending' }),
  placement('item_j_loss_beginning_percent', 'part-ii', 'J', 1003, { sublabel: 'Loss - beginning' }),
  placement('item_j_loss_ending_percent', 'part-ii', 'J', 1004, { sublabel: 'Loss - ending' }),
  placement('item_j_capital_beginning_percent', 'part-ii', 'J', 1005, { sublabel: 'Capital - beginning' }),
  placement('item_j_capital_ending_percent', 'part-ii', 'J', 1006, { sublabel: 'Capital - ending' }),
  placement('item_j_decrease_due_sale_exchange', 'part-ii', 'J', 1007),
  placement('item_m_contributed_property_with_built_in_gain_loss', 'part-ii', 'M', 1300),
  placement('item_n_unrecognized_section_704c_beginning', 'part-ii', 'N', 1401, { sublabel: 'Beginning of year' }),
  placement('item_n_unrecognized_section_704c_ending', 'part-ii', 'N', 1402, { sublabel: 'End of year' }),

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
  placement('box_4a_guaranteed_payments_services', 'part-iii-left', '4a', 401),
  placement('box_4b_guaranteed_payments_capital', 'part-iii-left', '4b', 402),
  placement('box_4c_guaranteed_payments', 'part-iii-left', '4c', 403),
  placement('box_5_interest_income', 'part-iii-left', '5', 500),
  placement('box_6a_ordinary_dividends', 'part-iii-left', '6a', 601),
  placement('box_6b_qualified_dividends', 'part-iii-left', '6b', 602),
  placement('box_6c_dividend_equivalents', 'part-iii-left', '6c', 603),
  placement('box_7_royalties', 'part-iii-left', '7', 700),
  placement('box_8_net_short_term_capital_gain_loss', 'part-iii-left', '8', 800),
  placement('box_9a_net_long_term_capital_gain_loss', 'part-iii-left', '9a', 901),
  placement('box_9b_collectibles_gain_loss', 'part-iii-left', '9b', 902),
  placement('box_9c_unrecaptured_section_1250_gain', 'part-iii-left', '9c', 903),
  placement('box_10_net_section_1231_gain_loss', 'part-iii-left', '10', 1000),
  placement('box_11_other_income_loss', 'part-iii-left', '11', 1100),
  placement('box_12_section_179_deduction', 'part-iii-left', '12', 1200),
  placement('box_13_other_portfolio_deductions', 'part-iii-left', '13', 1301, { code: 'W', sublabel: 'Other portfolio deductions' }),
  placement('box_13_management_fees', 'part-iii-left', '13', 1302, { code: 'W', sublabel: 'Management fees' }),

  placement('box_14_code', 'part-iii-right', '14', 1401, { sublabel: 'Code' }),
  placement('box_14_self_employment_earnings_loss', 'part-iii-right', '14', 1402),
  placement('box_15_code', 'part-iii-right', '15', 1501, { sublabel: 'Code' }),
  placement('box_15_credits', 'part-iii-right', '15', 1502),
  placement('box_16_schedule_k3_attached', 'part-iii-right', '16', 1600),
  placement('box_17_code', 'part-iii-right', '17', 1701, { sublabel: 'Code' }),
  placement('box_17_alternative_minimum_tax_items', 'part-iii-right', '17', 1702),
  placement('box_18a_nondeductible_expenses', 'part-iii-right', '18A', 1801, { sublabel: 'Nondeductible expenses' }),
  placement('box_18b_tax_exempt_income', 'part-iii-right', '18B', 1802, { sublabel: 'Tax-exempt income (basis only)' }),
  placement('box_18c_nondeductible_expenses', 'part-iii-right', '18C', 1803, { sublabel: 'Nondeductible expenses (basis decrease)' }),
  placement('box_19_distributions', 'part-iii-right', '19', 1900),
  placement('box_20_code', 'part-iii-right', '20', 2001, { sublabel: 'Code' }),
  placement('box_20_other_information', 'part-iii-right', '20', 2002),
  placement('box_21_foreign_taxes', 'part-iii-right', '21', 2100),
  placement('box_22_multiple_at_risk_activities', 'part-iii-right', '22', 2200),
  placement('box_23_multiple_passive_activities', 'part-iii-right', '23', 2300),

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

export const placementsForRegion = (region: K1FormRegion): K1FormPlacement[] =>
  K1_FORM_PLACEMENTS.filter((item) => item.region === region)
