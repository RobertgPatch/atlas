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
  id: string
  name: string
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
  taxYear: number
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
