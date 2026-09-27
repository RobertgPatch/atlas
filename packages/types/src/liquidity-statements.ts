// CSV import contracts. Decimal strings are authoritative; null never means zero.
export const csvStatuses = ['UPLOAD_PENDING', 'VALIDATING', 'QUEUED', 'PARSING', 'NEEDS_MAPPING', 'NEEDS_REVIEW', 'READY_TO_APPLY', 'APPLIED', 'FAILED', 'REJECTED', 'CANCELLED'] as const
export type CsvStatus = typeof csvStatuses[number]
export const issueCodes = ['UNKNOWN_LAYOUT', 'MALFORMED_RECORD', 'UNSUPPORTED_RECORD', 'AMBIGUOUS_ACCOUNT', 'MISSING_DATE', 'AMBIGUOUS_DATE_ORDER', 'MISSING_CURRENCY', 'MISSING_VALUE', 'UNKNOWN_ASSET_TYPE', 'DUPLICATE_ROW', 'INCOMPLETE_BASIS', 'MISSING_BASIS', 'MISSING_DAY_CHANGE', 'TOTAL_NOT_PROVIDED', 'TOTAL_MISMATCH', 'FIELD_ARITHMETIC_MISMATCH', 'PERCENT_MISMATCH', 'ESTIMATED_BASIS', 'PARTIAL_SOURCE_COVERAGE', 'PARTIAL_EXPORT', 'EMPTY_ACCOUNT_CONFIRMATION', 'UNSUPPORTED_VALUATION_CONVENTION'] as const
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
export interface CsvDraft {
  schemaVersion: '2.0.0'
  adapter: { id: 'positions_v1' | 'merrill_holdings_v1' | 'mapped_csv_v1'; version: string }
  sourceHash: string
  recordCounts: { total: number; positions: number; controls: number; metadata: number; headers: number; blanks: number; unsupported: number }
  accounts: CsvAccount[]
  issues: CsvIssue[]
}
export interface Coverage { knownRows: number; unknownRows: number; estimatedRows: number; status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'; knownSubtotal: string | null; total: string | null }
export interface CsvReconciliation { status: 'MATCHED' | 'NOT_PROVIDED' | 'BLOCKED'; totalValue: string; difference: string | null; basisCoverage: Coverage; gainCoverage: Coverage }
export interface SourceAccount { id: string; entityId: string; custodian: string; name: string; accountMask: string | null; currency: string; included: boolean; cadence: 'EVERY_14_DAYS' | 'CALENDAR_MONTHLY' | 'ON_DEMAND'; version: number; holdingsAsOfDate: string | null; nextExpectedDate: string | null; latestSnapshotId: string | null; uploadedAt: string | null; activeSource: 'CSV' }
export interface PricingCapability { realTimeEquitiesEnabled: boolean; valuationMode: 'CSV_ONLY' | 'CSV_WITH_EQUITY_QUOTES'; revision: string }
export interface CsvSummary { id: string; entityId: string; custodian: string; version: number; status: CsvStatus; uploadedAt: string; adapterId: string | null; safeErrorCode: string | null }
export interface ReviewIssue extends CsvIssue { id: string; acknowledged: boolean }
export interface AccountBinding { occurrenceId: string; accountId: string; expectedAccountVersion: number; completeAccount: true; emptyAccountConfirmed: boolean; emptyReason?: string; acknowledgedIssueIds?: string[]; effectiveOrderDecision?: { kind: 'SOURCE_ORDER' | 'HISTORICAL_ONLY' | 'CORRECTION'; replacesSnapshotId?: string; reason: string } }
export interface CsvDetail { summary: CsvSummary; canonicalDraft: CsvDraft | null; reviewRevision: number; issues: ReviewIssue[]; accountBindings: AccountBinding[]; reconciliations: Record<string, CsvReconciliation>; records: CsvRecord[] }
export const mappingTargets = ['accountIdentifier', 'accountName', 'asOfDate', ...positionFields, 'ignoredEvidence'] as const
export interface MappingProfile { name: string; delimiter: ',' | ';' | '\t'; encoding: 'UTF8' | 'UTF16LE' | 'UTF16BE' | 'WINDOWS1252'; headerRecord: number; dateFormat: 'M/D/YYYY' | 'YYYY/MM/DD' | 'YYYY-MM-DD' | 'PROFILE_TITLE'; sourceZone?: string; percentUnit: 'PERCENT_POINTS' | 'RATIO'; currency: string; asOfDate?: string; columns: { sourceIndex: number; sourceHeader: string; target: typeof mappingTargets[number] }[] }
export interface ApplicationPreview { id: string; expectedVersion: number; summaryHash: string; expiresAt: string; canApply: boolean; accounts: { accountId: string; asOfDate: string; asOfAt: string | null; added: number; removed: number; changed: number; previousValue: string; nextValue: string; reconciliation: CsvReconciliation['status']; basisCoverage: Coverage; willBecomeCurrent: boolean }[] }
export interface UploadRequest { entityId: string; custodian: string; fileName: string; sizeBytes: number; sha256: string; contentType: string; profileId?: string }
export interface UploadCapability { statementId: string; version: number; url: string; expiresAt: string; requiredHeaders: Record<string, string>; duplicate?: boolean }
export interface ReviewChange { fieldPath: string; value: string | boolean | null; reason: string }
