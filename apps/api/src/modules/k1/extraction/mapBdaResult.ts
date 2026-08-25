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

const normalizeDocumentText = (value: string): string => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const containsScheduleK1Form1065Header = (value: string): boolean => {
  const normalized = normalizeDocumentText(value)
  if (!/\bschedule k\s*1 form 1065\b/.test(normalized)) return false

  // A tax package can contain state worksheets and instructions that mention
  // the federal form by name. Count a page as a K-1 only when the phrase is a
  // standalone heading or appears with other text from the federal form header.
  return normalized.length <= 160
    || /\bdepartment of the treasury internal revenue service\b/.test(normalized)
    || /\bpartner s share of (?:current year )?income deductions credits\b/.test(normalized)
    || (
      /\binformation about the partnership\b/.test(normalized)
      && /\binformation about the partner\b/.test(normalized)
    )
}

const elementText = (element: JsonRecord): string | null => {
  const representation = record(element.representation)
  return string(representation?.text ?? element.text)
}

const elementPages = (element: JsonRecord): number[] => {
  const pageIndices = array(element.page_indices ?? element.pageIndices)
  const locations = array(element.locations ?? element.location)
  const rawLocations = locations.length > 0
    ? locations
    : pageIndices.map((pageIndex) => ({ page_index: pageIndex }))
  return rawLocations.flatMap((rawLocation, locationIndex) => {
    const location = record(rawLocation)
    const zeroBasedPage = number(location?.page_index ?? location?.pageIndex ?? pageIndices[locationIndex])
    return zeroBasedPage === null ? [] : [Math.max(1, Math.trunc(zeroBasedPage) + 1)]
  })
}

interface K1SegmentCandidate {
  index: number
  segment: JsonRecord
  status: string
  headerPages: number[]
  hasHeader: boolean
}

interface K1SegmentSelection {
  segment: JsonRecord
  selectedPage: number | null
  issues: K1ExtractionDraftIssue[]
}

const locateScheduleK1HeaderPages = (standardOutput: unknown): { pages: number[]; detected: boolean } => {
  const root = record(standardOutput)
  const document = record(root?.document ?? root?.Document)
  const elements = array(document?.elements ?? document?.Elements ?? root?.elements ?? root?.Elements)
  const pageText = new Map<number, string[]>()
  const unpagedText: string[] = []

  const documentRepresentation = record(document?.representation)
  const completeDocumentText = string(documentRepresentation?.text ?? document?.text)
  if (completeDocumentText) unpagedText.push(completeDocumentText)

  array(document?.pages ?? document?.Pages ?? root?.pages ?? root?.Pages).forEach((rawPage) => {
    const page = record(rawPage)
    if (!page) return
    const pageIndex = number(page.page_index ?? page.pageIndex)
    const representation = record(page.representation)
    const text = string(representation?.text ?? page.text)
    if (pageIndex === null || !text) return
    const pageNumber = Math.max(1, Math.trunc(pageIndex) + 1)
    pageText.set(pageNumber, [...(pageText.get(pageNumber) ?? []), text])
  })

  elements.forEach((rawElement) => {
    const element = record(rawElement)
    if (!element) return
    const text = elementText(element)
    if (!text) return
    const pages = elementPages(element)
    if (pages.length === 0) {
      unpagedText.push(text)
      return
    }
    new Set(pages).forEach((page) => {
      pageText.set(page, [...(pageText.get(page) ?? []), text])
    })
  })

  const pages = [...pageText.entries()]
    .filter(([, parts]) => containsScheduleK1Form1065Header(parts.join(' ')))
    .map(([page]) => page)
    .sort((left, right) => left - right)
  return {
    pages,
    detected: pages.length > 0 || containsScheduleK1Form1065Header(unpagedText.join(' ')),
  }
}

