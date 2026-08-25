import type {
  K1TrackerOfficialFormFieldKey,
  K1TrackerOfficialFormValue,
} from '../../../../../packages/types/src/k1-tracker'

export type K1OfficialInputKind = 'text' | 'multiline' | 'date' | 'boolean' | 'choice' | 'percentage' | 'money' | 'coded'

export interface K1OfficialFormFieldDefinition {
  key: K1TrackerOfficialFormFieldKey
  label: string
  kind: K1OfficialInputKind
  allowNegative?: boolean
  placeholder?: string
  options?: Array<{ value: string; label: string }>
}

const field = (
  key: K1TrackerOfficialFormFieldKey,
  label: string,
  kind: K1OfficialInputKind,
  options: Omit<K1OfficialFormFieldDefinition, 'key' | 'label' | 'kind'> = {},
): K1OfficialFormFieldDefinition => ({ key, label, kind, ...options })

export const K1_OFFICIAL_FORM_FIELDS: K1OfficialFormFieldDefinition[] = [
  field('k1_status_final', 'Final K-1', 'boolean'),
  field('k1_status_amended', 'Amended K-1', 'boolean'),
  field('tax_period_beginning', 'Tax period beginning', 'date'),
  field('tax_period_ending', 'Tax period ending', 'date'),

  field('part_i_a_partnership_ein', 'Item A - Partnership employer identification number', 'text', { placeholder: 'XX-XXXXXXX' }),
  field('part_i_b_partnership_name_address', 'Item B - Partnership name and address', 'multiline'),
  field('part_i_c_irs_center', 'Item C - IRS center where partnership filed return', 'text'),
  field('part_i_d_publicly_traded_partnership', 'Item D - Publicly traded partnership (PTP)', 'boolean'),

  field('part_ii_e_partner_tin', 'Item E - Partner SSN or TIN', 'text'),
  field('part_ii_f_partner_name_address', 'Item F - Partner name and address', 'multiline'),
  field('part_ii_g_partner_classification', 'Item G - Partner classification', 'choice', {
    options: [
      { value: 'GENERAL_PARTNER_OR_LLC_MEMBER_MANAGER', label: 'General partner or LLC member-manager' },
      { value: 'LIMITED_PARTNER_OR_OTHER_LLC_MEMBER', label: 'Limited partner or other LLC member' },
    ],
  }),
  field('part_ii_h1_partner_residency', 'Item H1 - Partner residency', 'choice', {
    options: [
      { value: 'DOMESTIC', label: 'Domestic partner' },
      { value: 'FOREIGN', label: 'Foreign partner' },
    ],
  }),
  field('part_ii_h2_disregarded_entity', 'Item H2 - Partner is a disregarded entity', 'boolean'),
  field('part_ii_h2_disregarded_entity_tin', 'Item H2 - Disregarded entity TIN', 'text'),
  field('part_ii_h2_disregarded_entity_name', 'Item H2 - Disregarded entity name', 'text'),
  field('part_ii_i1_partner_entity_type', 'Item I1 - Partner entity type', 'text', { placeholder: 'Trust, individual, corporation, etc.' }),
  field('part_ii_i2_retirement_plan', 'Item I2 - Partner is a retirement plan', 'boolean'),
  field('part_ii_j_profit_beginning_pct', 'Item J - Profit percentage, beginning', 'percentage'),
  field('part_ii_j_profit_ending_pct', 'Item J - Profit percentage, ending', 'percentage'),
  field('part_ii_j_loss_beginning_pct', 'Item J - Loss percentage, beginning', 'percentage'),
  field('part_ii_j_loss_ending_pct', 'Item J - Loss percentage, ending', 'percentage'),
  field('part_ii_j_capital_beginning_pct', 'Item J - Capital percentage, beginning', 'percentage'),
  field('part_ii_j_capital_ending_pct', 'Item J - Capital percentage, ending', 'percentage'),
  field('part_ii_j_decrease_sale', 'Item J - Decrease due to sale or exchange of partnership interest', 'boolean'),
  field('part_ii_k2_lower_tier_liabilities', 'Item K2 - Includes liabilities from lower-tier partnerships', 'boolean'),
  field('part_ii_k3_guaranteed_liabilities', 'Item K3 - Liability subject to guarantees or partner payment obligations', 'boolean'),
  field('part_ii_m_built_in_gain_loss', 'Item M - Contributed property with built-in gain or loss', 'choice', {
    options: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }],
  }),
  field('part_ii_n_704c_gain_loss_beginning', 'Item N - Net unrecognized Section 704(c) gain or loss, beginning', 'money', { allowNegative: true }),
  field('part_ii_n_704c_gain_loss_ending', 'Item N - Net unrecognized Section 704(c) gain or loss, ending', 'money', { allowNegative: true }),

  field('box_4a_guaranteed_payments_services', 'Line 4a - Guaranteed payments for services', 'money', { allowNegative: true }),
  field('box_4b_guaranteed_payments_capital', 'Line 4b - Guaranteed payments for capital', 'money', { allowNegative: true }),
  field('box_6b_qualified_dividends', 'Line 6b - Qualified dividends', 'money', { allowNegative: true }),
  field('box_6c_dividend_equivalents', 'Line 6c - Dividend equivalents', 'money', { allowNegative: true }),
  field('box_9b_collectibles_gain_loss', 'Line 9b - Collectibles (28%) gain or loss', 'money', { allowNegative: true }),
  field('box_9c_unrecaptured_section_1250_gain', 'Line 9c - Unrecaptured Section 1250 gain', 'money', { allowNegative: true }),
  field('box_11_entries', 'Line 11 - Other income code and detail entries', 'coded'),
  field('box_13_entries', 'Line 13 - Other deduction code and detail entries', 'coded'),
  field('box_14_entries', 'Line 14 - Self-employment earnings code and detail entries', 'coded'),
  field('box_15_entries', 'Line 15 - Credit code and detail entries', 'coded'),
  field('box_16_schedule_k3_attached', 'Line 16 - Schedule K-3 is attached', 'boolean'),
  field('box_17_entries', 'Line 17 - AMT code and detail entries', 'coded'),
  field('box_18_entries', 'Line 18 - Tax-exempt income and nondeductible expense code entries', 'coded'),
  field('box_19_entries', 'Line 19 - Distribution code and detail entries', 'coded'),
  field('box_20_entries', 'Line 20 - Other information code and detail entries', 'coded'),
  field('box_21_entries', 'Line 21 - Foreign tax code and detail entries', 'coded'),
  field('box_22_more_than_one_at_risk_activity', 'Line 22 - More than one activity for at-risk purposes', 'boolean'),
  field('box_23_more_than_one_passive_activity', 'Line 23 - More than one activity for passive activity purposes', 'boolean'),
]

export const K1_OFFICIAL_FORM_FIELD_BY_KEY = new Map(K1_OFFICIAL_FORM_FIELDS.map((definition) => [definition.key, definition]))

/** Keep only the printed letter code; the field key already identifies its line. */
export const normalizeK1OfficialCode = (fieldKey: K1TrackerOfficialFormFieldKey, rawCode: string): string => {
  const line = /^box_(\d+[a-z]?)_entries$/i.exec(fieldKey)?.[1]
  let code = rawCode.trim().toUpperCase()
  if (line) {
    const escapedLine = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    code = code.replace(new RegExp(`^${escapedLine}(?:\\s*[-.:/]\\s*|\\s*)(?=[A-Z*])`, 'i'), '')
  }
  return code.replace(/\s+(?=\*)/g, '')
}

export const emptyOfficialValueFor = (definition: K1OfficialFormFieldDefinition): K1TrackerOfficialFormValue =>
  definition.kind === 'boolean' ? false : definition.kind === 'coded' ? [] : ''
