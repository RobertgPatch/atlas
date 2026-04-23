import type { K1Status } from '../k1.types.js'

export interface ExtractIssue {
  issueType: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  message: string
}

export interface ExtractFieldValue {
  fieldName: string
  label: string
  section: 'entityMapping' | 'partnershipMapping' | 'core'
  required: boolean
  rawValue: string | null
  confidenceScore: number
  sourceLocation?: { page: number; bbox: [number, number, number, number] } | null
}

export interface ExtractSuccess {
  outcome: 'SUCCESS'
  nextStatus: Extract<K1Status, 'NEEDS_REVIEW' | 'READY_FOR_APPROVAL'>
  issues: ExtractIssue[]
  fieldValues: ExtractFieldValue[]
}

export interface ExtractFailure {
  outcome: 'FAILURE'
  errorCode: string
  errorMessage: string
}

export type ExtractResult = ExtractSuccess | ExtractFailure

export interface ExtractCtx {
  k1DocumentId: string
  pdfSizeBytes: number
  /** Storage-root-relative path to the PDF file, e.g. "uploads/abc123.pdf". */
  storagePath: string
  simulateFailure?: boolean
}

export interface K1Extractor {
  readonly backend: 'stub' | 'azure'
  extract(ctx: ExtractCtx): Promise<ExtractResult>
}
