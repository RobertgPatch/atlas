// Mirror of packages/types/src/k1-ingestion.ts — kept local to satisfy tsconfig rootDir.
// Update both files together when the contract changes.

export const K1_STATUSES = [
  'UPLOADED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'READY_FOR_APPROVAL',
  'FINALIZED',
] as const
export type K1Status = (typeof K1_STATUSES)[number]

export interface K1PartnershipRef {
  id: string | null
  name: string | null
}
export interface K1EntityRef {
  id: string
  name: string
}
export interface K1ParseError {
  code: string
  message: string
  lastAttemptAt: string
}
export interface K1DocumentSummary {
  id: string
  documentId: string
  documentName: string
  partnership: K1PartnershipRef
  entity: K1EntityRef
  taxYear: number | null
  status: K1Status
  issuesOpenCount: number
  uploadedAt: string
  uploaderUserId: string
  parseError: K1ParseError | null
  supersededByDocumentId: string | null
}
export interface K1ListResponse {
  items: K1DocumentSummary[]
  nextCursor: string | null
}
export interface K1Kpis {
  scope: { taxYear: number | null; entityId: string | null }
  counts: Record<K1Status, number>
  processingWithErrors: number
}
export interface K1UploadResponse {
  k1DocumentId: string
  documentId: string
  status: 'UPLOADED'
}
export interface K1DuplicateResponse {
  error: 'DUPLICATE_K1'
  existing: {
    k1DocumentId: string
    documentId: string
    uploadedAt: string
    status: K1Status
  }
}

export const K1_INGESTION_ERROR_CODES = [
  'K1_INGESTION_DISABLED',
  'BATCH_NOT_FOUND',
  'ITEM_NOT_FOUND',
  'FORBIDDEN_ENTITY',
  'FORBIDDEN_K1_DOCUMENT',
  'INVALID_FILE_COUNT',
  'INVALID_FILE_NAME',
  'INVALID_FILE_SIZE',
  'INVALID_CHECKSUM',
  'UNSUPPORTED_MEDIA_TYPE',
  'UPLOAD_NOT_FOUND',
  'UPLOAD_INCOMPLETE',
  'OBJECT_SIZE_MISMATCH',
  'OBJECT_CHECKSUM_MISMATCH',
  'PDF_INVALID',
  'PDF_ENCRYPTED',
  'PDF_PAGE_LIMIT_EXCEEDED',
  'DUPLICATE_K1_CONTENT',
  'EXTRACTION_FAILED',
  'EXTRACTION_RESULT_INVALID',
  'EXTRACTION_THROTTLED',
  'STALE_K1_VERSION',
  'STALE_TRACKER_REVISION',
  'INVALID_ITEM_STATE',
  'INTERNAL_INGESTION_ERROR',
] as const

export type K1IngestionErrorCode = (typeof K1_INGESTION_ERROR_CODES)[number]

export interface K1IngestionErrorResponse {
  error: K1IngestionErrorCode
  message: string
  retryable: boolean
  requestId?: string
  itemId?: string
}

export interface K1AuditMetadata {
  batchId?: string
  itemId?: string
  k1DocumentId?: string
  extractionAttemptId?: string
  applicationId?: string
  entityId?: string
  actorUserId?: string
  status?: string
  version?: number
  sha256Prefix?: string
  counts?: Record<string, number>
}

export type K1IngestionBatchStatus =
  | 'OPEN'
  | 'PROCESSING'
  | 'ACTION_REQUIRED'
  | 'COMPLETED'
  | 'PARTIAL_FAILURE'
  | 'CANCELLED'

export type K1IngestionItemStatus =
  | 'PENDING_UPLOAD'
  | 'UPLOADED'
  | 'VALIDATING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'NEEDS_MATCH'
  | 'NEEDS_REVIEW'
  | 'READY_TO_APPLY'
  | 'APPLIED'
  | 'FAILED'
  | 'CANCELLED'

export interface K1UploadSlot {
  method: 'PUT'
  url: string
  headers: Record<string, string>
  expiresAt: string
}

export interface K1IngestionItemError {
  code: K1IngestionErrorCode
  message: string
  retryable: boolean
}

