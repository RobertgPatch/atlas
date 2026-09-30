// CSV import contracts. Decimal strings are authoritative; null never means zero.
export const csvStatuses = ['UPLOAD_PENDING', 'VALIDATING', 'QUEUED', 'PARSING', 'NEEDS_MAPPING', 'NEEDS_ADAPTER', 'NEEDS_REVIEW', 'READY_TO_APPLY', 'APPLIED', 'FAILED', 'REJECTED', 'CANCELLED'] as const
export type CsvStatus = typeof csvStatuses[number]
export const issueCodes = ['UNKNOWN_LAYOUT', 'MALFORMED_RECORD', 'UNSUPPORTED_RECORD', 'AMBIGUOUS_ACCOUNT', 'MISSING_DATE', 'AMBIGUOUS_DATE_ORDER', 'MISSING_CURRENCY', 'MISSING_VALUE', 'UNKNOWN_ASSET_TYPE', 'DUPLICATE_ROW', 'INCOMPLETE_BASIS', 'MISSING_BASIS', 'MISSING_DAY_CHANGE', 'TOTAL_NOT_PROVIDED', 'TOTAL_MISMATCH', 'FIELD_ARITHMETIC_MISMATCH', 'PERCENT_MISMATCH', 'ESTIMATED_BASIS', 'PARTIAL_SOURCE_COVERAGE', 'PARTIAL_EXPORT', 'EMPTY_ACCOUNT_CONFIRMATION', 'UNSUPPORTED_VALUATION_CONVENTION', 'HIDDEN_ACCOUNT_SECTION', 'UNKNOWN_HOLDINGS_SECTION'] as const
export type IssueCode = typeof issueCodes[number]
export interface CsvEvidence { record: number; lineStart: number; lineEnd: number; column: number | null; header: string | null }
export interface CsvDerivation { rule: 'BASIS_FROM_VALUE_GAIN' | 'GAIN_FROM_VALUE_BASIS' | 'PERCENT_FROM_GAIN_BASIS' | 'BASIS_FROM_PERCENT_ESTIMATE' | 'CASH_AT_PAR' | 'CASH_VALUE_BASIS' | 'AVERAGE_UNIT_BASIS' | 'VERIFIED_QUANTITY_PRICE'; version: string; operands: string[]; estimated: boolean }
export interface CsvField {
  value: string | boolean | null
  raw: string[]
  origin: 'IMPORTED' | 'DERIVED' | 'REVIEWED' | 'UNAVAILABLE'
  availability: 'COMPLETE' | 'INCOMPLETE' | 'UNAVAILABLE' | 'NOT_APPLICABLE'
  evidence: CsvEvidence[]
  derivation: CsvDerivation | null
  reason: string | null
}
export const positionFields = ['description', 'symbol', 'cusip', 'isin', 'brokerSecurityId', 'assetType', 'sourceAssetType', 'currency', 'quantity', 'price', 'marketValue', 'costBasis', 'unrealizedGainLoss', 'unrealizedGainLossRatio', 'dayChange', 'dayChangeRatio', 'accruedInterest', 'quoteMultiplier'] as const
export type PositionFieldName = typeof positionFields[number]
export type CsvPosition = { occurrenceId: string; sourceRecord: number } & Record<PositionFieldName, CsvField>
export interface CsvAccount {
  occurrenceId: string
  identifierFingerprints: string[]
  displayName: CsvField
  accountMask: CsvField
  currency: CsvField
  asOfDate: CsvField
  asOfAt: CsvField
  sourceZone: CsvField
  asOfPrecision: 'DATE' | 'INSTANT' | 'UNRESOLVED'
  reportedTotal: CsvField
  reportedBasis?: CsvField
  reportedGain?: CsvField
  positions: CsvPosition[]
}
export interface CsvIssue { code: IssueCode; severity: 'INFO' | 'WARNING' | 'BLOCKING'; accountOccurrenceId: string | null; fieldPath: string | null; sourceRecords: number[] }
export interface CsvRecord { ordinal: number; lineStart: number; lineEnd: number; cells: string[]; role: 'METADATA' | 'HEADER' | 'POSITION' | 'TOTAL' | 'BLANK' | 'UNSUPPORTED' }
export interface StatementStoredRecord {
  ordinal: number
  lineStart: number | null
  lineEnd: number | null
  cells: string[]
  role: 'METADATA' | 'HEADER' | 'POSITION' | 'SUBTOTAL' | 'TOTAL' | 'NOTE' | 'BLANK' | 'EXCLUDED_SECTION' | 'UNSUPPORTED'
  sourceKind: StatementFileKind
  sourceLocation: Record<string, unknown>
}
export interface CsvDraft {
  schemaVersion: '2.0.0'
  adapter: { id: 'positions_v1' | 'merrill_holdings_v1' | 'mapped_csv_v1'; version: string }
  sourceHash: string
  recordCounts: { total: number; positions: number; controls: number; metadata: number; headers: number; blanks: number; unsupported: number }
  accounts: CsvAccount[]
  issues: CsvIssue[]
}
export interface Coverage { knownRows: number; unknownRows: number; estimatedRows: number; status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'; knownSubtotal: string | null; total: string | null }
export interface CsvControlComparison { fieldPath: string; originalStatus: 'MATCHED' | 'MISMATCH' | 'UNVERIFIABLE'; effectiveStatus: 'MATCHED' | 'MISMATCH' | 'UNVERIFIABLE'; reported: string; originalObserved: string | null; effectiveObserved: string | null }
export interface CsvReconciliation { status: 'MATCHED' | 'NOT_PROVIDED' | 'BLOCKED'; totalValue: string; difference: string | null; basisCoverage: Coverage; gainCoverage: Coverage; controls?: CsvControlComparison[] }
export interface SourceAccount { id: string; entityId: string; custodian: string; name: string; accountMask: string | null; currency: string; included: boolean; cadence: 'EVERY_14_DAYS' | 'CALENDAR_MONTHLY' | 'ON_DEMAND'; version: number; holdingsAsOfDate: string | null; nextExpectedDate: string | null; latestSnapshotId: string | null; uploadedAt: string | null; activeSource: 'CSV' | 'STATEMENT' }
export interface CustodianSummary { entityId: string; name: string; accountCount: number; statementCount: number; draftCount: number; appliedStatementCount: number; snapshotCount: number; deletable: boolean }
export interface PricingCapability { realTimeEquitiesEnabled: boolean; valuationMode: 'CSV_ONLY' | 'CSV_WITH_EQUITY_QUOTES'; revision: string }
export interface CsvSummary { id: string; entityId: string; custodian: string; version: number; status: CsvStatus; uploadedAt: string; adapterId: string | null; safeErrorCode: string | null }
export interface ReviewIssue extends CsvIssue { id: string; acknowledged: boolean }
export interface AccountBinding { occurrenceId: string; accountId: string; expectedAccountVersion: number; completeAccount: true; emptyAccountConfirmed: boolean; emptyReason?: string; acknowledgedIssueIds?: string[]; effectiveOrderDecision?: { kind: 'SOURCE_ORDER' | 'HISTORICAL_ONLY' | 'CORRECTION'; replacesSnapshotId?: string; reason: string } }
export interface ExcludedAccountDecision { occurrenceId: string; reason: string }
export interface CsvDetail {
  summary: CsvSummary
  canonicalDraft: CsvDraft | StatementDraft | null
  reviewRevision: number
  issues: ReviewIssue[]
  accountBindings: AccountBinding[]
  reconciliations: Record<string, CsvReconciliation>
  records: Array<CsvRecord | StatementStoredRecord>
  fileKind?: StatementFileKind
  recipe?: StatementParseRecipe | null
  excludedAccounts?: ExcludedAccountDecision[]
  priorApplications?: Array<{ id: string; runId: string; status: 'PREVIEW' | 'APPLIED'; appliedAt: string | null; snapshotIds: string[] }>
  activeRunId?: string | null
  sourceSchemaVersion?: '2.0.0' | '3.0.0' | null
  storedCanonicalHash?: string | null
  availableAdapterVersions?: Array<{ id: string; version: string; fileKind: StatementFileKind; current: boolean }>
  recordsNextCursor?: string | null
}
export const mappingTargets = ['accountIdentifier', 'accountName', 'asOfDate', ...positionFields, 'ignoredEvidence'] as const
export interface MappingProfile { name: string; delimiter: ',' | ';' | '\t'; encoding: 'UTF8' | 'UTF16LE' | 'UTF16BE' | 'WINDOWS1252'; headerRecord: number; dateFormat: 'M/D/YYYY' | 'YYYY/MM/DD' | 'YYYY-MM-DD' | 'PROFILE_TITLE'; sourceZone?: string; percentUnit: 'PERCENT_POINTS' | 'RATIO'; currency: string; asOfDate?: string; columns: { sourceIndex: number; sourceHeader: string; target: typeof mappingTargets[number] }[] }
export interface ApplicationPreview { id: string; expectedVersion: number; summaryHash: string; expiresAt: string; canApply: boolean; accounts: { accountId: string; asOfDate: string; asOfAt: string | null; added: number; removed: number; changed: number; previousValue: string; nextValue: string; reconciliation: CsvReconciliation['status']; basisCoverage: Coverage; gainCoverage: Coverage; controls: CsvControlComparison[]; willBecomeCurrent: boolean }[]; excludedAccounts?: Array<ExcludedAccountDecision&{displayName:string;positionCount:number}> }
export interface UploadRequest { entityId: string; custodian: string; fileName: string; sizeBytes: number; sha256: string; contentType: string; fileKind?: StatementFileKind; profileId?: string }
export interface UploadCapability { statementId: string; version: number; url: string; expiresAt: string; requiredHeaders: Record<string, string>; duplicate?: boolean }
export interface ReviewChange { fieldPath: string; value: string | boolean | null; reason: string }

export type StatementFileKind = 'CSV' | 'XLSX'
export type StatementSourceKind = 'CSV' | 'STATEMENT'
export type IdentifierQuality = 'FULL_RELIABLE' | 'MASKED' | 'UNRELIABLE_NUMERIC' | 'ABSENT'

export interface CsvStatementLocation {
  kind: 'CSV'
  record: number
  lineStart: number
  lineEnd: number
  column: number | null
  header: string | null
}

export interface XlsxStatementLocation {
  kind: 'XLSX'
  sheetId: string
  sheetName: string
  row: number
  column: number
  address: string
  header: string | null
  hidden?: boolean
  filtered?: boolean
}

export type StatementLocation = CsvStatementLocation | XlsxStatementLocation

export interface StatementInterpretation {
  rule: string
  version: string
  sourceFields: string[]
  rounding?: 'HALF_AWAY_FROM_ZERO'
  /** Canonical decimal places justified by the source display convention. */
  sourceScale?: number
}

export interface StatementField extends Omit<CsvField, 'evidence'> {
  evidence: StatementLocation[]
  interpretation: StatementInterpretation | null
}

export interface StatementValuationConvention {
  priceUnit: 'PER_UNIT' | 'PERCENT_OF_PAR' | 'PER_CONTRACT' | 'UNKNOWN'
  quantityUnit: 'SHARES' | 'PRINCIPAL' | 'CONTRACTS' | 'CURRENCY' | 'UNKNOWN'
  multiplier: string | null
  accruedInterest: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN'
  providerIdentity: string | null
}

export interface StatementPosition extends Omit<CsvPosition, PositionFieldName> {
  description: StatementField
  symbol: StatementField
  cusip: StatementField
  isin: StatementField
  brokerSecurityId: StatementField
  assetType: StatementField
  sourceAssetType: StatementField
  currency: StatementField
  quantity: StatementField
  price: StatementField
  marketValue: StatementField
  costBasis: StatementField
  unrealizedGainLoss: StatementField
  unrealizedGainLossRatio: StatementField
  dayChange: StatementField
  dayChangeRatio: StatementField
  accruedInterest: StatementField
  quoteMultiplier: StatementField
  sourceOriginalCost?: StatementField
  sourceAdjustedCost?: StatementField
  basisSourceField?: string | null
  valuationConvention: StatementValuationConvention
}

export interface StatementAccount {
  occurrenceId: string
  identifierFingerprints: string[]
  identifierQuality: IdentifierQuality
  displayName: StatementField
  accountMask: StatementField
  currency: StatementField
  asOfDate: StatementField
  asOfAt: StatementField
  sourceZone: StatementField
  asOfPrecision: CsvAccount['asOfPrecision']
  completeness: 'SUPPORTED_COMPLETE' | 'REVIEW_REQUIRED' | 'UNSUPPORTED_PARTIAL'
  sourceSections: string[]
  positions: StatementPosition[]
}

export interface StatementControlScope {
  kind: 'COMPLETE_ACCOUNT' | 'EXPLICIT_SUBSET' | 'UNKNOWN'
  occurrenceIds: string[]
  operandField: string
  rule: string
  version: string
}

export interface StatementControl {
  id: string
  accountOccurrenceId: string
  metric: 'MARKET_VALUE' | 'COST_BASIS' | 'ORIGINAL_COST' | 'ADJUSTED_COST' | 'GAIN' | string
  currency: string
  reported: StatementField
  location: StatementLocation
  scope: StatementControlScope
  tolerance: string
}

export interface StatementParseRecipe {
  reader: { id: string; version: string }
  registryRevision: string
  limitsRevision: string
  adapters: Array<{ id: string; version: string; regionId: string }>
  schemaVersion: '3.0.0'
  normalizerVersion: string
  reconcilerVersion: string
  classificationCatalogVersion: string
  accountIdentityVersion: string
  structuralSelection: string[]
  mapping: { revision: string; hash: string } | null
}

export interface StatementDraft {
  schemaVersion: '3.0.0'
  adapter: { id: string; version: string }
  sourceHash: string
  recipe: StatementParseRecipe | null
  recordCounts: CsvDraft['recordCounts']
  accounts: StatementAccount[]
  controls: StatementControl[]
  issues: CsvIssue[]
}

export interface StatementAccountDecision {
  occurrenceId: string
  decision: 'SELECTED' | 'EXCLUDED'
  reason?: string
}
