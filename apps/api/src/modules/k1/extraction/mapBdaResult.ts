import { createHash } from 'node:crypto'

import type {
  K1ExtractedValue,
  K1ExtractedValueKind,
  K1ExtractionDraft,
  K1ExtractionDraftIssue,
  K1ExtractionEvidenceReference,
  K1ExtractionSourceLocation,
} from '../k1.types.js'
import {
  classifyK1CanonicalPath,
  K1_MAPPING_RULE_VERSION,
} from './k1DestinationInventory.js'
import {
  normalizeK1ExtractedValue,
  validateK1DraftRelationships,
} from './k1DraftValidation.js'

type JsonRecord = Record<string, unknown>
const K1_STATUS_CHECKBOX_REVIEW_THRESHOLD = 0.75

const record = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null

const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []

const string = (value: unknown): string | null => typeof value === 'string' ? value : null

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const deterministicUuid = (parts: unknown[]): string => {
  const hex = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const joined = hex.join('')
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`
}

const toBBox = (value: unknown): [number, number, number, number] | undefined => {
  if (Array.isArray(value) && value.length === 4 && value.every((part) => typeof part === 'number')) {
    return value as [number, number, number, number]
  }
  const box = record(value)
  if (!box) return undefined
  const left = number(box.left ?? box.x)
  const top = number(box.top ?? box.y)
  const width = number(box.width)
  const height = number(box.height)
  if (left === null || top === null || width === null || height === null) return undefined
  return [left, top, Number((left + width).toFixed(10)), Number((top + height).toFixed(10))]
}

interface ParsedEvidence {
  evidence: K1ExtractionEvidenceReference[]
  byProviderId: Map<string, K1ExtractionSourceLocation[]>
}

const parseStandardEvidence = (standardOutput: unknown): ParsedEvidence => {
  const root = record(standardOutput)
  const document = record(root?.document ?? root?.Document)
  const elements = array(document?.elements ?? document?.Elements)
  const evidence: K1ExtractionEvidenceReference[] = []
  const byProviderId = new Map<string, K1ExtractionSourceLocation[]>()

  elements.forEach((rawElement, elementIndex) => {
    const element = record(rawElement)
    if (!element) return
    const providerId = string(element.id ?? element.element_id) ?? `element-${elementIndex + 1}`
    const locations = array(element.locations ?? element.location)
    const pageIndices = array(element.page_indices ?? element.pageIndices)
    const representation = record(element.representation)
    const sourceText = string(representation?.text ?? element.text)
    const readingOrder = number(element.reading_order ?? element.readingOrder)
    const parsedLocations: K1ExtractionSourceLocation[] = []

    const rawLocations = locations.length > 0
      ? locations
      : pageIndices.map((pageIndex) => ({ page_index: pageIndex }))
    rawLocations.forEach((rawLocation, locationIndex) => {
      const location = record(rawLocation)
      const zeroBasedPage = number(location?.page_index ?? location?.pageIndex ?? pageIndices[locationIndex]) ?? 0
      const page = Math.max(1, Math.trunc(zeroBasedPage) + 1)
      const bbox = toBBox(location?.bounding_box ?? location?.boundingBox ?? location?.bbox)
      const evidenceId = `${providerId}:${page}:${locationIndex}`
      const sourceLocation: K1ExtractionSourceLocation = { page, textRef: providerId }
      if (bbox) sourceLocation.bbox = bbox
      parsedLocations.push(sourceLocation)
      evidence.push({
        id: evidenceId,
        page,
        kind: string(element.type)?.toUpperCase() === 'TABLE' ? 'TABLE' : 'TEXT',
        sourceRef: sourceText ?? (readingOrder === null ? providerId : `reading-order:${readingOrder}`),
        ...(bbox ? { bbox } : {}),
      })
    })
    byProviderId.set(providerId, parsedLocations)
  })

  return { evidence, byProviderId }
}

const inferKind = (rawKind: unknown, canonicalPath: string, rawValue: unknown): K1ExtractedValueKind => {
  const candidate = string(rawKind)?.toUpperCase()
  if (candidate && ['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'PERCENTAGE', 'MONEY', 'CODE_ROW'].includes(candidate)) {
    return candidate as K1ExtractedValueKind
  }
  if (canonicalPath.endsWith('_entries')) return 'CODE_ROW'
  if (canonicalPath === 'official.k1_status_final' || canonicalPath === 'official.k1_status_amended') return 'BOOLEAN'
  if (canonicalPath === 'official.tax_period_beginning' || canonicalPath === 'official.tax_period_ending') return 'DATE'
  if (canonicalPath.endsWith('_pct')) return 'PERCENTAGE'
  if (canonicalPath.startsWith('calculation.')) return 'MONEY'
  if (/^official\.(part_ii_n_|box_(4a|4b|6b|6c|9b|9c)_)/.test(canonicalPath)) return 'MONEY'
  if (canonicalPath === 'match.tax_year') return 'NUMBER'
  if (typeof rawValue === 'boolean') return 'BOOLEAN'
  if (typeof rawValue === 'number') return 'NUMBER'
  return 'STRING'
}

const decodeCanonicalPath = (providerFieldName: string): string =>
  providerFieldName
    .replace(/^official__/, 'official.')
    .replace(/^calculation__/, 'calculation.')
    .replace(/^match__/, 'match.')

const isSubstantiveFlatValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 && !/^[$-]+$/.test(trimmed)
  }
  if (Array.isArray(value)) return value.some(isSubstantiveFlatValue)
  return true
}

const explainabilityLocations = (
  providerFieldName: string,
  explainability: JsonRecord | null,
): K1ExtractionSourceLocation[] => {
  const fieldExplainability = record(explainability?.[providerFieldName])
  return array(fieldExplainability?.geometry).flatMap((rawGeometry) => {
    const geometry = record(rawGeometry)
    const page = number(geometry?.page)
    if (page === null) return []
    const bbox = toBBox(geometry?.boundingBox ?? geometry?.bounding_box ?? geometry?.bbox)
    return [{
      page: Math.max(1, Math.trunc(page)),
      textRef: providerFieldName,
      ...(bbox ? { bbox } : {}),
    }]
  })
}

const objectFields = (
  value: JsonRecord,
  explainability: JsonRecord | null,
): JsonRecord[] => Object.entries(value).flatMap(([providerFieldName, rawValue]) => {
  const filteredValue = Array.isArray(rawValue)
    ? rawValue.filter(isSubstantiveFlatValue)
    : rawValue
  if (!isSubstantiveFlatValue(filteredValue)) return []
  const fieldExplainability = record(explainability?.[providerFieldName])
  return [{
    canonical_path: decodeCanonicalPath(providerFieldName),
    value: filteredValue,
    confidence: number(fieldExplainability?.confidence),
    source_locations: explainabilityLocations(providerFieldName, explainability),
  }]
})

const extractProviderFields = (
  inferenceResult: unknown,
  explainability: unknown,
): JsonRecord[] => {
  const inference = record(inferenceResult)
  if (!inference) return []
  const rawFields = inference.extracted_fields ?? inference.fields ?? inference.values
  if (Array.isArray(rawFields)) return rawFields.map(record).filter((field): field is JsonRecord => field !== null)
  const fieldRecord = record(rawFields)
  return objectFields(fieldRecord ?? inference, record(explainability))
}

const parseDirectLocations = (field: JsonRecord): K1ExtractionSourceLocation[] => {
  const explicit = array(field.source_locations ?? field.sourceLocations)
  if (explicit.length > 0) {
    return explicit.flatMap((raw) => {
      const location = record(raw)
      const page = number(location?.page ?? location?.page_number)
      if (page === null) return []
      const bbox = toBBox(location?.bbox ?? location?.bounding_box)
      return [{
        page: Math.max(1, Math.trunc(page)),
        textRef: string(location?.text_ref ?? location?.textRef) ?? null,
        ...(bbox ? { bbox } : {}),
      }]
    })
  }
  const page = number(field.page_number ?? field.page)
  if (page === null) return []
  const bbox = toBBox(field.bounding_box ?? field.bbox)
  return [{ page: Math.max(1, Math.trunc(page)), textRef: null, ...(bbox ? { bbox } : {}) }]
}

const statusIssues = (status: string): K1ExtractionDraftIssue[] => {
  if (status === 'MATCH') return []
  if (status === 'NO_MATCH') return [{
    code: 'BDA_NO_MATCH', severity: 'HIGH',
    message: 'Bedrock Data Automation did not match the K-1 blueprint.',
  }]
  if (status === 'FALLBACK') return [{
    code: 'BDA_FALLBACK_OUTPUT', severity: 'HIGH',
    message: 'Bedrock Data Automation used fallback output; a reviewer must classify the document.',
  }]
  return [{
    code: 'BDA_UNKNOWN_CUSTOM_OUTPUT_STATUS', severity: 'HIGH',
    message: `Bedrock Data Automation returned the unrecognized status ${status}.`,
    details: { status },
  }]
}

export const mapBdaResult = (raw: unknown): K1ExtractionDraft => {
  const root = record(raw) ?? {}
  const segment = record(array(root.outputSegments ?? root.output_segments)[0]) ?? root
  const status = string(segment.customOutputStatus ?? segment.custom_output_status) ?? 'UNKNOWN'
  const customOutput = record(segment.customOutput ?? segment.custom_output)
  const inferenceResult = customOutput?.inference_result ?? customOutput?.inferenceResult ?? segment.inference_result
  const explainability = customOutput?.explainability_info ?? customOutput?.explainabilityInfo
  const { evidence, byProviderId } = parseStandardEvidence(segment.standardOutput ?? segment.standard_output)
  const validationIssues = statusIssues(status)
  const values: K1ExtractedValue[] = []

  extractProviderFields(inferenceResult, explainability).forEach((field, fieldIndex) => {
    const canonicalPath = string(field.canonical_path ?? field.canonicalPath ?? field.name ?? field.field_name)
      ?? `provider.unnamed_field_${fieldIndex + 1}`
    const rawValue = field.value ?? field.raw_value ?? field.rawValue ?? null
    const kind = inferKind(field.value_kind ?? field.kind ?? field.type, canonicalPath, rawValue)
    const repeatedValues = kind === 'CODE_ROW' && Array.isArray(rawValue) ? rawValue : [rawValue]
    const evidenceIds = array(field.evidence_ids ?? field.evidenceIds).filter((id): id is string => typeof id === 'string')
    const sourceLocations = evidenceIds.flatMap((id) => byProviderId.get(id) ?? [])
    const directLocations = parseDirectLocations(field)
    const locations = sourceLocations.length > 0 ? sourceLocations : directLocations
    const destination = classifyK1CanonicalPath(canonicalPath)

    repeatedValues.forEach((occurrenceRawValue, occurrenceIndex) => {
      const occurrenceId = deterministicUuid([canonicalPath, fieldIndex, occurrenceIndex, occurrenceRawValue, evidenceIds])
      const normalization = normalizeK1ExtractedValue(canonicalPath, kind, occurrenceRawValue)
      const confidence = number(field.confidence ?? field.confidence_score)
      values.push({
        occurrenceId,
        canonicalPath,
        kind,
        rawValue: occurrenceRawValue,
        normalizedValue: normalization.value,
        confidence,
        sourceLocations: locations,
        destination,
        mappingRuleVersion: K1_MAPPING_RULE_VERSION,
      })
      if (normalization.issue) {
        validationIssues.push({ ...normalization.issue, canonicalPath, occurrenceId })
      }
      if (
        kind === 'BOOLEAN'
        && (canonicalPath === 'official.k1_status_final' || canonicalPath === 'official.k1_status_amended')
        && confidence !== null
        && confidence < K1_STATUS_CHECKBOX_REVIEW_THRESHOLD
      ) {
        const checkboxLabel = canonicalPath.endsWith('_final') ? 'Final K-1' : 'Amended K-1'
        validationIssues.push({
          code: 'AMBIGUOUS_CHECKBOX',
          severity: 'HIGH',
          canonicalPath,
          occurrenceId,
          message: `AWS could not confidently determine whether the ${checkboxLabel} box is checked. Verify it against the PDF.`,
          details: { confidence, reviewThreshold: K1_STATUS_CHECKBOX_REVIEW_THRESHOLD },
        })
      }
      if (destination.kind === 'EVIDENCE_ONLY') {
        validationIssues.push({
          code: 'UNMAPPED_PROVIDER_FIELD',
          severity: 'MEDIUM',
          canonicalPath,
          occurrenceId,
          message: 'The provider returned a field that has no application destination.',
        })
      }
    })
  })

  validationIssues.push(...validateK1DraftRelationships(values))
  const explicitRevisionYear = number(root.revisionYear ?? root.revision_year)
  const extractedTaxYear = values.find((value) => value.canonicalPath === 'match.tax_year')?.normalizedValue
  const inferredRevisionYear = typeof extractedTaxYear === 'number'
    && Number.isInteger(extractedTaxYear)
    && extractedTaxYear >= 2000
    && extractedTaxYear <= 2100
    ? extractedTaxYear
    : null
  return {
    schemaVersion: K1_MAPPING_RULE_VERSION,
    form: {
      family: status === 'MATCH' ? 'SCHEDULE_K1_FORM_1065' : 'UNKNOWN',
      revisionYear: explicitRevisionYear ?? inferredRevisionYear,
      customOutputStatus: status,
    },
    values,
    evidence,
    validationIssues,
  }
}
