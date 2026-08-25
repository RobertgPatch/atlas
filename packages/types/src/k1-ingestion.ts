// Shared wire types for the K-1 Ingestion API (Feature 002).
// Mirrors specs/002-k1-ingestion/contracts/k1-ingestion.openapi.yaml.

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
  scope: {
    taxYear: number | null
    entityId: string | null
  }
  counts: Record<K1Status, number>
  processingWithErrors: number
}

export interface K1UploadRequestBody {
  entityId: string
  replaceDocumentId?: string
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

export type K1UploadResult = K1UploadResponse | K1DuplicateResponse

export interface K1ListFilters {
  taxYear?: number
  entityId?: string
  status?: K1Status
  q?: string
  sort?: 'uploaded_at' | 'partnership' | 'entity' | 'tax_year' | 'status' | 'issues'
  direction?: 'asc' | 'desc'
  limit?: number
  cursor?: string
}

// Durable batch ingestion contracts (Feature 022).
export const K1_INGESTION_BATCH_STATUSES = [
  'OPEN',
  'PROCESSING',
  'ACTION_REQUIRED',
  'COMPLETED',
  'PARTIAL_FAILURE',
  'CANCELLED',
] as const
export type K1IngestionBatchStatus = (typeof K1_INGESTION_BATCH_STATUSES)[number]

export const K1_INGESTION_ITEM_STATUSES = [
  'PENDING_UPLOAD',
  'UPLOADED',
  'VALIDATING',
  'QUEUED',
  'PROCESSING',
  'NEEDS_MATCH',
  'NEEDS_REVIEW',
  'READY_TO_APPLY',
  'APPLIED',
  'FAILED',
  'CANCELLED',
] as const
export type K1IngestionItemStatus = (typeof K1_INGESTION_ITEM_STATUSES)[number]

export const K1_EXTRACTION_PROVIDERS = ['AWS_BDA', 'STUB'] as const
export type K1ExtractionProvider = (typeof K1_EXTRACTION_PROVIDERS)[number]

export const K1_EXTRACTION_ATTEMPT_STATUSES = [
  'CREATED',
  'SUBMITTED',
  'IN_PROGRESS',
  'SUCCEEDED',
  'FAILED',
  'SUPERSEDED',
] as const
export type K1ExtractionAttemptStatus =
  (typeof K1_EXTRACTION_ATTEMPT_STATUSES)[number]

export const K1_EXTRACTED_VALUE_KINDS = [
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'PERCENTAGE',
  'MONEY',
  'CODE_ROW',
] as const
export type K1ExtractedValueKind = (typeof K1_EXTRACTED_VALUE_KINDS)[number]

export const K1_EXTRACTION_DESTINATION_KINDS = [
  'CALCULATION',
  'OFFICIAL',
  'MATCH_SIGNAL',
  'EVIDENCE_ONLY',
] as const
export type K1ExtractionDestinationKind =
  (typeof K1_EXTRACTION_DESTINATION_KINDS)[number]

export interface K1IngestionError {
  error: string
  message?: string
  retryable?: boolean
  itemId?: string
  details?: Record<string, unknown>
}

export interface K1UploadSlot {
  method: 'PUT'
  url: string
  headers: Record<string, string>
  expiresAt: string
}

export interface K1IngestionBatchCounts {
  total: number
  active: number
  actionRequired: number
  applied: number
  failed: number
}

export interface K1IngestionItemError {
  code: string
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
  provider: K1ExtractionProvider
  status: K1ExtractionAttemptStatus
  blueprintVersion: string | null
  schemaVersion: string
  active: boolean
  startedAt: string | null
  completedAt: string | null
  error: K1IngestionItemError | null
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

export interface K1IngestionBatchCollectionCounts {
  total: number
  active: number
  attentionRequired: number
  completed: number
  cancelled: number
}

export interface K1IngestionBatchCollection {
  items: K1IngestionBatch[]
  counts: K1IngestionBatchCollectionCounts
  nextCursor: string | null
}

export interface K1IngestionBatchFilters {
  entityId?: string
  status?: K1IngestionBatchStatus
  attentionOnly?: boolean
  limit?: number
  cursor?: string
}

export interface K1CreateBatchFile {
  fileName: string
  sizeBytes: number
  sha256: string
  mimeType?: 'application/pdf'
}

export interface K1CreateIngestionBatchRequest {
  entityScopeId?: string | null
  files: K1CreateBatchFile[]
}

export interface K1CompleteUploadItem {
  itemId: string
  sha256: string
  objectVersionId?: string | null
}

export interface K1CompleteBatchUploadsRequest {
  items: K1CompleteUploadItem[]
}

export interface K1ExtractionSourceLocation {
  /** 1-based page number. */
  page: number
  /** Provider-normalized page-relative coordinates: [x1, y1, x2, y2]. */
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

export interface K1ExtractionAttemptSummary {
  id: string
  attemptNumber: number
  provider: K1ExtractionProvider
  status: K1ExtractionAttemptStatus
  blueprintVersion: string | null
  schemaVersion: string
  startedAt: string | null
  completedAt: string | null
  error: K1IngestionError | null
}

export type K1MatchCandidateType = 'ENTITY' | 'PARTNERSHIP'
export type K1MatchCandidateDecision = 'PROPOSED' | 'SELECTED' | 'REJECTED'

export interface K1MatchCandidate {
  id: string
  type: K1MatchCandidateType
  recordId: string
  maskedLabel: string
  score: number
  signals: string[]
  decision: K1MatchCandidateDecision
}

export interface K1MatchResolution {
  documentVersion: number
  entityId: string
  partnershipId: string
  taxYear: number
  matchStatus: 'MATCHED' | 'REQUIRES_REVIEW'
}

export type K1ApplicationDecision =
  | 'USE_EXTRACTED'
  | 'KEEP_EXISTING'
  | 'SKIP_UNMAPPED'

export interface K1ApplicationFieldDecision {
  id: string
  destinationKind: Extract<
    K1ExtractionDestinationKind,
    'CALCULATION' | 'OFFICIAL'
  >
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

export interface K1ApplyDecisionRequest {
  decisionId: string
  decision: K1ApplicationDecision
  reason?: string | null
}

export interface K1ApplyRequest {
  applicationId: string
  expectedDocumentVersion: number
  expectedTrackerRevision: number
  inceptionYear?: boolean
  decisions: K1ApplyDecisionRequest[]
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

export interface K1ApplyPreviewRequest {
  expectedDocumentVersion: number
}

export interface K1OfficialFieldSourceMetadata {
  sourceType: 'FINALIZED_K1' | 'MANUAL_ENTRY' | 'MANUAL_OVERRIDE'
  sourceK1DocumentId: string | null
  sourceK1FieldValueIds: string[]
  extractionAttemptId: string | null
  createdByEmail: string | null
  createdAt: string
}
