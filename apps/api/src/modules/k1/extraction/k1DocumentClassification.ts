import type {
  K1ExtractionDraft,
  K1ExtractionDraftIssue,
} from '../k1.types.js'

export interface K1DocumentClassificationInput {
  draft: K1ExtractionDraft
  pageCount: number | null
  fallbackClassification?:
    | 'POSSIBLE_SCHEDULE_K1_FORM_1065'
    | 'OTHER_SCHEDULE_K1'
    | 'OTHER_TAX_FORM'
    | 'UNRELATED'
    | 'UNKNOWN'
    | null
}

export interface K1DocumentClassificationResult {
  family: K1ExtractionDraft['form']['family']
  revisionSupported: boolean
  multipleK1Package: boolean
  issues: K1ExtractionDraftIssue[]
  reviewRequired: boolean
  blocksApply: boolean
}

const SUPPORTED_REVISION_RANGE = Object.freeze({ minimum: 2000, maximum: 2025 })

const isSupportedRevision = (revisionYear: number | null): revisionYear is number =>
  revisionYear !== null
  && Number.isInteger(revisionYear)
  && revisionYear >= SUPPORTED_REVISION_RANGE.minimum
  && revisionYear <= SUPPORTED_REVISION_RANGE.maximum

const issue = (
  code: string,
  message: string,
  severity: K1ExtractionDraftIssue['severity'] = 'HIGH',
  details?: Record<string, unknown>,
): K1ExtractionDraftIssue => ({ code, severity, message, ...(details ? { details } : {}) })

export const classifyK1Document = (
  input: K1DocumentClassificationInput,
): K1DocumentClassificationResult => {
  const issues = [...input.draft.validationIssues]
  const { revisionYear, customOutputStatus } = input.draft.form
  const revisionSupported = isSupportedRevision(revisionYear)

  if (customOutputStatus === 'MATCH' && !revisionSupported) {
    issues.push(issue(
      'UNSUPPORTED_K1_REVISION',
      revisionYear === null
        ? 'The Schedule K-1 revision year could not be established.'
        : `Schedule K-1 revision ${revisionYear} is not supported.`,
      'HIGH',
      { revisionYear, supported: SUPPORTED_REVISION_RANGE },
    ))
  }

  if (input.pageCount === null || input.pageCount < 1) {
    issues.push(issue('MISSING_DOCUMENT_PAGES', 'The PDF page count is missing or invalid.'))
  } else if (input.draft.evidence.some((evidence) => evidence.page > input.pageCount!)) {
    issues.push(issue('MISSING_DOCUMENT_PAGES', 'Extraction evidence refers to a page not present in the uploaded PDF.'))
  }

  const identifiers = new Set(
    input.draft.values
      .filter((value) => value.canonicalPath === 'official.part_i_a_partnership_ein' && typeof value.normalizedValue === 'string')
      .map((value) => value.normalizedValue as string),
  )
  const alreadyFlaggedAsMultiple = issues.some((candidate) => candidate.code === 'MULTIPLE_K1_PACKAGE')
  const multipleK1Package = identifiers.size > 1 || alreadyFlaggedAsMultiple
  if (identifiers.size > 1 && !alreadyFlaggedAsMultiple) {
    issues.push(issue(
      'MULTIPLE_K1_PACKAGE',
      'The PDF appears to contain Schedule K-1s for more than one partnership.',
      'HIGH',
      { distinctPartnershipIdentifiers: identifiers.size },
    ))
  }

  if (input.fallbackClassification === 'OTHER_TAX_FORM' || input.fallbackClassification === 'UNRELATED') {
    issues.push(issue(
      'UNRELATED_TAX_FORM',
      'The uploaded PDF is not a supported partnership Schedule K-1.',
      'HIGH',
      { classification: input.fallbackClassification },
    ))
  } else if (input.fallbackClassification === 'OTHER_SCHEDULE_K1') {
    issues.push(issue(
      'UNSUPPORTED_K1_FAMILY',
      'The uploaded PDF is a Schedule K-1 family other than Form 1065.',
    ))
  }

  const unknownFields = input.draft.values.filter((value) => value.destination?.kind === 'EVIDENCE_ONLY')
  if (unknownFields.length > 0 && !issues.some((candidate) => candidate.code === 'UNMAPPED_PROVIDER_FIELD')) {
    issues.push(issue(
      'UNMAPPED_PROVIDER_FIELD',
      'One or more provider fields have no supported destination.',
      'MEDIUM',
      { count: unknownFields.length },
    ))
  }

  const blocksApply = issues.some((candidate) => candidate.severity === 'HIGH')
    || customOutputStatus !== 'MATCH'
    || !revisionSupported
  return {
    family: input.draft.form.family,
    revisionSupported,
    multipleK1Package,
    issues,
    reviewRequired: issues.length > 0,
    blocksApply,
  }
}
