import type {
  K1TrackerOfficialFormData,
  K1TrackerOfficialFormFieldKey,
  K1TrackerOfficialFormValue,
  K1TrackerWritableFieldKey,
} from '../../../../../packages/types/src/k1-tracker'

export type K1FormRegion =
  | 'item-k'
  | 'section-l'
  | 'part-iii-left'
  | 'part-iii-right'
  | 'supplemental-opening'
  | 'supplemental-book-tax'

export interface K1FormPlacement {
  fieldKey: K1TrackerWritableFieldKey
  officialFieldKey?: K1TrackerOfficialFormFieldKey
  region: K1FormRegion
  itemOrLine: string
  order: number
  code?: string
  sublabel?: string
}

export interface K1FormOfficialPlacement {
  fieldKey: K1TrackerOfficialFormFieldKey
  region: 'part-iii-left' | 'part-iii-right'
  itemOrLine: string
  label: string
  order: number
}

export interface K1FormIdentityContext {
  partnershipName: string
  partnershipEin: string | null
  partnershipAddress: string | null
  partnerName: string
}

const CODED_OFFICIAL_FIELD_BY_TRACKED_FIELD = new Map<K1TrackerWritableFieldKey, K1TrackerOfficialFormFieldKey>([
  ['box_13_other_portfolio_deductions', 'box_13_entries'],
  ['box_13_management_fees', 'box_13_entries'],
  ['box_18a_nondeductible_expenses', 'box_18_entries'],
  ['box_18b_tax_exempt_income', 'box_18_entries'],
  ['box_18c_nondeductible_expenses', 'box_18_entries'],
  ['box_19_distributions', 'box_19_entries'],
  ['box_21_foreign_taxes', 'box_21_entries'],
])

export const K1_OVERLAPPING_CODED_OFFICIAL_FIELD_KEYS = [...new Set<K1TrackerOfficialFormFieldKey>(
  CODED_OFFICIAL_FIELD_BY_TRACKED_FIELD.values(),
)]

const OVERLAPPING_CODED_OFFICIAL_FIELDS = new Set(K1_OVERLAPPING_CODED_OFFICIAL_FIELD_KEYS)

export const hasMeaningfulK1CodeEntry = (value: K1TrackerOfficialFormValue | undefined): boolean =>
  Array.isArray(value) && value.some((entry) => Boolean(entry.code.trim() || entry.value.trim()))

export const isTrackedPartThreePlacementVisible = (
  placement: K1FormPlacement,
  officialFormData: K1TrackerOfficialFormData,
): boolean => {
  const officialFieldKey = CODED_OFFICIAL_FIELD_BY_TRACKED_FIELD.get(placement.fieldKey)
  return !officialFieldKey || !hasMeaningfulK1CodeEntry(officialFormData[officialFieldKey])
}

export const isOfficialPartThreePlacementVisible = (
  placement: K1FormOfficialPlacement,
  officialFormData: K1TrackerOfficialFormData,
): boolean => !OVERLAPPING_CODED_OFFICIAL_FIELDS.has(placement.fieldKey)
  || hasMeaningfulK1CodeEntry(officialFormData[placement.fieldKey])