const selectK1Segment = (root: JsonRecord): K1SegmentSelection => {
  const segments = array(root.outputSegments ?? root.output_segments)
    .map(record)
    .filter((segment): segment is JsonRecord => segment !== null)
  if (segments.length === 0) return { segment: root, selectedPage: null, issues: [] }

  const candidates: K1SegmentCandidate[] = segments.map((segment, index) => {
    const header = locateScheduleK1HeaderPages(segment.standardOutput ?? segment.standard_output)
    return {
      index,
      segment,
      status: string(segment.customOutputStatus ?? segment.custom_output_status) ?? 'UNKNOWN',
      headerPages: header.pages,
      hasHeader: header.detected,
    }
  })
  const titleMatches = candidates.filter((candidate) => candidate.status === 'MATCH' && candidate.hasHeader)
  const matches = candidates.filter((candidate) => candidate.status === 'MATCH')
  const titled = candidates.filter((candidate) => candidate.hasHeader)
  const eligible = titleMatches.length > 0
    ? titleMatches
    : matches.length > 0
      ? matches
      : titled.length > 0
        ? titled
        : [candidates[0]]
  const selected = eligible[0]
  const headerOccurrenceCount = eligible.reduce(
    (count, candidate) => count + Math.max(1, candidate.headerPages.length),
    0,
  )
  const multipleK1s = eligible.length > 1 || headerOccurrenceCount > 1
  const issues: K1ExtractionDraftIssue[] = multipleK1s ? [{
    code: 'MULTIPLE_K1_PACKAGE',
    severity: 'HIGH',
    message: 'The PDF appears to contain more than one Schedule K-1 (Form 1065).',
    details: {
      matchingSegments: eligible.map((candidate) => candidate.index),
      detectedPages: eligible.flatMap((candidate) => candidate.headerPages),
    },
  }] : []
  return {
    segment: selected.segment,
    selectedPage: selected.headerPages[0] ?? null,
    issues,
  }
}

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
  const elements = array(document?.elements ?? document?.Elements ?? root?.elements ?? root?.Elements)
  const evidence: K1ExtractionEvidenceReference[] = []
  const byProviderId = new Map<string, K1ExtractionSourceLocation[]>()

  elements.forEach((rawElement, elementIndex) => {
    const element = record(rawElement)
    if (!element) return
    const providerId = string(element.id ?? element.element_id) ?? `element-${elementIndex + 1}`
    const locations = array(element.locations ?? element.location)
    const pageIndices = array(element.page_indices ?? element.pageIndices)
    const sourceText = elementText(element)
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

const providerCanonicalPath = (field: JsonRecord): string | null =>
  string(field.canonical_path ?? field.canonicalPath ?? field.name ?? field.field_name)

const providerRawValue = (field: JsonRecord): unknown =>
  field.value ?? field.raw_value ?? field.rawValue ?? null

const distinctJsonValues = (values: unknown[]): unknown[] => {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = JSON.stringify(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Older BDA blueprints modeled the one Item J checkbox as separate sale and
 * exchange fields. Accept that output during a rolling AWS deployment, but
 * expose and persist the printed form's single sale-or-exchange checkbox.
 */
const coalesceLegacyItemJDecreaseFields = (fields: JsonRecord[]): JsonRecord[] => {
  const salePath = 'official.part_ii_j_decrease_sale'
  const exchangePath = 'official.part_ii_j_decrease_exchange'
  const candidates = fields.filter((field) => {
    const path = providerCanonicalPath(field)
    return path === salePath || path === exchangePath
  })
  if (!candidates.some((field) => providerCanonicalPath(field) === exchangePath)) return fields

  const representative = candidates.find((field) => providerCanonicalPath(field) === salePath) ?? candidates[0]
  const normalized = candidates.map((field) =>
    normalizeK1ExtractedValue(salePath, 'BOOLEAN', providerRawValue(field)).value,
  )
  const combinedValue = normalized.some((value) => value === true)
    ? true
    : normalized.some((value) => value === false)
      ? false
      : providerRawValue(representative)
  const confidences = candidates
    .map((field) => number(field.confidence ?? field.confidence_score))
    .filter((value): value is number => value !== null)
  const combined: JsonRecord = {
    ...representative,
    canonical_path: salePath,
    value_kind: 'BOOLEAN',
    value: combinedValue,
    confidence: confidences.length > 0 ? Math.min(...confidences) : null,
    evidence_ids: distinctJsonValues(candidates.flatMap((field) => array(field.evidence_ids ?? field.evidenceIds))),
    source_locations: distinctJsonValues(candidates.flatMap((field) => array(field.source_locations ?? field.sourceLocations))),
  }

  let inserted = false
  return fields.flatMap((field) => {
    const path = providerCanonicalPath(field)
    if (path !== salePath && path !== exchangePath) return [field]
    if (inserted) return []
    inserted = true
    return [combined]
  })
}

interface NormalizedCodeRow {
  code: string
  description: string
  amount: string | null
}

interface StatementCodeRow {
  rawValue: { code: string; description: string; amount: string }
  sourceLocations: K1ExtractionSourceLocation[]
  providerId: string
}

const normalizedCodeRow = (value: unknown): NormalizedCodeRow | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as JsonRecord
  if (typeof row.code !== 'string' || typeof row.description !== 'string') return null
  if (row.amount !== null && typeof row.amount !== 'string') return null
  return { code: row.code, description: row.description, amount: row.amount as string | null }
}

const normalizedWords = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const baseCode = (value: string): string => value.trim().toUpperCase().replace(/\*+$/, '')

/**
 * Federal tax packages commonly print `13ZZ* STMT` on the face of the K-1 and
 * put the actual deductions in a later "Federal Statements" table. BDA's
 * standard output retains that table even when the custom blueprint returns
 * only the blank STMT marker. Read only the table explicitly headed as the
 * Schedule K-1 Line 13 statement; do not treat generic worksheets or code
 * legends as additional K-1 values.
 */
const line13StatementRows = (
  standardOutput: unknown,
  byProviderId: Map<string, K1ExtractionSourceLocation[]>,
): StatementCodeRow[] => {
  const root = record(standardOutput)
  const document = record(root?.document ?? root?.Document)
  const elements = array(document?.elements ?? document?.Elements ?? root?.elements ?? root?.Elements)
    .map(record)
    .filter((element): element is JsonRecord => element !== null)
  const rows: StatementCodeRow[] = []

  elements.forEach((heading, headingIndex) => {
    const headingText = elementText(heading)?.trim() ?? ''
    if (!/^schedule k-?1,\s*line 13\s*-\s*other deductions$/i.test(headingText)) return
    const headingPages = elementPages(heading)
    const headingPage = headingPages[0]
    const headingOrder = number(heading.reading_order ?? heading.readingOrder)
    if (headingPage === undefined || headingOrder === null) return

    const table = elements.slice(headingIndex + 1).find((candidate) => {
      const candidatePage = elementPages(candidate)[0]
      const candidateOrder = number(candidate.reading_order ?? candidate.readingOrder)
      return candidatePage === headingPage
        && candidateOrder !== null
        && candidateOrder > headingOrder
        && string(candidate.type)?.toUpperCase() === 'TABLE'
    })
    if (!table) return
    const providerId = string(table.id ?? table.element_id) ?? `line-13-statement-page-${headingPage}`
    const sourceLocations = byProviderId.get(providerId) ?? []
    const tableText = elementText(table) ?? ''

    tableText.split(/\r?\n/).forEach((line) => {
      const columns = line.split('\t').map((column) => column.trim())
      if (columns.length < 3 || /^code$/i.test(columns[0])) return
      const code = baseCode(columns[0])
      const description = columns.slice(1, -1).join(' ').trim()
      const amount = columns.at(-1)!.replace(/^\$\s*/, '').trim()
      if (!code || !description || !amount) return
      const normalized = normalizeK1ExtractedValue(
        'official.box_13_entries',
        'CODE_ROW',
        { code, description, amount },
      )
      const normalizedRow = normalizedCodeRow(normalized.value)
      if (normalized.issue || normalizedRow?.amount === null) return
      rows.push({ rawValue: { code, description, amount }, sourceLocations, providerId })
    })
  })

  return rows
}

const supplementLine13Statements = (
  values: K1ExtractedValue[],
  standardOutput: unknown,
  byProviderId: Map<string, K1ExtractionSourceLocation[]>,
): K1ExtractedValue[] => {
  const placeholders = values.filter((value) => {
    if (value.canonicalPath !== 'official.box_13_entries') return false
    const row = normalizedCodeRow(value.normalizedValue)
    return Boolean(row && row.amount === null && baseCode(row.code) && /\b(?:stmt|statement)\b/i.test(row.description))
  })
  const placeholderCodes = new Set(placeholders.flatMap((value) => {
    const row = normalizedCodeRow(value.normalizedValue)
    return row ? [baseCode(row.code)] : []
  }))
  if (placeholderCodes.size === 0) return values

  const existingRows = new Set(values.flatMap((value) => {
    if (value.canonicalPath !== 'official.box_13_entries') return []
    const row = normalizedCodeRow(value.normalizedValue)
    return row && row.amount !== null
      ? [`${baseCode(row.code)}|${normalizedWords(row.description)}|${row.amount}`]
      : []
  }))
  const additions = line13StatementRows(standardOutput, byProviderId).flatMap((statement, index) => {
    const normalization = normalizeK1ExtractedValue('official.box_13_entries', 'CODE_ROW', statement.rawValue)
    const row = normalizedCodeRow(normalization.value)
    if (!row || row.amount === null || !placeholderCodes.has(baseCode(row.code))) return []
    const key = `${baseCode(row.code)}|${normalizedWords(row.description)}|${row.amount}`
    if (existingRows.has(key)) return []
    existingRows.add(key)
    return [{
      occurrenceId: deterministicUuid([
        'federal-statement', 'official.box_13_entries', statement.providerId, index, statement.rawValue,
      ]),
      canonicalPath: 'official.box_13_entries',
      kind: 'CODE_ROW' as const,
      rawValue: statement.rawValue,
      normalizedValue: normalization.value,
      confidence: null,
      sourceLocations: statement.sourceLocations,
      destination: classifyK1CanonicalPath('official.box_13_entries'),
      mappingRuleVersion: K1_MAPPING_RULE_VERSION,
    }]
  })
  if (additions.length === 0) return values

  const resolvedCodes = new Set(additions.flatMap((value) => {
    const row = normalizedCodeRow(value.normalizedValue)
    return row ? [baseCode(row.code)] : []
  }))
  const withoutResolvedPlaceholders = values.filter((value) => {
    if (value.canonicalPath !== 'official.box_13_entries') return true
    const row = normalizedCodeRow(value.normalizedValue)
    return !(row && row.amount === null
      && resolvedCodes.has(baseCode(row.code))
      && /\b(?:stmt|statement)\b/i.test(row.description))
  })
  const finalLine13Index = withoutResolvedPlaceholders.reduce(
    (last, value, index) => value.canonicalPath === 'official.box_13_entries' ? index : last,
    -1,
  )
  return finalLine13Index < 0
    ? [...withoutResolvedPlaceholders, ...additions]
    : [
        ...withoutResolvedPlaceholders.slice(0, finalLine13Index + 1),
        ...additions,
        ...withoutResolvedPlaceholders.slice(finalLine13Index + 1),
      ]
}

const LINE_17_PRINTED_TAXONOMY = new Map([
  ['A', 'post 1986 depreciation adjustment'],
  ['B', 'adjusted gain or loss'],
  ['C', 'depletion other than oil gas'],
  ['D', 'oil gas geothermal gross income'],
  ['E', 'oil gas geothermal deductions'],
  ['F', 'other amt items'],
])

/**
 * BDA occasionally reads the small printed code legends beside blank Part III
 * cells as populated rows. It can also let the adjacent Line 19 amount bleed
 * into Line 20. Preserve the provider raw value on retained occurrences while
 * exposing only rows that correspond to a visible K-1 entry.
 */
const sanitizePartThreeValues = (values: K1ExtractedValue[]): K1ExtractedValue[] => {
  let sanitized = [...values]
  const line17 = sanitized.filter((value) => value.canonicalPath === 'official.box_17_entries')
  const line17Placeholders = line17.filter((value) => {
    const row = normalizedCodeRow(value.normalizedValue)
    const printed = row ? LINE_17_PRINTED_TAXONOMY.get(row.code) : undefined
    return Boolean(row && row.amount === null && printed
      && normalizedWords(row.description) === printed
      && value.sourceLocations.length === 0)
  })
  if (line17.length >= 2 && line17Placeholders.length === line17.length) {
    const representative = line17[0]
    sanitized = sanitized.flatMap((value) => {
      if (value.canonicalPath !== 'official.box_17_entries') return [value]
      if (value.occurrenceId !== representative.occurrenceId) return []
      return [{
        ...value,
        normalizedValue: { code: '', description: 'Alternative Minimum Tax (AMT)', amount: null },
      }]
    })
  }

  const line19Rows = sanitized
    .filter((value) => value.canonicalPath === 'official.box_19_entries')
    .map((value) => normalizedCodeRow(value.normalizedValue))
    .filter((value): value is NormalizedCodeRow => value !== null)
  const line19Amounts = new Set(line19Rows
    .filter((row) => row.code && row.amount !== null)
    .map((row) => row.amount!))
  if (line19Amounts.size > 0) {
    sanitized = sanitized.filter((value) => value.canonicalPath !== 'calculation.box_19_distributions')
  }

  const borrowedLine20 = sanitized.filter((value) => {
    if (value.canonicalPath !== 'official.box_20_entries') return false
    const row = normalizedCodeRow(value.normalizedValue)
    return Boolean(row && row.code === 'A' && row.amount !== null
      && line19Amounts.has(row.amount)
      && /distribution|cash.*marketable/i.test(row.description))
  })
  const uncodedLine20 = sanitized.filter((value) => {
    if (value.canonicalPath !== 'official.box_20_entries') return false
    const row = normalizedCodeRow(value.normalizedValue)
    return Boolean(row && !row.code && row.amount !== null
      && normalizedWords(row.description) === 'other information')
  })
  if (borrowedLine20.length > 0) {
    const borrowedIds = new Set(borrowedLine20.map((value) => value.occurrenceId))
    sanitized = sanitized.filter((value) => !borrowedIds.has(value.occurrenceId))

    // Some BDA responses omit the visible A from the legitimate Line 20 row.
    // Restore it only when no independently extracted numeric 20A row remains.
    const hasCodedLine20A = sanitized.some((value) => {
      if (value.canonicalPath !== 'official.box_20_entries') return false
      const row = normalizedCodeRow(value.normalizedValue)
      return Boolean(row && row.code === 'A' && row.amount !== null)
    })
    if (!hasCodedLine20A && uncodedLine20.length === 1) {
      const uncodedId = uncodedLine20[0].occurrenceId
      sanitized = sanitized.map((value) => value.occurrenceId === uncodedId
        ? {
            ...value,
            normalizedValue: {
              ...normalizedCodeRow(value.normalizedValue)!,
              code: 'A',
            },
          }
        : value)
    }
  }

  return sanitized
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
  const selection = selectK1Segment(root)
  const { segment, selectedPage } = selection
  const status = string(segment.customOutputStatus ?? segment.custom_output_status) ?? 'UNKNOWN'
  const customOutput = record(segment.customOutput ?? segment.custom_output)
  const inferenceResult = customOutput?.inference_result ?? customOutput?.inferenceResult ?? segment.inference_result
  const explainability = customOutput?.explainability_info ?? customOutput?.explainabilityInfo
  const parsedEvidence = parseStandardEvidence(segment.standardOutput ?? segment.standard_output)
  const evidence = selectedPage === null
    ? parsedEvidence.evidence
    : parsedEvidence.evidence.filter((reference) => reference.page === selectedPage)
  const { byProviderId } = parsedEvidence
  const validationIssues = [...statusIssues(status), ...selection.issues]
  const values: K1ExtractedValue[] = []

  coalesceLegacyItemJDecreaseFields(extractProviderFields(inferenceResult, explainability)).forEach((field, fieldIndex) => {
    const canonicalPath = string(field.canonical_path ?? field.canonicalPath ?? field.name ?? field.field_name)
      ?? `provider.unnamed_field_${fieldIndex + 1}`
    const rawValue = field.value ?? field.raw_value ?? field.rawValue ?? null
    const kind = inferKind(field.value_kind ?? field.kind ?? field.type, canonicalPath, rawValue)
    const repeatedValues = kind === 'CODE_ROW' && Array.isArray(rawValue) ? rawValue : [rawValue]
    const evidenceIds = array(field.evidence_ids ?? field.evidenceIds).filter((id): id is string => typeof id === 'string')
    const sourceLocations = evidenceIds.flatMap((id) => byProviderId.get(id) ?? [])
    const directLocations = parseDirectLocations(field)
    const allLocations = sourceLocations.length > 0 ? sourceLocations : directLocations
    const locations = selectedPage === null
      ? allLocations
      : allLocations.filter((location) => location.page === selectedPage)
    if (selectedPage !== null && allLocations.length > 0 && locations.length === 0) return
    const destination = classifyK1CanonicalPath(canonicalPath)

    repeatedValues.forEach((occurrenceRawValue, occurrenceIndex) => {
      const occurrenceId = deterministicUuid([canonicalPath, fieldIndex, occurrenceIndex, occurrenceRawValue, evidenceIds])
      const normalization = normalizeK1ExtractedValue(canonicalPath, kind, occurrenceRawValue)
      // Section L prints accounting parentheses even when the cell contains no
      // amount. Treat that punctuation-only cell as absent instead of creating
      // a blank withdrawals/distributions field that a reviewer must correct.
      if (canonicalPath === 'calculation.section_l_withdrawals_distributions'
        && normalization.value === null
        && (!normalization.issue || normalization.issue.code === 'BLANK_EXTRACTED_FIELD')) return
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

  const statementAwareValues = supplementLine13Statements(
    values,
    segment.standardOutput ?? segment.standard_output,
    byProviderId,
  )
  const sanitizedValues = sanitizePartThreeValues(statementAwareValues)
  validationIssues.push(...validateK1DraftRelationships(sanitizedValues))
  const explicitRevisionYear = number(
    segment.revisionYear ?? segment.revision_year ?? root.revisionYear ?? root.revision_year,
  )
  const extractedTaxYear = sanitizedValues.find((value) => value.canonicalPath === 'match.tax_year')?.normalizedValue
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
    values: sanitizedValues,
    evidence,
    validationIssues,
  }
}
