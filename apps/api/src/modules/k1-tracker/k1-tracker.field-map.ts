import type { K1TrackerFieldKey } from './k1-tracker.contracts.js'

export type FieldRole = 'opening' | 'income' | 'deduction' | 'distribution' | 'liability' | 'sectionL' | 'book' | 'recon'

export interface TrackerFieldDefinition {
  key: K1TrackerFieldKey
  label: string
  role: FieldRole
  signed?: boolean
  workbookLabels?: string[]
  k1Aliases?: string[]
}

const field = (definition: TrackerFieldDefinition) => definition

export const K1_TRACKER_CALCULATION_VERSION = 'irs-k1-basis-v8-split-line-13-signed-section-l-withdrawals'

export const trackerFields: readonly TrackerFieldDefinition[] = [
  field({ key: 'opening_outside_basis', label: 'Opening outside basis', role: 'opening', workbookLabels: ['beginning tax basis'] }),
  field({ key: 'opening_suspended_loss', label: 'Opening suspended loss', role: 'opening' }),
  field({ key: 'capital_contributions', label: 'Capital contributions', role: 'income', workbookLabels: ['capital contributions'] }),
  field({ key: 'box_1_ordinary_income_loss', label: 'Line 1 · Ordinary income (loss)', role: 'income', signed: true, workbookLabels: ['line 1 - ordinary income', 'line 1 - ordinary loss'], k1Aliases: ['box_1_ordinary_income'] }),
  field({ key: 'box_2_net_rental_real_estate_income_loss', label: 'Line 2 · Net rental real estate income (loss)', role: 'income', signed: true, workbookLabels: ['line 2 - net rental re income', 'line 2 - net rental re loss'], k1Aliases: ['box_2_net_rental_real_estate'] }),
  field({ key: 'box_3_other_net_rental_income_loss', label: 'Line 3 · Other net rental income (loss)', role: 'income', signed: true, workbookLabels: ['line 3 - other rental income', 'line 3 - other rental loss'], k1Aliases: ['box_3_other_net_rental'] }),
  field({ key: 'box_4c_guaranteed_payments', label: 'Line 4c · Guaranteed payments', role: 'income', signed: true, workbookLabels: ['line 4c - guaranteed'], k1Aliases: ['box_4c_total_guaranteed_payments', 'box_4_guaranteed_payments'] }),
  field({ key: 'box_5_interest_income', label: 'Line 5 · Interest income', role: 'income', signed: true, workbookLabels: ['line 5 - interest'], k1Aliases: ['box_5_interest_income'] }),
  field({ key: 'box_6a_ordinary_dividends', label: 'Line 6a · Ordinary dividends', role: 'income', signed: true, workbookLabels: ['line 6a - ordinary dividends'], k1Aliases: ['box_6a_ordinary_dividends'] }),
  field({ key: 'box_7_royalties', label: 'Line 7 · Royalties', role: 'income', signed: true, workbookLabels: ['line 7 - royalties'], k1Aliases: ['box_7_royalties'] }),
  field({ key: 'box_8_net_short_term_capital_gain_loss', label: 'Line 8 · Net short-term capital gain (loss)', role: 'income', signed: true, workbookLabels: ['line 8 - net st capital gain', 'line 8 - net st capital loss'], k1Aliases: ['box_8_net_short_term_capital_gain'] }),
  field({ key: 'box_9a_net_long_term_capital_gain_loss', label: 'Line 9a · Net long-term capital gain (loss)', role: 'income', signed: true, workbookLabels: ['line 9a - net lt capital gain', 'line 9a - net lt capital loss'], k1Aliases: ['box_9a_net_long_term_capital_gain'] }),
  field({ key: 'box_10_net_section_1231_gain_loss', label: 'Line 10 · Section 1231 gain (loss)', role: 'income', signed: true, workbookLabels: ['line 10 - sec 1231 gain', 'line 10 - sec 1231 loss'], k1Aliases: ['box_10_net_section_1231_gain'] }),
  field({ key: 'box_11_other_income_loss', label: 'Line 11 · Other income (loss)', role: 'income', signed: true, workbookLabels: ['line 11 - other income'], k1Aliases: ['box_11_other_income'] }),
  field({ key: 'box_12_section_179_deduction', label: 'Line 12 · Section 179 deduction', role: 'deduction', workbookLabels: ['line 12 - sec 179'], k1Aliases: ['box_12_section_179_deduction'] }),
  field({ key: 'box_13_other_deductions', label: 'Line 13 - Historical combined deductions', role: 'deduction', workbookLabels: ['line 13 - other deductions'], k1Aliases: ['box_13_other_deductions'] }),
  field({ key: 'box_13_other_portfolio_deductions', label: 'Line 13 - Other Portfolio Deductions', role: 'deduction' }),
  field({ key: 'box_13_management_fees', label: 'Line 13 - Management Fees', role: 'deduction' }),
  field({ key: 'box_18a_nondeductible_expenses', label: 'Line 18A · Nondeductible expenses', role: 'deduction', workbookLabels: ['line 18a - nondeductible'] }),
  field({ key: 'box_18b_tax_exempt_income', label: 'Line 18B · Tax-exempt income (basis only)', role: 'income', signed: true, workbookLabels: ['line 18b - tax-exempt'] }),
  field({ key: 'box_18c_nondeductible_expenses', label: 'Line 18C · Nondeductible expenses (basis decrease)', role: 'deduction', workbookLabels: ['line 18c - nondeductible'], k1Aliases: ['box_18c_nondeductible_expenses'] }),
  field({ key: 'box_19_distributions', label: 'Line 19 · Distributions', role: 'distribution', signed: true, workbookLabels: ['line 19 - distributions'], k1Aliases: ['box_19_distributions', 'box_19a_distribution'] }),
  field({ key: 'box_21_foreign_taxes', label: 'Line 21 · Foreign taxes paid', role: 'deduction', workbookLabels: ['line 21 - foreign'], k1Aliases: ['box_21_foreign_taxes'] }),
  field({ key: 'liability_nonrecourse_beginning', label: 'Nonrecourse liabilities · beginning', role: 'liability', workbookLabels: ['nonrecourse - beginning'], k1Aliases: ['liab_nonrecourse_beginning'] }),
  field({ key: 'liability_nonrecourse_ending', label: 'Nonrecourse liabilities · ending', role: 'liability', workbookLabels: ['nonrecourse - ending'], k1Aliases: ['liab_nonrecourse_ending'] }),
  field({ key: 'liability_qualified_nonrecourse_beginning', label: 'Qualified nonrecourse liabilities · beginning', role: 'liability', workbookLabels: ['qualified nonrecourse - beg'], k1Aliases: ['liab_qualified_nonrecourse_beginning'] }),
  field({ key: 'liability_qualified_nonrecourse_ending', label: 'Qualified nonrecourse liabilities · ending', role: 'liability', workbookLabels: ['qualified nonrecourse - end'], k1Aliases: ['liab_qualified_nonrecourse_ending'] }),
  field({ key: 'liability_recourse_beginning', label: 'Recourse liabilities · beginning', role: 'liability', workbookLabels: ['recourse - beginning'], k1Aliases: ['liab_recourse_beginning'] }),
  field({ key: 'liability_recourse_ending', label: 'Recourse liabilities · ending', role: 'liability', workbookLabels: ['recourse - ending'], k1Aliases: ['liab_recourse_ending'] }),
  field({ key: 'section_l_beginning_capital', label: 'Section L beginning capital', role: 'sectionL', workbookLabels: ['beginning capital account'], k1Aliases: ['capital_beginning'] }),
  field({ key: 'section_l_capital_contributed', label: 'Section L contributions', role: 'sectionL', workbookLabels: ['capital contributed during year'], k1Aliases: ['capital_contributed'] }),
  field({ key: 'section_l_current_year_net_income_loss', label: 'Section L current year net income (loss)', role: 'sectionL', workbookLabels: ['current year net income'], k1Aliases: ['capital_current_year_net_income'] }),
  field({ key: 'section_l_other_increase_decrease', label: 'Section L other increase (decrease)', role: 'sectionL', workbookLabels: ['other increase'], k1Aliases: ['capital_other_increase_decrease'] }),
  field({ key: 'section_l_withdrawals_distributions', label: 'Section L withdrawals and distributions', role: 'sectionL', signed: true, workbookLabels: ['withdrawals & distributions'], k1Aliases: ['capital_withdrawals_distributions'] }),
  field({ key: 'section_l_ending_capital', label: 'Section L ending capital', role: 'sectionL', workbookLabels: ['ending capital account'], k1Aliases: ['capital_ending'] }),
  field({ key: 'book_capital_account', label: 'Book capital account', role: 'book', workbookLabels: ['book capital account'] }),
  field({ key: 'book_interest_income', label: 'Book interest income', role: 'book', workbookLabels: ['book interest income'] }),
  field({ key: 'book_dividend_income', label: 'Book dividend income', role: 'book', workbookLabels: ['book dividend income'] }),
  field({ key: 'book_realized_capital_gain_loss', label: 'Book realized capital gain (loss)', role: 'book', workbookLabels: ['book capital gains'] }),
  field({ key: 'book_other_partnership_income_loss', label: 'Book other partnership income (loss)', role: 'book', workbookLabels: ['book: other partnership income'] }),
  field({ key: 'recon_section_704c', label: 'Section 704(c) built-in gain (loss)', role: 'recon', workbookLabels: ['sec 704(c)'] }),
  field({ key: 'recon_section_754', label: 'Section 754 basis step-up', role: 'recon', workbookLabels: ['basis step-up'] }),
  field({ key: 'recon_timing_differences', label: 'Timing differences', role: 'recon', workbookLabels: ['timing differences'] }),
  field({ key: 'recon_other_permanent_differences', label: 'Other permanent differences', role: 'recon', workbookLabels: ['other permanent differences'] }),
]