export interface K1IngestionItem {
  id: string
  fileName: string
  sizeBytes: number
  sha256: string
  status: K1IngestionItemStatus
  upload: K1UploadSlot | null
  k1DocumentId: string | null
  error: K1IngestionItemError | null
  updatedAt: string
  documentVersion: number | null
  activeExtractionAttemptId: string | null
  attemptHistory: K1IngestionAttemptSummary[]
  canRetry: boolean
  canCancel: boolean
  canDelete: boolean
  partnershipId: string | null
  taxYear: number | null
  partnershipCandidates: Array<{
    id: string
    maskedLabel: string
    score: number
    decision: 'PROPOSED' | 'SELECTED' | 'REJECTED'
  }>
}

export interface K1IngestionAttemptSummary {
  id: string
  attemptNumber: number
  provider: 'AWS_BDA' | 'STUB'
  status: 'CREATED' | 'SUBMITTED' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'SUPERSEDED'
  blueprintVersion: string | null
  schemaVersion: string
  active: boolean
  startedAt: string | null
  completedAt: string | null
  error: K1IngestionItemError | null
}

export interface K1IngestionBatchCounts {
  total: number
  active: number
  actionRequired: number
  applied: number
  failed: number
}

export interface K1IngestionBatch {
  id: string
  status: K1IngestionBatchStatus
  entityScopeId: string | null
  createdAt: string
  closedAt: string | null
  counts: K1IngestionBatchCounts
  items: K1IngestionItem[]
}

export interface K1IngestionBatchCollection {
  items: K1IngestionBatch[]
  counts: { total: number; active: number; attentionRequired: number; completed: number; cancelled: number }
  nextCursor: string | null
}

export type K1ExtractedValueKind =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'PERCENTAGE'
  | 'MONEY'
  | 'CODE_ROW'

export type K1ExtractionDestinationKind =
  | 'CALCULATION'
  | 'OFFICIAL'
  | 'MATCH_SIGNAL'
  | 'EVIDENCE_ONLY'

export interface K1ExtractionSourceLocation {
  page: number
  bbox?: [number, number, number, number]
  textRef?: string | null
}

export interface K1ExtractionDestination {
  kind: K1ExtractionDestinationKind
  key?: string | null
}

export interface K1ExtractedValue {
  occurrenceId: string
  canonicalPath: string
  kind: K1ExtractedValueKind
  rawValue: unknown
  normalizedValue: unknown
  confidence: number | null
  sourceLocations: K1ExtractionSourceLocation[]
  destination?: K1ExtractionDestination | null
  mappingRuleVersion: string
}

export interface K1ExtractionEvidenceReference {
  id: string
  page: number
  kind: 'TEXT' | 'TABLE' | 'IMAGE' | 'UNKNOWN'
  sourceRef: string | null
  bbox?: [number, number, number, number]
}

export interface K1ExtractionDraftIssue {
  code: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  canonicalPath?: string | null
  occurrenceId?: string | null
  message: string
  details?: Record<string, unknown>
}

export interface K1ExtractionDraft {
  schemaVersion: string
  form: {
    family: 'SCHEDULE_K1_FORM_1065' | 'UNKNOWN'
    revisionYear: number | null
    customOutputStatus: string
  }
  values: K1ExtractedValue[]
  evidence: K1ExtractionEvidenceReference[]
  validationIssues: K1ExtractionDraftIssue[]
}

export type K1ApplicationDecision = 'USE_EXTRACTED' | 'KEEP_EXISTING' | 'SKIP_UNMAPPED'
export interface K1ApplicationFieldDecision {
  id: string
  destinationKind: 'CALCULATION' | 'OFFICIAL'
  destinationKey: string
  extractedValue: unknown
  existingValue: unknown
  defaultDecision: K1ApplicationDecision
  conflict: boolean
  sourceFieldValueIds: string[]
}
export interface K1ApplicationPreview {
  applicationId: string
  k1DocumentId: string
  expectedDocumentVersion: number
  trackerYearId: string
  expectedTrackerRevision: number
  expiresAt: string
  decisions: K1ApplicationFieldDecision[]
}
export interface K1ApplyResponse {
  applicationId: string
  k1DocumentId: string
  status: 'APPLIED'
  trackerYearId: string
  trackerRevision: number
  appliedAt: string
  invalidatedTaxYears: number[]
}

const SENSITIVE_LOG_KEYS = /(?:raw|normalized|corrected)?value|tax.?id|tin|ein|ssn|address|partner.?name/i

export const redactK1SensitiveMetadata = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactK1SensitiveMetadata)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_LOG_KEYS.test(key))
      .map(([key, nested]) => [key, redactK1SensitiveMetadata(nested)]),
  )
}
