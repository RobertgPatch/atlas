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
  extractedPartnershipName?: string | null
  extractedTaxYear?: number | null
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
  readonly backend: 'stub' | 'aws_bda'
  extract(ctx: ExtractCtx): Promise<ExtractResult>
}

export interface K1AsyncSubmissionInput {
  clientToken: string
  inputS3Uri: string
  outputS3Uri: string
  k1DocumentId: string
  extractionAttemptId: string
}

export interface K1AsyncSubmission {
  providerJobId: string
  immediateCompletion?: {
    providerStatus: string
    output: { key: string; bucket: string | null; versionId: string | null }
  }
}

export interface K1AsyncJobStatus {
  status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED'
  providerStatus: string
  outputS3Uri: string | null
  errorCode: string | null
  errorMessage: string | null
  submittedAt: Date | null
  completedAt: Date | null
}

export interface K1AsyncExtractor extends K1Extractor {
  submit(input: K1AsyncSubmissionInput): Promise<K1AsyncSubmission>
  getStatus(providerJobId: string): Promise<K1AsyncJobStatus>
}

export const isAsyncK1Extractor = (extractor: K1Extractor): extractor is K1AsyncExtractor =>
  'submit' in extractor && typeof (extractor as Partial<K1AsyncExtractor>).submit === 'function'
