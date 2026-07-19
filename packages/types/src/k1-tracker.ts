export const K1_TRACKER_WORKFLOW_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'IMPORTED',
  'NEEDS_REVIEW',
  'RECONCILED',
] as const

export type K1TrackerWorkflowStatus = (typeof K1_TRACKER_WORKFLOW_STATUSES)[number]

export const K1_TRACKER_SOURCE_TYPES = [
  'FINALIZED_K1',
  'WORKBOOK_IMPORT',
  'MANUAL_ENTRY',
  'MANUAL_OVERRIDE',
  'CARRYFORWARD',
] as const

export type K1TrackerSourceType = (typeof K1_TRACKER_SOURCE_TYPES)[number]

export const K1_TRACKER_FIELD_KEYS = [
  'opening_outside_basis',
  'opening_suspended_loss',
  'capital_contributions',
  'box_1_ordinary_income_loss',
  'box_2_net_rental_real_estate_income_loss',
  'box_3_other_net_rental_income_loss',
  'box_4c_guaranteed_payments',
  'box_5_interest_income',
  'box_6a_ordinary_dividends',
  'box_7_royalties',
  'box_8_net_short_term_capital_gain_loss',
  'box_9a_net_long_term_capital_gain_loss',
  'box_10_net_section_1231_gain_loss',
  'box_11_other_income_loss',
  'box_12_section_179_deduction',
  'box_13_other_deductions',
  'box_18a_nondeductible_expenses',
  'box_18b_tax_exempt_income',
  'box_18c_nondeductible_expenses',
  'box_19_distributions',
  'box_21_foreign_taxes',
  'liability_nonrecourse_beginning',
  'liability_nonrecourse_ending',
  'liability_qualified_nonrecourse_beginning',
  'liability_qualified_nonrecourse_ending',
  'liability_recourse_beginning',
  'liability_recourse_ending',
  'section_l_beginning_capital',
  'section_l_capital_contributed',
  'section_l_current_year_net_income_loss',
  'section_l_other_increase_decrease',
  'section_l_withdrawals_distributions',
  'section_l_ending_capital',
  'book_capital_account',
  'book_interest_income',
  'book_dividend_income',
  'book_realized_capital_gain_loss',
  'book_other_partnership_income_loss',
  'recon_section_704c',
  'recon_section_754',
  'recon_timing_differences',
  'recon_other_permanent_differences',
] as const

export type K1TrackerFieldKey = (typeof K1_TRACKER_FIELD_KEYS)[number]
export const K1_TRACKER_DEPRECATED_WRITE_FIELD_KEYS = ['section_l_capital_contributed'] as const
export type K1TrackerDeprecatedWriteFieldKey = (typeof K1_TRACKER_DEPRECATED_WRITE_FIELD_KEYS)[number]
export type K1TrackerWritableFieldKey = Exclude<K1TrackerFieldKey, K1TrackerDeprecatedWriteFieldKey>
export type K1TrackerMoney = string
export type K1TrackerCheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'INCOMPLETE'

export interface K1TrackerValue {
  id: string
  fieldKey: K1TrackerFieldKey
  amount: K1TrackerMoney | null
  originalSourceText: string | null
  sourceType: K1TrackerSourceType
  sourceK1DocumentId: string | null
  sourceK1FieldValueId: string | null
  importBatchId: string | null
  sourceSheet: string | null
  sourceCell: string | null
  carryforwardFromTaxYear: number | null
  overrideReason: string | null
  isActive: boolean
  createdByEmail: string | null
  createdAt: string
}

export interface K1TrackerCheckResult {
  key: string
  status: K1TrackerCheckStatus
  actual: K1TrackerMoney | null
  expected: K1TrackerMoney | null
  difference: K1TrackerMoney | null
  tolerance: K1TrackerMoney | null
  message: string
}

export interface K1TrackerYearSummary {
  taxYear: number
  status: K1TrackerWorkflowStatus
  revision: number
  endingOutsideBasis: K1TrackerMoney | null
  cumulativeSuspendedLoss: K1TrackerMoney | null
  taxableExcessDistribution: K1TrackerMoney | null
  sectionLDifference: K1TrackerMoney | null
  warningCount: number
  sourceConflictCount: number
}

export interface K1TrackerJournalEntry {
  account: string
  amount: K1TrackerMoney
  convention: 'DEBIT_POSITIVE_CREDIT_NEGATIVE'
}

export interface K1TrackerCalculation {
  calculationVersion: string
  summary: K1TrackerYearSummary
  basis: Record<string, K1TrackerMoney | null | Array<Record<string, unknown>>>
  lossLimitation: Record<string, K1TrackerMoney | null | Array<Record<string, unknown>>>
  distribution: Record<string, K1TrackerMoney | null>
  liabilities: Record<string, K1TrackerMoney | null>
  sectionL: Record<string, K1TrackerMoney | null>
  bookTax: Record<string, K1TrackerMoney | null>
  journalEntries: K1TrackerJournalEntry[]
  journalBalance: K1TrackerMoney
  checks: K1TrackerCheckResult[]
}

export interface K1TrackerSignoffState {
  yearRevision: number
  preparedByEmail: string | null
  preparedAt: string | null
  reviewedByEmail: string | null
  reviewedAt: string | null
  invalidatedAt: string | null
  invalidationReason: string | null
  history?: Array<{
    action: 'PREPARED' | 'REVIEWED' | 'INVALIDATED'
    byEmail: string | null
    at: string
    reason: string | null
  }>
}

export interface K1TrackerYearDetail {
  partnershipId: string
  taxYear: number
  status: K1TrackerWorkflowStatus
  revision: number
  values: K1TrackerValue[]
  sourceConflicts: Array<{ fieldKey: K1TrackerFieldKey; message: string }>
  calculation: K1TrackerCalculation
  signoff: K1TrackerSignoffState
}

export interface K1TrackerPartnershipSummary {
  partnershipId: string
  partnershipName: string
  entityId: string
  entityName: string
  yearCount: number
  firstTaxYear: number | null
  latestTaxYear: number | null
  latestStatus: K1TrackerWorkflowStatus | null
  latestEndingOutsideBasis: K1TrackerMoney | null
  cumulativeSuspendedLoss: K1TrackerMoney | null
  warningCount: number
}

export interface K1TrackerPartnershipDetail extends K1TrackerPartnershipSummary {
  partnerName: string | null
  years: K1TrackerYearSummary[]
}

export interface K1TrackerFieldChange {
  fieldKey: K1TrackerFieldKey
  amount: K1TrackerMoney | null
  sourceType: Extract<K1TrackerSourceType, 'MANUAL_ENTRY' | 'MANUAL_OVERRIDE'>
  overrideReason?: string | null
}

export interface K1TrackerImportDecision {
  sheetName: string
  taxYear: number
  action: 'SKIP' | 'MERGE' | 'REPLACE'
  expectedRevision?: number | null
}

export interface K1TrackerImportPreview {
  importBatchId: string
  expiresAt: string
  workbookHash: string
  proposedPartnershipId: string | null
  sheets: Array<{
    sheetName: string
    proposedPartnershipName: string
    proposedPartnershipId: string | null
    years: Array<{
      taxYear: number
      state: 'POPULATED' | 'FORMULA_ONLY' | 'BLANK' | 'INVALID'
      mappedFieldCount: number
      conflicts: Array<{ fieldKey: K1TrackerFieldKey; message: string }>
      warnings: string[]
      values: Array<{ fieldKey: K1TrackerFieldKey; amount: K1TrackerMoney | null; sourceCell: string }>
    }>
  }>
  warnings: string[]
}
