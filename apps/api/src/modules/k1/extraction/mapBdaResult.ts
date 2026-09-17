import { K1_STATEMENT_BOXES, k1CodeDescription } from './k1CodeReference.js'
import { createHash } from 'node:crypto'
import { moneyToCents } from '../../k1-tracker/k1-tracker.calculation.js'

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
  isK1StatementReference,
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
  if (/\b(?:this list identifies the codes|boxes and codes|page 2)\b/.test(normalized)
    && !/\binformation about the partnership\b/.test(normalized)) return false

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

/** Rejoin standard OCR from following logical documents in the same upload.
 * Custom output stays bound to the selected federal K-1. Never guess page
 * offsets or merge another K-1; unresolved references remain review issues.
 */
const packetStatementOutput = (root: JsonRecord, selection: K1SegmentSelection): unknown => {
  const selectedOutput = selection.segment.standardOutput ?? selection.segment.standard_output
  if (selection.issues.length) return selectedOutput
  const segments = array(root.outputSegments ?? root.output_segments).map(record)
  const selectedIndex = segments.indexOf(selection.segment)
  if (selectedIndex < 0) return selectedOutput
  const elementsFor = (output: unknown): JsonRecord[] => {
    const data = record(output)
    const doc = record(data?.document ?? data?.Document)
    return array(doc?.elements ?? doc?.Elements ?? data?.elements ?? data?.Elements)
      .map(record).filter((element): element is JsonRecord => element !== null)
  }
  const elements = [...elementsFor(selectedOutput)]
  let lastPage = Math.max(0, ...elements.flatMap(elementPages))
  let added = false
  for (let index = selectedIndex + 1; index < segments.length; index += 1) {
    const output = segments[index]?.standardOutput ?? segments[index]?.standard_output
    if (locateScheduleK1HeaderPages(output).detected) break
    const following = elementsFor(output)
    const pages = following.flatMap(elementPages)
    if (!pages.length || Math.min(...pages) <= lastPage) break
    for (const element of following) {
      // Provider element IDs can restart in each logical document.
      elements.push({ ...element, id: `segment-${index}:${string(element.id ?? element.element_id) ?? elements.length}` })
    }
    lastPage = Math.max(...pages)
    added = true
  }
  return added ? { elements } : selectedOutput
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
  isCodeTotal?: boolean
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

const statementReference = (value: K1ExtractedValue): boolean => {
  const row = normalizedCodeRow(value.normalizedValue)
  return Boolean(row && (row.code.includes('*') || isK1StatementReference(row.code)
    || (row.amount === null && (/\b(?:stmt|statement|attached|attachment)\b/i.test(row.description)
      || isK1StatementReference(value.rawValue)))))
}

const referenceCode = (code: string): string => isK1StatementReference(code) ? '' : baseCode(code)

// BDA can assign a paragraph below a table an earlier reading_order than the
// table itself. Physical page position keeps end-of-page code headings attached
// to their continuation, with provider order as the fallback for unlocated text.
const statementElementOrder = (left: JsonRecord, right: JsonRecord): number => {
  const pageOrder = (elementPages(left)[0] ?? 0) - (elementPages(right)[0] ?? 0)
  if (pageOrder) return pageOrder
  const top = (element: JsonRecord): number | null => {
    const location = record(array(element.locations ?? element.location)[0])
    return toBBox(location?.bounding_box ?? location?.boundingBox ?? location?.bbox)?.[1] ?? null
  }
  const leftTop = top(left)
  const rightTop = top(right)
  // Table boxes include padding that can overlap the heading above them.
  if (leftTop !== null && rightTop !== null && Math.abs(leftTop - rightTop) > 0.01) return leftTop - rightTop
  return (number(left.reading_order ?? left.readingOrder) ?? 0)
    - (number(right.reading_order ?? right.readingOrder) ?? 0)
}

/**
 * Federal tax packages commonly print `13ZZ* STMT` on the face of the K-1 and
 * put the actual deductions in a later "Federal Statements" table. BDA's
 * standard output retains that table even when the custom blueprint returns
 * only the blank STMT marker. Read only tables explicitly headed for the
 * matching Schedule K-1 box; do not treat generic worksheets or code
 * legends as additional K-1 values.
 */
const codedStatementRows = (
  box: number,
  year: number | null,
  standardOutput: unknown,
  byProviderId: Map<string, K1ExtractionSourceLocation[]>,
  issues?: K1ExtractionDraftIssue[],
): StatementCodeRow[] => {
  const root = record(standardOutput)
  const document = record(root?.document ?? root?.Document)
  const elements = array(document?.elements ?? document?.Elements ?? root?.elements ?? root?.Elements)
    .map(record)
    .filter((element): element is JsonRecord => element !== null)
    .sort(statementElementOrder)
  const rows: StatementCodeRow[] = []
  let activeBox: number | null = null
  let federal = false
  let group: { code: string; description: string; details: StatementCodeRow[]; total?: StatementCodeRow } | null = null
  const flush = () => {
    if (!group) return
    if (group.total && group.details.length) {
      const detailTotal = group.details.reduce((total, row) => total + (moneyToCents(row.rawValue.amount) ?? 0n), 0n)
      if (moneyToCents(group.total.rawValue.amount) !== detailTotal) issues?.push({
        code: 'K1_STATEMENT_TOTAL_MISMATCH', severity: 'HIGH',
        canonicalPath: `official.box_${box}_entries`,
        message: `Box ${box} code ${group.code} statement details do not match the printed total. Review the supporting pages.`,
      })
    }
    // The printed code total is the review value. Components remain in the
    // source evidence and must not become additional amounts for that code.
    rows.push(...(group.total ? [{ ...group.total, isCodeTotal: true }] : group.details))
    group = null
  }
  const pageText = new Map<number, string>()
  for (const element of elements) for (const page of elementPages(element)) {
    pageText.set(page, `${pageText.get(page) ?? ''}\n${elementText(element) ?? ''}`)
  }
  const mainPage = locateScheduleK1HeaderPages(standardOutput).pages[0]
  const identifierPatterns = [/\b\d{2}-\d{7}\b/g, /(?:\*\*|\d{2})-\*{3}\d{4}\b/g, /\b\d{3}-\d{2}-\d{4}\b/g]
  const mainText = pageText.get(mainPage) ?? ''
  const excludedPages = new Set([...pageText].filter(([, text]) => {
    const statedYear = /\b(?:tax year|form 1065\)?)\s*[: -]?\s*((?:19|20)\d{2})\b/i.exec(text)?.[1]
    return /(?:state schedule|state k-?1|this list identifies the codes|boxes and codes|partner.s instructions for schedule)/i.test(text)
      || (year !== null && statedYear !== undefined && Number(statedYear) !== year)
      // Compare like-for-like identifiers only. OCR can omit a partner's
      // masked TIN on the face while still reading the partnership EIN.
      || identifierPatterns.some(pattern => {
        const mainIds = new Set(mainText.match(pattern) ?? [])
        return mainIds.size > 0 && (text.match(pattern) ?? []).some(id => !mainIds.has(id))
      })
  }).map(([page]) => page))
  let previousPage: number | null = null
  for (const element of elements) {
    const page = elementPages(element)[0]
    if (page === undefined) continue
    if (excludedPages.has(page) || (previousPage !== null && page > previousPage + 1)) {
      flush(); activeBox = null; federal = false
    }
    previousPage = page
    if (excludedPages.has(page)) continue
    const providerId = string(element.id ?? element.element_id) ?? `statement-page-${page}`
    const sourceLocations = byProviderId.get(providerId) ?? [{ page, textRef: providerId }]
    const makeRow = (code: string, description: string, amount: string): StatementCodeRow | null => {
      if (!description || k1CodeDescription(year, box, code) === 'Reserved for future use') return null
      const rawValue = { code, description, amount }
      const normalized = normalizeK1ExtractedValue(`official.box_${box}_entries`, 'CODE_ROW', rawValue)
      if (normalized.issue || normalizedCodeRow(normalized.value)?.amount == null) return null
      return { rawValue, sourceLocations, providerId }
    }
    for (const rawLine of (elementText(element) ?? '').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (/^(?:sch(?:edule)?\.?\s+k-?1\s+supporting schedules|federal statements)/i.test(line)) federal = true
      // A new form/worksheet is a boundary; code-group context may cross a
      // continuation page, but must not leak into a different form or Item L.
      if (/^(?:schedule k-?1\s*\(form|state\b)/i.test(line)) {
        flush(); activeBox = null; federal = false
      }
      if (/^item [a-z]\s*[-–]/i.test(line)) { flush(); activeBox = null }
      const heading = /^(schedule k-?1[, ]+)?\s*(?:line|box) (\d+[a-z]?)\s*[-:–]\s*.+$/i.exec(line)
      if (heading) {
        flush()
        if (heading[1]) federal = true
        activeBox = federal && heading[2] === String(box) ? box : null
        continue
      }
      if (activeBox !== box) continue
      // An explicit TOTAL BOX letter also resolves a continuation when OCR
      // missed the preceding code heading. Never assign it to the prior code.
      const printedTotal = /^TOTAL\s+BOX\s+([A-Z]{1,2})\s+(\(?[+-]?\$?\s*\d[\d,]*(?:\.\d+)?\)?)$/i.exec(line)
      if (printedTotal) {
        const code = printedTotal[1].toUpperCase()
        if (group && group.code !== code) flush()
        group ??= { code, description: k1CodeDescription(year, box, code) ?? `Box ${box}, code ${code}`, details: [] }
        group.total = makeRow(code, group.description, printedTotal[2]) ?? undefined
        flush()
        continue
      }
      const columns = line.split('\t').map(column => column.trim()).filter(Boolean)
      const tableCode = baseCode(columns[0] ?? '').replace(new RegExp(`^${box}\\s*`), '')
      if (columns.length >= 2 && /^[A-Z]{1,2}$/.test(tableCode)) {
        flush()
        const row = makeRow(tableCode, columns.slice(1, -1).join(' ') || k1CodeDescription(year, box, tableCode) || '', columns.at(-1)!)
        if (row) rows.push(row)
        continue
      }
      const codeHeading = /^([A-Z]{1,2})\s*[-–]\s*(.+)$/.exec(line)
      if (codeHeading) {
        flush()
        const withAmount = /^(.*?)\s+(\(?[+-]?\$?\s*\d[\d,]*(?:\.\d+)?\)?)$/.exec(codeHeading[2])
        group = { code: codeHeading[1], description: withAmount?.[1] ?? codeHeading[2], details: [] }
        if (withAmount) group.total = makeRow(group.code, group.description, withAmount[2]) ?? undefined
        continue
      }
      if (!group) continue
      const valueLine = /^(.*?)\s+(\(?[+-]?\$?\s*\d[\d,]*(?:\.\d+)?\)?)$/.exec(line)
        ?? /^(TOTAL BOX [A-Z]{1,2})\s+(\(?[+-]?\d[\d,]*(?:\.\d+)?\)?)$/.exec(line)
      if (!valueLine) continue
      const row = makeRow(group.code, valueLine[1], valueLine[2])
      if (!row) continue
      if (/^total\b/i.test(valueLine[1])) {
        group.total = { ...row, rawValue: { ...row.rawValue, description: group.description } }
      } else {
        group.details.push(row)
      }
    }
  }
  flush()

  return rows
}

/** Recover numeric face entries when custom output follows a statement but omits
 * a separate printed deduction. Only the selected federal form page is eligible;
 * code legends, state schedules, and statement totals must not be counted again.
 */
const supplementLine13FaceRows = (
  values: K1ExtractedValue[],
  standardOutput: unknown,
  byProviderId: Map<string, K1ExtractionSourceLocation[]>,
  selectedPage: number | null,
  issues: K1ExtractionDraftIssue[],
): K1ExtractedValue[] => {
  if (selectedPage === null) return values
  const root = record(standardOutput)
  const document = record(root?.document ?? root?.Document)
  const elements = array(document?.elements ?? document?.Elements ?? root?.elements ?? root?.Elements)
  const additions: K1ExtractedValue[] = []
  for (const rawElement of elements) {
    const table = record(rawElement)
    if (!table || string(table.type)?.toUpperCase() !== 'TABLE'
      || !elementPages(table).includes(selectedPage)) continue
    const providerId = string(table.id ?? table.element_id)
    if (!providerId) continue
    for (const [index, line] of (elementText(table) ?? '').split(/\r?\n/).entries()) {
      const columns = line.split('\t').map(column => column.trim())
      // BDA commonly puts "13 A" and "Other deductions 891" in adjacent cells.
      // Also accept a separate code cell, but never consume the right-hand boxes.
      const separateCode = columns[0] === '13' && /^[A-Z]{1,2}\*?$/i.test(columns[1] ?? '')
      const marker = separateCode ? `13 ${columns[1]}` : columns[0]
      const code = /^13\s*([A-Z]{1,2})\*?$/i.exec(marker)?.[1]?.toUpperCase()
      if (!code) continue
      const labelIndex = separateCode ? 2 : 1
      const label = columns[labelIndex] ?? ''
      const amountText = /^Other deductions\s+(.+)$/i.exec(label)?.[1]
        ?? (/^Other deductions$/i.test(label) && columns.slice(labelIndex + 2).every(column => !column)
          ? columns[labelIndex + 1] : undefined)
      if (!amountText || !/^\(?[+-]?\$?\s*\d[\d,]*(?:\.\d+)?\)?$/.test(amountText)) continue
      const rawValue = { code, description: 'Other deductions', amount: amountText }
      const normalized = normalizeK1ExtractedValue('official.box_13_entries', 'CODE_ROW', rawValue)
      const row = normalizedCodeRow(normalized.value)
      if (normalized.issue || !row || row.amount === null) continue
      const existing = [...values, ...additions].filter(value => {
        const candidate = normalizedCodeRow(value.normalizedValue)
        return value.canonicalPath === 'official.box_13_entries'
          && candidate !== null && candidate.amount !== null && baseCode(candidate.code) === code
      })
      if (existing.some(value => normalizedCodeRow(value.normalizedValue)?.amount === row.amount)) continue
      if (existing.length) {
        issues.push({
          code: 'CONFLICTING_LINE_13_AMOUNT', severity: 'HIGH',
          canonicalPath: 'official.box_13_entries', occurrenceId: existing[0].occurrenceId,
          message: `Line 13 code ${code} differs between the printed form and custom extraction. Verify the amount against the PDF.`,
        })
        continue
      }
      additions.push({
        occurrenceId: deterministicUuid(['federal-face', 'official.box_13_entries', providerId, index, rawValue]),
        canonicalPath: 'official.box_13_entries', kind: 'CODE_ROW', rawValue,
        normalizedValue: normalized.value, confidence: null,
        sourceLocations: (byProviderId.get(providerId) ?? []).filter(location => location.page === selectedPage),
        destination: classifyK1CanonicalPath('official.box_13_entries'),
        mappingRuleVersion: K1_MAPPING_RULE_VERSION,
      })
    }
  }
  const firstLine13 = values.findIndex(value => value.canonicalPath === 'official.box_13_entries')
  return firstLine13 < 0 ? [...values, ...additions]
    : [...values.slice(0, firstLine13), ...additions, ...values.slice(firstLine13)]
}

/** Read the two independent Part III columns. Subsequent letter/star rows
 * inherit their box only within that column, never from the neighboring box.
 * This also recovers a box-wide star omitted by an older custom blueprint.
 */
const supplementPrintedCodeRows = (
  values: K1ExtractedValue[],
  standardOutput: unknown,
  byProviderId: Map<string, K1ExtractionSourceLocation[]>,
  selectedPage: number | null,
  year: number | null,
): K1ExtractedValue[] => {
  if (selectedPage === null) return values
  const root = record(standardOutput)
  const doc = record(root?.document ?? root?.Document)
  const additions: K1ExtractedValue[] = []
  for (const rawElement of array(doc?.elements ?? doc?.Elements ?? root?.elements ?? root?.Elements)) {
    const table = record(rawElement)
    if (!table || string(table.type)?.toUpperCase() !== 'TABLE' || !elementPages(table).includes(selectedPage)) continue
    const providerId = string(table.id ?? table.element_id)
    if (!providerId) continue
    const activeBoxes = new Map<number, number | null>()
    for (const [lineIndex, line] of (elementText(table) ?? '').split(/\r?\n/).entries()) {
      const columns = line.split('\t').map(column => column.trim())
      for (let column = 0; column + 1 < columns.length; column += 2) {
        const marker = columns[column].toUpperCase()
        const heading = /^(\d{1,2})\s*([A-Z]{1,2}\*?|\*)?$/.exec(marker)
        if (heading) activeBoxes.set(column, K1_STATEMENT_BOXES.some(box => box === Number(heading[1])) ? Number(heading[1]) : null)
        const box = activeBoxes.get(column)
        const code = heading?.[2] ?? (/^(?:[A-Z]{1,2}\*?|\*)$/.test(marker) ? marker : '')
        if (!box || !code) continue
        const text = columns[column + 1]
        const amount = isK1StatementReference(text) ? text
          : box === 16 && code === 'A' ? text.replace(/^Foreign transactions\s*/i, '')
          : /(?:^|\s)(\(?[+-]?\$?\s*\d[\d,]*(?:\.\d+)?\)?)$/.exec(text)?.[1]
        if (amount === undefined || !amount.trim()) continue
        const canonicalPath = `official.box_${box}_entries`
        const rawValue = { code, description: isK1StatementReference(amount) ? 'See statement' : k1CodeDescription(year, box, baseCode(code)) ?? text.replace(amount, '').trim(), amount }
        const normalized = normalizeK1ExtractedValue(canonicalPath, 'CODE_ROW', rawValue)
        const row = normalizedCodeRow(normalized.value)
        if (normalized.issue || !row) continue
        const exists = [...values, ...additions].some(value => value.canonicalPath === canonicalPath
          && referenceCode(normalizedCodeRow(value.normalizedValue)?.code ?? '') === referenceCode(code)
          && (row.amount === null ? statementReference(value) : normalizedCodeRow(value.normalizedValue)?.amount != null))
        if (exists) continue
        additions.push({
          occurrenceId: deterministicUuid(['federal-code-row', canonicalPath, providerId, lineIndex, column, rawValue]),
          canonicalPath, kind: 'CODE_ROW', rawValue, normalizedValue: normalized.value, confidence: null,
          sourceLocations: (byProviderId.get(providerId) ?? []).filter(location => location.page === selectedPage),
          destination: classifyK1CanonicalPath(canonicalPath), mappingRuleVersion: K1_MAPPING_RULE_VERSION,
        })
      }
    }
  }
  return [...values, ...additions]
}

const supplementCodedStatements = (
  box: number,
  year: number | null,
  values: K1ExtractedValue[],
  standardOutput: unknown,
  byProviderId: Map<string, K1ExtractionSourceLocation[]>,
  issues: K1ExtractionDraftIssue[],
): K1ExtractedValue[] => {
  const placeholders = values.filter((value) => {
    if (value.canonicalPath !== `official.box_${box}_entries`) return false
    const row = normalizedCodeRow(value.normalizedValue)
    return Boolean(row && row.amount === null && statementReference(value))
  })
  const placeholderCodes = new Set(placeholders.flatMap((value) => {
    const row = normalizedCodeRow(value.normalizedValue)
    return row ? [referenceCode(row.code)] : []
  }))
  const statements = codedStatementRows(box, year, standardOutput, byProviderId, issues)
  if (statements.length === 0) return values
  // A numeric face entry can coexist with a box-wide star. Its supporting
  // components explain that amount; only the other codes are additional income.
  const coveredCodes = new Set<string>()
  const duplicateComponentIds = new Set<string>()
  const totalEvidence = new Map<string, K1ExtractionSourceLocation[]>()
  for (const code of new Set(statements.map(row => baseCode(row.rawValue.code)))) {
    if (placeholderCodes.size > 0 && !placeholderCodes.has('') && !placeholderCodes.has(code)) continue
    const existingValues = values.filter(value => value.canonicalPath === `official.box_${box}_entries`
      && baseCode(normalizedCodeRow(value.normalizedValue)?.code ?? '') === code
      && normalizedCodeRow(value.normalizedValue)?.amount != null)
    const existing = existingValues
      .map(value => normalizedCodeRow(value.normalizedValue))
      .filter(row => row?.amount != null && baseCode(row.code) === code)
    const statementRows = statements.filter(row => baseCode(row.rawValue.code) === code)
    const statementTotal = statementRows
      .reduce((total, row) => total + (moneyToCents(row.rawValue.amount) ?? 0n), 0n)
    const printedTotal = statementRows.find(row => row.isCodeTotal)
    if (printedTotal) {
      const amount = moneyToCents(printedTotal.rawValue.amount)
      const sameAmount = existingValues.find(value => moneyToCents(normalizedCodeRow(value.normalizedValue)!.amount) === amount)
      // Keep a correct face total once, or replace partial provider components
      // with the statement's explicit total. Never add the two together.
      existingValues.filter(value => value !== sameAmount).forEach(value => duplicateComponentIds.add(value.occurrenceId))
      if (sameAmount) {
        coveredCodes.add(code)
        totalEvidence.set(sameAmount.occurrenceId, printedTotal.sourceLocations)
      } else if (existingValues.length && existing.reduce((sum, row) => sum + (moneyToCents(row!.amount) ?? 0n), 0n) !== amount) {
        issues.push({ code: 'K1_CODE_TOTAL_MISMATCH', severity: 'HIGH', canonicalPath: `official.box_${box}_entries`,
          message: `Box ${box} code ${code}: the extracted face or component amounts differ from the printed statement total. The statement total is shown; verify it against the PDF.`,
        })
      }
      continue
    }
    if (existing.length && existing.reduce((total, row) => total + (moneyToCents(row!.amount) ?? 0n), 0n) === statementTotal) coveredCodes.add(code)
    const totalValue = existingValues.find(value => moneyToCents(normalizedCodeRow(value.normalizedValue)!.amount) === statementTotal)
    const otherValues = existingValues.filter(value => value !== totalValue)
    if (totalValue && otherValues.length && otherValues.reduce((total, value) => total + (moneyToCents(normalizedCodeRow(value.normalizedValue)!.amount) ?? 0n), 0n) === statementTotal) {
      coveredCodes.add(code)
      otherValues.forEach(value => duplicateComponentIds.add(value.occurrenceId))
    }
  }

  const existingRows = new Set(values.flatMap((value) => {
    if (duplicateComponentIds.has(value.occurrenceId)) return []
    if (value.canonicalPath !== `official.box_${box}_entries`) return []
    const row = normalizedCodeRow(value.normalizedValue)
    return row && row.amount !== null
      ? [`${baseCode(row.code)}|${normalizedWords(row.description)}|${row.amount}`]
      : []
  }))
  const resolvedCodes = new Set<string>()
  const additions = statements.flatMap((statement, index) => {
    const normalization = normalizeK1ExtractedValue(`official.box_${box}_entries`, 'CODE_ROW', statement.rawValue)
    const row = normalizedCodeRow(normalization.value)
    if (!row || row.amount === null || (placeholderCodes.size > 0 && !placeholderCodes.has('') && !placeholderCodes.has(baseCode(row.code)))) return []
    resolvedCodes.add(baseCode(row.code))
    if (coveredCodes.has(baseCode(row.code))) return []
    const key = `${baseCode(row.code)}|${normalizedWords(row.description)}|${row.amount}`
    if (existingRows.has(key)) return []
    existingRows.add(key)
    return [{
      occurrenceId: deterministicUuid([
        'federal-statement', `official.box_${box}_entries`, statement.providerId, index, statement.rawValue,
      ]),
      canonicalPath: `official.box_${box}_entries`,
      kind: 'CODE_ROW' as const,
      rawValue: statement.rawValue,
      normalizedValue: normalization.value,
      confidence: null,
      sourceLocations: statement.sourceLocations,
      destination: classifyK1CanonicalPath(`official.box_${box}_entries`),
      mappingRuleVersion: K1_MAPPING_RULE_VERSION,
    }]
  })
  if (resolvedCodes.size === 0) return values
  const withoutResolvedPlaceholders = values.filter((value) => {
    if (duplicateComponentIds.has(value.occurrenceId)) return false
    if (value.canonicalPath !== `official.box_${box}_entries`) return true
    const row = normalizedCodeRow(value.normalizedValue)
    return !(row && row.amount === null
      && (!referenceCode(row.code) || resolvedCodes.has(referenceCode(row.code)))
      && (/\b(?:stmt|statement|attached|attachment)\b/i.test(row.description) || row.code.includes('*') || isK1StatementReference(value.rawValue)))
  }).map(value => totalEvidence.has(value.occurrenceId) ? {
    ...value,
    sourceLocations: distinctJsonValues([...value.sourceLocations, ...totalEvidence.get(value.occurrenceId)!]) as K1ExtractionSourceLocation[],
  } : value)
  const finalLine13Index = withoutResolvedPlaceholders.reduce(
    (last, value, index) => value.canonicalPath === `official.box_${box}_entries` ? index : last,
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
  // Older blueprints also return a scalar Box 11 amount, often just 11A.
  // Once coded rows are available, application mapping derives their total.
  if (sanitized.some(value => value.canonicalPath === 'official.box_11_entries'
    && normalizedCodeRow(value.normalizedValue)?.amount != null)) {
    sanitized = sanitized.filter(value => value.canonicalPath !== 'calculation.box_11_other_income_loss')
  }
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
  const standardOutput = packetStatementOutput(root, selection)
  const status = string(segment.customOutputStatus ?? segment.custom_output_status) ?? 'UNKNOWN'
  const customOutput = record(segment.customOutput ?? segment.custom_output)
  const inferenceResult = customOutput?.inference_result ?? customOutput?.inferenceResult ?? segment.inference_result
  const explainability = customOutput?.explainability_info ?? customOutput?.explainabilityInfo
  const parsedEvidence = parseStandardEvidence(standardOutput)
  const evidence = parsedEvidence.evidence
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
    const statementBox = /^official\.box_(\d+)_entries$/.exec(canonicalPath)?.[1]
    const supportingPages = new Set(statementBox ? codedStatementRows(
      Number(statementBox), null, standardOutput, byProviderId,
    ).flatMap(row => row.sourceLocations.map(location => location.page)) : [])
    const locations = selectedPage === null
      ? allLocations
      : allLocations.filter((location) => location.page === selectedPage || supportingPages.has(location.page))
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

  const referenceYear = values.find(value => value.canonicalPath === 'match.tax_year')?.normalizedValue
  const year = typeof referenceYear === 'number' ? referenceYear : null
  const faceAwareValues = supplementPrintedCodeRows(supplementLine13FaceRows(
    values,
    standardOutput,
    byProviderId,
    selectedPage,
    validationIssues,
  ), standardOutput, byProviderId, selectedPage, year)
  const statementAwareValues = K1_STATEMENT_BOXES.reduce((current, box) => supplementCodedStatements(
    box, year, current,
    standardOutput, byProviderId, validationIssues,
  ), faceAwareValues)
  const resolvedValues = statementAwareValues.flatMap(value => {
    const row = normalizedCodeRow(value.normalizedValue)
    if (value.kind !== 'CODE_ROW' || !row) return [value]
    const code = referenceCode(row.code)
    if (statementReference(value) && (row.amount === null || !code)) {
      // Box 20 disclosures are optional for the application's federal reconciliation.
      // Retain available amounts, but do not require missing supporting disclosures.
      if (value.canonicalPath !== 'official.box_20_entries') {
        validationIssues.push({ code: 'UNRESOLVED_K1_STATEMENT', severity: 'HIGH',
          canonicalPath: value.canonicalPath,
          message: `Box ${/^official\.box_(\d+)_entries$/.exec(value.canonicalPath)?.[1] ?? ''}${code ? ` code ${code}` : ''}: the supporting statement values could not be fully resolved. Verify the matching statement before reconciliation.`,
          details: { code: code || null, sourceLocations: value.sourceLocations, rawReference: value.rawValue },
        })
      }
      // A reference is never an editable monetary input or a substitute zero.
      return []
    }
    return [{ ...value, normalizedValue: { ...row, code } }]
  })
  const sanitizedValues = sanitizePartThreeValues(resolvedValues)
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
    evidence: selectedPage === null ? evidence : evidence.filter(reference =>
      reference.page === selectedPage || sanitizedValues.some(value => value.sourceLocations.some(location => location.page === reference.page))),
    validationIssues,
  }
}