const placement = (
  fieldKey: K1TrackerWritableFieldKey,
  region: K1FormRegion,
  itemOrLine: string,
  order: number,
  options: Pick<K1FormPlacement, 'code' | 'sublabel' | 'officialFieldKey'> = {},
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
  placement('box_11_other_income_loss', 'part-iii-left', '11', 1100, { code: 'ZZ', sublabel: 'Other income (loss)', officialFieldKey: 'box_11_entries' }),
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

const officialPlacement = (
  fieldKey: K1TrackerOfficialFormFieldKey,
  region: K1FormOfficialPlacement['region'],
  itemOrLine: string,
  label: string,
  order: number,
): K1FormOfficialPlacement => ({ fieldKey, region, itemOrLine, label, order })

export const K1_FORM_OFFICIAL_PLACEMENTS: K1FormOfficialPlacement[] = [
  officialPlacement('box_4a_guaranteed_payments_services', 'part-iii-left', '4a', 'Guaranteed payments for services', 401),
  officialPlacement('box_4b_guaranteed_payments_capital', 'part-iii-left', '4b', 'Guaranteed payments for capital', 402),
  officialPlacement('box_6b_qualified_dividends', 'part-iii-left', '6b', 'Qualified dividends', 602),
  officialPlacement('box_6c_dividend_equivalents', 'part-iii-left', '6c', 'Dividend equivalents', 603),
  officialPlacement('box_9b_collectibles_gain_loss', 'part-iii-left', '9b', 'Collectibles (28%) gain or loss', 902),
  officialPlacement('box_9c_unrecaptured_section_1250_gain', 'part-iii-left', '9c', 'Unrecaptured Section 1250 gain', 903),
  officialPlacement('box_13_entries', 'part-iii-left', '13', 'Other deduction code and statement details', 1390),
  officialPlacement('box_14_entries', 'part-iii-right', '14', 'Self-employment earnings (loss)', 1400),
  officialPlacement('box_15_entries', 'part-iii-right', '15', 'Credits', 1500),
  officialPlacement('box_16_schedule_k3_attached', 'part-iii-right', '16', 'Schedule K-3 is attached', 1600),
  officialPlacement('box_17_entries', 'part-iii-right', '17', 'Alternative minimum tax items', 1700),
  officialPlacement('box_18_entries', 'part-iii-right', '18', 'Tax-exempt income and nondeductible expense code details', 1890),
  officialPlacement('box_19_entries', 'part-iii-right', '19', 'Distribution code and statement details', 1990),
  officialPlacement('box_20_entries', 'part-iii-right', '20', 'Other information', 2000),
  officialPlacement('box_21_entries', 'part-iii-right', '21', 'Foreign tax code and statement details', 2190),
  officialPlacement('box_22_more_than_one_at_risk_activity', 'part-iii-right', '22', 'More than one activity for at-risk purposes', 2200),
  officialPlacement('box_23_more_than_one_passive_activity', 'part-iii-right', '23', 'More than one activity for passive activity purposes', 2300),
]

export const K1_FORM_HEADER_FIELD_KEYS: K1TrackerOfficialFormFieldKey[] = [
  'k1_status_final', 'k1_status_amended', 'tax_period_beginning', 'tax_period_ending',
]

export const K1_FORM_IDENTITY_FIELD_KEYS: K1TrackerOfficialFormFieldKey[] = [
  'part_i_a_partnership_ein', 'part_i_b_partnership_name_address', 'part_i_c_irs_center', 'part_i_d_publicly_traded_partnership',
  'part_ii_e_partner_tin', 'part_ii_f_partner_name_address', 'part_ii_g_partner_classification', 'part_ii_h1_partner_residency',
  'part_ii_h2_disregarded_entity', 'part_ii_h2_disregarded_entity_tin', 'part_ii_h2_disregarded_entity_name',
  'part_ii_i1_partner_entity_type', 'part_ii_i2_retirement_plan',
  'part_ii_j_profit_beginning_pct', 'part_ii_j_profit_ending_pct', 'part_ii_j_loss_beginning_pct', 'part_ii_j_loss_ending_pct',
  'part_ii_j_capital_beginning_pct', 'part_ii_j_capital_ending_pct', 'part_ii_j_decrease_sale',
  'part_ii_k2_lower_tier_liabilities', 'part_ii_k3_guaranteed_liabilities',
  'part_ii_m_built_in_gain_loss', 'part_ii_n_704c_gain_loss_beginning', 'part_ii_n_704c_gain_loss_ending',
]

export const placementsForRegion = (region: K1FormRegion): K1FormPlacement[] =>
  K1_FORM_PLACEMENTS.filter((item) => item.region === region)

export const officialPlacementsForRegion = (region: K1FormOfficialPlacement['region']): K1FormOfficialPlacement[] =>
  K1_FORM_OFFICIAL_PLACEMENTS.filter((item) => item.region === region)
