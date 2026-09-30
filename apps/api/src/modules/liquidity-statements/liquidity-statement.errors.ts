export const csvErrors = {
  NOT_FOUND: [404, 'The requested import or account was not found.'],
  FORBIDDEN: [403, 'This action is not permitted.'],
  INVALID_REQUEST: [400, 'Check the submitted fields.'],
  STALE_VERSION: [409, 'The import or account changed. Reload and review it again.'],
  INVALID_STATE: [409, 'This action is unavailable in the current state.'],
  FINANCIAL_HISTORY_RETAINED: [409, 'Applied financial history cannot be deleted. Remove only empty custodians or non-applied statements.'],
  CUSTODIAN_EXISTS: [409, 'A custodian with that name already exists for this entity.'],
  DUPLICATE_IMPORT: [409, 'These bytes already belong to an import in this entity.'],
  QUOTA_EXCEEDED: [429, 'The upload capacity limit has been reached. Try again later.'],
  DISABLED: [503, 'Statement processing is temporarily disabled.'],
  STORAGE_UNAVAILABLE: [503, 'The protected file store is unavailable.'],
  STORAGE_MISMATCH: [422, 'The uploaded object does not match its authorized content.'],
  FILE_KIND_MISMATCH: [422, 'The uploaded bytes do not match the selected statement format.'],
  UNSUPPORTED_FILE_KIND: [422, 'Choose a supported CSV or XLSX statement file.'],
  NEEDS_ADAPTER: [422, 'This statement layout is not recognized. Add and test a reusable adapter before publishing it.'],
  AMBIGUOUS_LAYOUT: [422, 'More than one statement layout matched the same source region. Add a more specific adapter before publishing it.'],
  CUSTODIAN_MISMATCH: [422, 'The detected statement layout does not match the selected custodian.'],
  INVALID_ADAPTER_HINT: [422, 'The requested statement adapter/version is unavailable or does not match this file.'],
  CAPABILITY_EXPIRED: [409, 'The upload authorization expired. Start a new upload.'],
  MALFORMED_CSV: [422, 'The file contains malformed CSV records.'],
  RESOURCE_LIMIT: [422, 'The file exceeds a CSV processing limit.'],
  UNSUPPORTED_ENCODING: [422, 'Choose a supported text encoding for this file.'],
  BLOCKING_ISSUES: [422, 'Resolve the blocking issues and acknowledge warnings before applying.'],
  RETRY_EXHAUSTED: [409, 'No further transient retries are available.'],
  TRANSIENT_FAILURE: [503, 'Processing was interrupted. Retry the import.'],
} as const
export type CsvErrorCode = keyof typeof csvErrors
export class CsvError extends Error {
  readonly statusCode: number
  constructor(readonly code: CsvErrorCode) { super(csvErrors[code][1]); this.statusCode = csvErrors[code][0] }
}
export const assertCsv = (value: unknown, code: CsvErrorCode): asserts value => { if (!value) throw new CsvError(code) }
