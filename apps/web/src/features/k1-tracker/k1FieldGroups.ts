import type { K1TrackerWritableFieldKey } from '../../../../../packages/types/src/k1-tracker'

export type K1FieldInputKind = 'money' | 'text' | 'percentage' | 'checkbox' | 'select'

export type K1FieldOption = {
  value: string
  label: string
}

export type K1FieldDefinition = {
  key: K1TrackerWritableFieldKey
  label: string
  allowNegative: boolean
  carryforward?: boolean
  inputKind: K1FieldInputKind
  options?: K1FieldOption[]
  placeholder?: string
  maxLength?: number
}

export type K1FieldGroup = {
  id: string
  title: string
  description: string
  signHint: string
  fields: K1FieldDefinition[]
}

const signed = (key: K1TrackerWritableFieldKey, label: string, carryforward = false): K1FieldDefinition => ({ key, label, allowNegative: true, carryforward, inputKind: 'money' })
const nonnegative = (key: K1TrackerWritableFieldKey, label: string, carryforward = false): K1FieldDefinition => ({ key, label, allowNegative: false, carryforward, inputKind: 'money' })
const text = (key: K1TrackerWritableFieldKey, label: string, placeholder?: string, maxLength = 200): K1FieldDefinition => ({ key, label, allowNegative: false, inputKind: 'text', placeholder, maxLength })
const percentage = (key: K1TrackerWritableFieldKey, label: string): K1FieldDefinition => ({ key, label, allowNegative: false, inputKind: 'percentage', placeholder: '0.000000' })
const checkbox = (key: K1TrackerWritableFieldKey, label: string): K1FieldDefinition => ({ key, label, allowNegative: false, inputKind: 'checkbox' })
const select = (key: K1TrackerWritableFieldKey, label: string, options: K1FieldOption[]): K1FieldDefinition => ({ key, label, allowNegative: false, inputKind: 'select', options })