export const trackerFieldByKey = new Map(trackerFields.map((item) => [item.key, item]))
export const trackerFieldByWorkbookLabel = new Map(
  trackerFields.flatMap((item) => (item.workbookLabels ?? []).map((label) => [label, item] as const)),
)

for (const [label, fieldKey] of [
  ['line 4c - guaranteed payments', 'box_4c_guaranteed_payments'],
  ['line 5 - interest income', 'box_5_interest_income'],
  ['line 18a - nondeductible exp', 'box_18a_nondeductible_expenses'],
  ['line 18a - nondeductible expenses', 'box_18a_nondeductible_expenses'],
  ['line 18b - tax-exempt income', 'box_18b_tax_exempt_income'],
  ['line 18c - nondeductible expenses', 'box_18c_nondeductible_expenses'],
  ['beginning capital account (sec l)', 'section_l_beginning_capital'],
  ['current year net income (loss)', 'section_l_current_year_net_income_loss'],
  ['other increase (decrease)', 'section_l_other_increase_decrease'],
  ['ending capital account (sec l)', 'section_l_ending_capital'],
  ['sec 704(c) built-in gain/loss', 'recon_section_704c'],
  ['basis step-up (sec 754 election)', 'recon_section_754'],
] as const) {
  const definition = trackerFields.find((field) => field.key === fieldKey)
  if (definition) trackerFieldByWorkbookLabel.set(label, definition)
}

export const trackerFieldByK1Alias = new Map(
  trackerFields.flatMap((item) => (item.k1Aliases ?? []).map((alias) => [alias, item] as const)),
)
