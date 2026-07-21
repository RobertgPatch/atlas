import type { K1TrackerFieldKey } from '../../../../../packages/types/src/k1-tracker'

export type K1FieldDefinition = {
  key: K1TrackerFieldKey
  label: string
  allowNegative: boolean
  carryforward?: boolean
}

export type K1FieldGroup = {
  id: string
  title: string
  description: string
  signHint: string
  fields: K1FieldDefinition[]
}

const signed = (key: K1TrackerFieldKey, label: string, carryforward = false): K1FieldDefinition => ({ key, label, allowNegative: true, carryforward })
const nonnegative = (key: K1TrackerFieldKey, label: string, carryforward = false): K1FieldDefinition => ({ key, label, allowNegative: false, carryforward })

export const K1_FIELD_GROUPS: K1FieldGroup[] = [
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
      signed('box_4c_guaranteed_payments', 'Line 4c - Guaranteed payments'),
      signed('box_5_interest_income', 'Line 5 - Interest income'),
      signed('box_6a_ordinary_dividends', 'Line 6a - Ordinary dividends'),
      signed('box_7_royalties', 'Line 7 - Royalties'),
      signed('box_8_net_short_term_capital_gain_loss', 'Line 8 - Net short-term capital gain (loss)'),
      signed('box_9a_net_long_term_capital_gain_loss', 'Line 9a - Net long-term capital gain (loss)'),
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
