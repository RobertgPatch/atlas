// Local mirror of packages/types/src/review-finalization.ts — kept local to satisfy api tsconfig rootDir.
// Update both together when the contract changes.

import type { K1Status } from '../k1/k1.types.js'

export type { K1Status }

export type K1ConfidenceBand = 'high' | 'medium' | 'low' | 'none'
export type K1ReviewSection = 'entityMapping' | 'partnershipMapping' | 'core'
export type K1FieldReviewStatus = 'PENDING' | 'REVIEWED'
export type K1IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH'
export type K1IssueStatus = 'OPEN' | 'RESOLVED'

export interface K1SourceLocation {
  page: number
  bbox: [number, number, number, number]
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
}

export interface K1ReviewSession {
  k1DocumentId: string
  version: number
  status: K1Status
  partnership: { id: string | null; name: string | null; rawName: string | null }
  entity: { id: string | null; name: string | null }
  taxYear: number
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
  fieldId: string
  value: string | null
}
export interface K1CorrectionsRequest { corrections: K1CorrectionRequestItem[] }
export interface K1CorrectionsResponse {
  version: number
  status: K1Status
  resolvedIssueIds: string[]
  approvalRevoked: boolean
}
export interface K1MapEntityRequest { entityId: string }
export interface K1MapPartnershipRequest { partnershipId: string }
export interface K1MapResponse { version: number; status: K1Status }
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
export interface K1OpenIssueResponse { issueId: string; version: number }
export interface K1ResolveIssueResponse { version: number }
