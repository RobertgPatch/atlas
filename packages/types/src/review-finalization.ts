// Shared wire types for K-1 Review Workspace and Finalization (Feature 003).
// Mirrors specs/003-review-and-finalization/contracts/review-finalization.openapi.yaml.

import type {
  K1ExtractionAttemptSummary,
  K1ExtractionDestination,
  K1ExtractionSourceLocation,
  K1ExtractedValueKind,
  K1MatchCandidate,
  K1Status,
} from './k1-ingestion'

export type { K1Status }

export type K1ConfidenceBand = 'high' | 'medium' | 'low' | 'none'
export type K1ReviewSection = 'entityMapping' | 'partnershipMapping' | 'core'
export type K1FieldReviewStatus =
  | 'PENDING'
  | 'REVIEWED'
  | 'ACCEPTED'
  | 'CORRECTED'
  | 'REJECTED'
export type K1IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH'
export type K1IssueStatus = 'OPEN' | 'RESOLVED'

export interface K1SourceLocation {
  /** 1-based page number */
  page: number
  /** Normalized 0-100 page-relative coordinates: [x1, y1, x2, y2] */
  bbox?: [number, number, number, number]
  textRef?: string | null
}

export interface K1FieldValue {
  id: string
  fieldName: string
  label: string
  section: K1ReviewSection
  required: boolean
  rawValue: string | null
  normalizedValue: string | null
  reviewerCorrectedValue: string | null
  confidenceScore: number | null
  confidenceBand: K1ConfidenceBand
  sourceLocation: K1SourceLocation | null
  reviewStatus: K1FieldReviewStatus
  isModified: boolean
  linkedIssueIds: string[]
  updatedAt: string
  extractionAttemptId?: string | null
  occurrenceId?: string | null
  occurrenceIndex?: number | null
  canonicalPath?: string | null
  valueKind?: K1ExtractedValueKind | null
  rawValueJson?: unknown
  normalizedValueJson?: unknown
  reviewerCorrectedValueJson?: unknown
  effectiveValueJson?: unknown
  sourceLocations?: K1ExtractionSourceLocation[]
  destination?: K1ExtractionDestination | null
  mappingRuleVersion?: string | null
  correctionHistory?: Array<{
    id: string
    correctedValue: unknown
    correctedValueText: string | null
    documentVersion: number
    correctedByUserId: string
    createdAt: string
  }>
}

export interface K1Issue {
  id: string
  k1FieldValueId: string | null
  issueType: string
  severity: K1IssueSeverity
  status: K1IssueStatus
  message: string | null
  resolvedAt: string | null
  resolvedByUserId: string | null
  createdAt: string
  extractionAttemptId?: string | null
  occurrenceId?: string | null
  issueCode?: string | null
  details?: Record<string, unknown> | null
}

export interface K1ReviewSession {
  k1DocumentId: string
  version: number
  status: K1Status
  partnership: { id: string | null; name: string | null; rawName: string | null }
  entity: { id: string | null; name: string | null }
  taxYear: number | null
  uploadedAt: string
  approvedByUserId: string | null
  finalizedByUserId: string | null
  fields: {
    entityMapping: K1FieldValue[]
    partnershipMapping: K1FieldValue[]
    core: K1FieldValue[]
  }
  issues: K1Issue[]
  reportedDistributionAmount: string | null
  pdfUrl: string
  canApprove: boolean
  canFinalize: boolean
  canEdit: boolean
  approveBlockingReasons: K1ActionBlockingReason[]
  finalizeBlockingReasons: K1ActionBlockingReason[]
  activeAttempt?: K1ExtractionAttemptSummary | null
  attemptHistory?: K1ExtractionAttemptSummary[]
  matchCandidates?: K1MatchCandidate[]
  canApply?: boolean
  applyBlockingReasons?: string[]
  appliedTrackerYearId?: string | null
  appliedAt?: string | null
  appliedByEmail?: string | null
}

export type K1ActionBlockingReason =
  | 'NOT_ADMIN'
  | 'WRONG_STATUS'
  | 'OPEN_ISSUES'
  | 'EMPTY_REQUIRED'
  | 'UNMAPPED_ENTITY'
  | 'UNMAPPED_PARTNERSHIP'
  | 'MISSING_REPORTED_DISTRIBUTION'

export interface K1CorrectionRequestItem {
  fieldId?: string
  fieldValueId?: string
  /** New reviewer_corrected_value; null to revert to parsed value. */
  value: unknown
  reason?: string | null
}

export interface K1CorrectionsRequest {
  corrections: K1CorrectionRequestItem[]
}

export interface K1CorrectionsResponse {
  version: number
  status: K1Status
  resolvedIssueIds: string[]
  approvalRevoked: boolean
}

export interface K1MapEntityRequest {
  entityId: string
}

export interface K1MapPartnershipRequest {
  partnershipId: string
}

export interface K1MapResponse {
  version: number
  status: K1Status
}

export interface K1ApproveResponse {
  version: number
  status: 'READY_FOR_APPROVAL'
  approvedByUserId: string
}

export interface K1FinalizeResponse {
  version: number
  status: 'FINALIZED'
  finalizedByUserId: string
  partnershipAnnualActivityId: string
}

export interface K1OpenIssueRequest {
  message?: string
  k1FieldValueId?: string
  severity?: K1IssueSeverity
  issueType?: string
}

export interface K1OpenIssueResponse {
  issueId: string
  version: number
}

export interface K1ResolveIssueResponse {
  version: number
}

export interface K1ResolveIssueRequest {
  acceptExtractedValue?: boolean
  acknowledgement?: string
}

export interface K1ResolveMatchRequest {
  expectedDocumentVersion: number
  entityId: string
  partnershipId: string
  taxYear: number
  createFromExtraction?: false
  reviewedEvidence: true
}

// Standard error envelope
export interface K1ReviewErrorBody {
  error: string
  message?: string
  currentVersion?: number
  [k: string]: unknown
}

export const K1_REVIEW_ERROR_CODES = [
  'STALE_K1_VERSION',
  'IF_MATCH_REQUIRED',
  'VALIDATION_FAILED',
  'K1_FINALIZED',
  'INVALID_STATE_TRANSITION',
  'UNMAPPED_ENTITY',
  'UNMAPPED_PARTNERSHIP',
  'PARTNERSHIP_ENTITY_MISMATCH',
  'ROLE_REQUIRED_ADMIN',
  'SAME_ACTOR_FINALIZE_FORBIDDEN',
  'FINALIZE_PRECONDITION_FAILED',
  'ISSUE_ALREADY_RESOLVED',
  'FORBIDDEN_ENTITY',
  'NOT_FOUND',
] as const
export type K1ReviewErrorCode = (typeof K1_REVIEW_ERROR_CODES)[number]
