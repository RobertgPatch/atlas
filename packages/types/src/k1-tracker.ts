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
  'SYSTEM_DEFAULT',
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
  'box_13_other_portfolio_deductions',
  'box_13_management_fees',
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
export const K1_TRACKER_DEPRECATED_WRITE_FIELD_KEYS = ['section_l_capital_contributed', 'box_13_other_deductions'] as const
export type K1TrackerDeprecatedWriteFieldKey = (typeof K1_TRACKER_DEPRECATED_WRITE_FIELD_KEYS)[number]
export type K1TrackerWritableFieldKey = Exclude<K1TrackerFieldKey, K1TrackerDeprecatedWriteFieldKey>
export type K1TrackerMoney = string
export type K1TrackerCheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'INCOMPLETE'

export const K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS = [
  'k1_status_final',
  'k1_status_amended',
  'tax_period_beginning',
  'tax_period_ending',
  'part_i_a_partnership_ein',
  'part_i_b_partnership_name_address',
  'part_i_c_irs_center',
  'part_i_d_publicly_traded_partnership',
  'part_ii_e_partner_tin',
  'part_ii_f_partner_name_address',
  'part_ii_g_partner_classification',
  'part_ii_h1_partner_residency',
  'part_ii_h2_disregarded_entity',
  'part_ii_h2_disregarded_entity_tin',
  'part_ii_h2_disregarded_entity_name',
  'part_ii_i1_partner_entity_type',
  'part_ii_i2_retirement_plan',
  'part_ii_j_profit_beginning_pct',
  'part_ii_j_profit_ending_pct',
  'part_ii_j_loss_beginning_pct',
  'part_ii_j_loss_ending_pct',
  'part_ii_j_capital_beginning_pct',
  'part_ii_j_capital_ending_pct',
  'part_ii_j_decrease_sale',
  'part_ii_j_decrease_exchange',
  'part_ii_k2_lower_tier_liabilities',
  'part_ii_k3_guaranteed_liabilities',
  'part_ii_m_built_in_gain_loss',
  'part_ii_n_704c_gain_loss_beginning',
  'part_ii_n_704c_gain_loss_ending',
  'box_4a_guaranteed_payments_services',
  'box_4b_guaranteed_payments_capital',
  'box_6b_qualified_dividends',
  'box_6c_dividend_equivalents',
  'box_9b_collectibles_gain_loss',
  'box_9c_unrecaptured_section_1250_gain',
  'box_11_entries',
  'box_13_entries',
  'box_14_entries',
  'box_15_entries',
  'box_16_schedule_k3_attached',
  'box_17_entries',
  'box_18_entries',
  'box_19_entries',
  'box_20_entries',
  'box_21_entries',
  'box_22_more_than_one_at_risk_activity',
  'box_23_more_than_one_passive_activity',
] as const

export type K1TrackerOfficialFormFieldKey = (typeof K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS)[number]

export interface K1TrackerCodeEntry {
  code: string
  value: string
}

export interface K1TrackerExtractedCodeEntry extends K1TrackerCodeEntry {
  occurrenceId: string
  occurrenceIndex: number
  description: string | null
  sourceFieldValueIds: string[]
  sourceLocations: Array<{
    page: number
    bbox?: [number, number, number, number]
    textRef?: string | null
  }>
}

export type K1TrackerOfficialFormValue = string | boolean | K1TrackerCodeEntry[] | null
export type K1TrackerOfficialFormData = Partial<Record<K1TrackerOfficialFormFieldKey, K1TrackerOfficialFormValue>>

export interface K1TrackerOfficialFormSource {
  sourceType: Extract<K1TrackerSourceType, 'FINALIZED_K1' | 'MANUAL_ENTRY' | 'MANUAL_OVERRIDE'>
  sourceK1DocumentId: string | null
  sourceK1FieldValueIds: string[]
  extractionAttemptId: string | null
  createdByEmail: string | null
  createdAt: string
}

export type K1TrackerOfficialFormSources = Partial<
  Record<K1TrackerOfficialFormFieldKey, K1TrackerOfficialFormSource>
>

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
  capitalContributed: K1TrackerMoney | null
  distributions: K1TrackerMoney | null
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

export type K1TrackerCashFlowKind = 'CAPITAL_CALL' | 'DISTRIBUTION' | 'RECALLABLE_DISTRIBUTION'
export type K1TrackerCashFlowSettlementStatus = 'ANNOUNCED' | 'SETTLED'

export interface K1TrackerCashFlowEvent {
  id: string
  partnershipId: string
  taxYear: number
  kind: K1TrackerCashFlowKind
  activityDate: string
  settlementStatus: K1TrackerCashFlowSettlementStatus
  announcedDate: string | null
  amount: K1TrackerMoney
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface K1TrackerYearDetail {
  partnershipId: string
  taxYear: number
  isInceptionYear: boolean
  status: K1TrackerWorkflowStatus
  revision: number
  officialFormData: K1TrackerOfficialFormData
  officialFormSources?: K1TrackerOfficialFormSources
  values: K1TrackerValue[]
  cashFlowEvents: K1TrackerCashFlowEvent[]
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
