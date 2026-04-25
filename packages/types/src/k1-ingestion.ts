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