export const K1_FIELD_GROUPS: K1FieldGroup[] = [
  {
    id: 'partner-information', title: 'Partner information',
    description: 'Enter the partner classifications, ownership percentages, and section 704(c) details reported in Part II.',
    signHint: 'Percentages are entered as percentages from 0 through 100. Checkbox values mirror the checked boxes on Schedule K-1.',
    fields: [
      select('item_g_partner_type', 'Item G - Partner type', [
        { value: 'GENERAL_PARTNER_OR_LLC_MEMBER_MANAGER', label: 'General partner or LLC member-manager' },
        { value: 'LIMITED_PARTNER_OR_OTHER_LLC_MEMBER', label: 'Limited partner or other LLC member' },
      ]),
      select('item_h_partner_residency', 'Item H1 - Partner residency', [
        { value: 'DOMESTIC_PARTNER', label: 'Domestic partner' },
        { value: 'FOREIGN_PARTNER', label: 'Foreign partner' },
      ]),
      text('item_h2_foreign_country_code', 'Item H2 - Foreign partner country code', 'Country code', 3),
      text('item_i1_partner_entity_type', 'Item I1 - Partner entity type', 'Entity type', 100),
      checkbox('item_i2_retirement_plan', 'Item I2 - Partner is a retirement plan'),
      percentage('item_j_profit_beginning_percent', 'Item J - Profit percentage, beginning'),
      percentage('item_j_profit_ending_percent', 'Item J - Profit percentage, ending'),
      percentage('item_j_loss_beginning_percent', 'Item J - Loss percentage, beginning'),
      percentage('item_j_loss_ending_percent', 'Item J - Loss percentage, ending'),
      percentage('item_j_capital_beginning_percent', 'Item J - Capital percentage, beginning'),
      percentage('item_j_capital_ending_percent', 'Item J - Capital percentage, ending'),
      checkbox('item_j_decrease_due_sale_exchange', 'Item J - Decrease due to sale or exchange'),
      select('item_m_contributed_property_with_built_in_gain_loss', 'Item M - Contributed property with built-in gain or loss', [
        { value: 'YES', label: 'Yes' },
        { value: 'NO', label: 'No' },
      ]),
      signed('item_n_unrecognized_section_704c_beginning', 'Item N - Net unrecognized section 704(c) gain (loss), beginning'),
      signed('item_n_unrecognized_section_704c_ending', 'Item N - Net unrecognized section 704(c) gain (loss), ending'),
    ],
  },
  {
    id: 'opening-capital', title: 'Opening balances and capital',
    description: 'Enter source values or leave a carried amount blank when the prior-year balance applies.',
    signHint: 'Capital contributions are positive. Opening basis and suspended loss are entered as nonnegative balances.',
    fields: [
      nonnegative('opening_outside_basis', 'Opening outside basis', true),
      nonnegative('opening_suspended_loss', 'Opening suspended loss', true),
      nonnegative('capital_contributions', 'Capital contributions'),
    ],
  },
  {
    id: 'k1-income', title: 'K-1 income, gains, and tax-exempt income',
    description: 'Enter each K-1 amount as shown by the source document.',
    signHint: 'Income and gains are positive; losses are negative. Tax-exempt income increases outside tax basis only and is not Section L income.',
    fields: [
      signed('box_1_ordinary_income_loss', 'Line 1 - Ordinary income (loss)'),
      signed('box_2_net_rental_real_estate_income_loss', 'Line 2 - Net rental real estate income (loss)'),
      signed('box_3_other_net_rental_income_loss', 'Line 3 - Other net rental income (loss)'),
      signed('box_4a_guaranteed_payments_services', 'Line 4a - Guaranteed payments for services'),
      signed('box_4b_guaranteed_payments_capital', 'Line 4b - Guaranteed payments for capital'),
      signed('box_4c_guaranteed_payments', 'Line 4c - Guaranteed payments'),
      signed('box_5_interest_income', 'Line 5 - Interest income'),
      signed('box_6a_ordinary_dividends', 'Line 6a - Ordinary dividends'),
      signed('box_6b_qualified_dividends', 'Line 6b - Qualified dividends'),
      signed('box_6c_dividend_equivalents', 'Line 6c - Dividend equivalents'),
      signed('box_7_royalties', 'Line 7 - Royalties'),
      signed('box_8_net_short_term_capital_gain_loss', 'Line 8 - Net short-term capital gain (loss)'),
      signed('box_9a_net_long_term_capital_gain_loss', 'Line 9a - Net long-term capital gain (loss)'),
      signed('box_9b_collectibles_gain_loss', 'Line 9b - Collectibles gain (loss)'),
      signed('box_9c_unrecaptured_section_1250_gain', 'Line 9c - Unrecaptured section 1250 gain'),
      signed('box_10_net_section_1231_gain_loss', 'Line 10 - Section 1231 gain (loss)'),
      signed('box_11_other_income_loss', 'Line 11 - Other income (loss)'),
      signed('box_18b_tax_exempt_income', 'Line 18B - Tax-exempt income (basis only)'),
    ],
  },
  {
    id: 'k1-decreases', title: 'K-1 deductions and distributions',
    description: 'These values reduce basis and are evaluated by the loss and distribution limits.',
    signHint: 'Enter deductions and distributions as positive decrease amounts.',
    fields: [
      nonnegative('box_12_section_179_deduction', 'Line 12 - Section 179 deduction'),
      nonnegative('box_13_other_portfolio_deductions', 'Line 13 - Other Portfolio Deductions'),
      nonnegative('box_13_management_fees', 'Line 13 - Management Fees'),
      nonnegative('box_18a_nondeductible_expenses', 'Line 18A - Nondeductible expenses'),
      nonnegative('box_18c_nondeductible_expenses', 'Line 18C - Nondeductible expenses (basis decrease)'),
      nonnegative('box_19_distributions', 'Line 19 - Distributions'),
      nonnegative('box_21_foreign_taxes', 'Line 21 - Foreign taxes paid'),
    ],
  },
  {
    id: 'k1-coded-items', title: 'K-1 coded and informational items',
    description: 'Enter the code and amount shown for each coded box, plus the official Schedule K-1 checkboxes.',
    signHint: 'Coded amounts are stored exactly as entered and do not change calculated basis unless a separate supported total applies.',
    fields: [
      text('box_14_code', 'Line 14 - Code', 'Code', 4),
      signed('box_14_self_employment_earnings_loss', 'Line 14 - Self-employment earnings (loss)'),
      text('box_15_code', 'Line 15 - Code', 'Code', 4),
      signed('box_15_credits', 'Line 15 - Credits'),
      checkbox('box_16_schedule_k3_attached', 'Line 16 - Schedule K-3 is attached'),
      text('box_17_code', 'Line 17 - Code', 'Code', 4),
      signed('box_17_alternative_minimum_tax_items', 'Line 17 - Alternative minimum tax items'),
      text('box_20_code', 'Line 20 - Code', 'Code', 4),
      signed('box_20_other_information', 'Line 20 - Other information'),
      checkbox('box_22_multiple_at_risk_activities', 'Line 22 - More than one activity for at-risk purposes'),
      checkbox('box_23_multiple_passive_activities', 'Line 23 - More than one activity for passive activity purposes'),
    ],
  },
  {
    id: 'liabilities', title: 'Item K liabilities',
    description: 'These balances are retained for manual processing and carryforward reference only.',
    signHint: 'Liabilities are reference-only and do not change basis, distributions, warnings, or sign-off.',
    fields: [
      nonnegative('liability_nonrecourse_beginning', 'Nonrecourse liabilities - beginning', true),
      nonnegative('liability_nonrecourse_ending', 'Nonrecourse liabilities - ending'),
      nonnegative('liability_qualified_nonrecourse_beginning', 'Qualified nonrecourse liabilities - beginning', true),
      nonnegative('liability_qualified_nonrecourse_ending', 'Qualified nonrecourse liabilities - ending'),
      nonnegative('liability_recourse_beginning', 'Recourse liabilities - beginning', true),
      nonnegative('liability_recourse_ending', 'Recourse liabilities - ending'),
    ],
  },
  {
    id: 'section-l', title: 'Section L capital account',
    description: 'Capital contributions above are the one authoritative contribution value for both basis and Section L.',
    signHint: 'Current-year income and other increases or decreases are signed. Withdrawals are positive decrease amounts.',
    fields: [
      signed('section_l_beginning_capital', 'Section L beginning capital', true),
      signed('section_l_current_year_net_income_loss', 'Section L current-year net income (loss)'),
      signed('section_l_other_increase_decrease', 'Section L other increase (decrease)'),
      nonnegative('section_l_withdrawals_distributions', 'Section L withdrawals and distributions'),
      signed('section_l_ending_capital', 'Section L ending capital'),
    ],
  },
  {
    id: 'book-tax', title: 'Book-tax reconciliation',
    description: 'Enter the book values and reconciling items supporting the annual workpaper.',
    signHint: 'Use signed book and reconciling amounts exactly as supported by the workpapers.',
    fields: [
      signed('book_capital_account', 'Book capital account'),
      signed('book_interest_income', 'Book interest income'),
      signed('book_dividend_income', 'Book dividend income'),
      signed('book_realized_capital_gain_loss', 'Book realized capital gain (loss)'),
      signed('book_other_partnership_income_loss', 'Book other partnership income (loss)'),
      signed('recon_section_704c', 'Section 704(c) built-in gain (loss)'),
      signed('recon_section_754', 'Section 754 basis step-up'),
      signed('recon_timing_differences', 'Timing differences'),
      signed('recon_other_permanent_differences', 'Other permanent differences'),
    ],
  },
]

export const K1_EDITABLE_FIELDS = K1_FIELD_GROUPS.flatMap((group) => group.fields)
