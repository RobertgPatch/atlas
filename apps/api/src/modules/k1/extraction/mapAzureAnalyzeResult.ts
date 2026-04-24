import type { ExtractFieldValue, ExtractIssue, ExtractResult } from './K1Extractor.js'
import { azureFieldMap } from './azureFieldMap.js'

// ---------------------------------------------------------------------------
// Types — minimal subset of the Azure DI AnalyzeResult we need for mapping
// ---------------------------------------------------------------------------

interface DocumentField {
  type?: string
  valueString?: string
  valueNumber?: number
  valueInteger?: number
  valueCurrency?: { amount: number; currencyCode?: string }
  valueDate?: string
  valueBoolean?: boolean
  valueObject?: Record<string, DocumentField>
  content?: string
  confidence?: number
  boundingRegions?: Array<{ pageNumber: number; polygon: number[] }>
}

export interface AnalyzeResult {
  documents?: Array<{
    docType?: string
    fields?: Record<string, DocumentField>
  }>
}

// ---------------------------------------------------------------------------
// Dotted-path resolver (handles nested valueObject nodes)
// ---------------------------------------------------------------------------

function resolveField(
  fields: Record<string, DocumentField>,
  dotPath: string,
): DocumentField | undefined {
  const parts = dotPath.split('.')
  let node: DocumentField | undefined = fields[parts[0]]
  for (let i = 1; i < parts.length; i++) {
    if (!node) return undefined
    node = node.valueObject?.[parts[i]]
  }
  return node
}

// ---------------------------------------------------------------------------
// Value projection helpers
// ---------------------------------------------------------------------------

function projectValue(field: DocumentField, kind: string): string | null {
  switch (kind) {
    case 'string':
      return field.valueString ?? field.content ?? null
    case 'number':
      return field.valueNumber != null ? String(field.valueNumber) : null
    case 'currency': {
      const amount = field.valueCurrency?.amount
      return amount != null ? Number(amount).toFixed(2) : null
    }
    case 'percentage': {
      const pct = field.valueNumber
      return pct != null ? Number(pct).toFixed(6) : null
    }
    case 'date':
      return field.valueDate ?? null
    case 'boolean':
      return field.valueBoolean != null ? String(field.valueBoolean) : null
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Polygon → bbox conversion  (inches × 72 = PDF points)
// polygon: [x1,y1, x2,y2, x3,y3, x4,y4]  (clockwise from top-left)
// ---------------------------------------------------------------------------

const INCH_TO_PT = 72

function polygonToBbox(
  polygon: number[],
): [number, number, number, number] | null {
  if (!polygon || polygon.length < 4) return null
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < polygon.length; i += 2) {
    xs.push(polygon[i] * INCH_TO_PT)
    ys.push(polygon[i + 1] * INCH_TO_PT)
  }
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(...xs) - minX
  const h = Math.max(...ys) - minY
  // If the polygon is degenerate (zero area), return null rather than crashing
  if (w <= 0 || h <= 0) return null
  return [minX, minY, w, h]
}

// ---------------------------------------------------------------------------
// Main mapping function (pure — no side effects, no network calls)
// ---------------------------------------------------------------------------

export function mapAzureAnalyzeResult(
  result: AnalyzeResult,
  ctx: { k1DocumentId: string },
): ExtractResult {
  const doc = result.documents?.[0]
  if (!doc?.fields) {
    return {
      outcome: 'FAILURE',
      errorCode: 'PARSE_SCHEMA_MISMATCH',
      errorMessage: 'Azure DI response contained no document fields.',
    }
  }

  const fields = doc.fields
  const fieldValues: ExtractFieldValue[] = []
  const issues: ExtractIssue[] = []
  const seenNames = new Set<string>()

  for (const entry of azureFieldMap) {
    // Uniqueness invariant
    if (seenNames.has(entry.canonicalName)) {
      throw new Error(`Duplicate azureFieldMap canonicalName: ${entry.canonicalName}`)
    }
    seenNames.add(entry.canonicalName)

    const azureField = resolveField(fields, entry.azurePath)
    const rawValue = azureField ? projectValue(azureField, entry.valueKind) : null
    const confidenceScore = azureField?.confidence ?? null

    // Validate confidence range
    if (confidenceScore != null && (confidenceScore < 0 || confidenceScore > 1)) {
      throw new Error(
        `Azure DI returned out-of-range confidence ${confidenceScore} for field ${entry.canonicalName}`,
      )
    }

    // Source location
    let sourceLocation: ExtractFieldValue['sourceLocation'] = null
    const regions = azureField?.boundingRegions
    if (regions && regions.length > 0) {
      const bbox = polygonToBbox(regions[0].polygon)
      if (bbox) {
        sourceLocation = { page: regions[0].pageNumber, bbox }
      }
    }

    // Section invariant
    const validSections = ['entityMapping', 'partnershipMapping', 'core']
    if (!validSections.includes(entry.section)) {
      throw new Error(`Invalid section "${entry.section}" for field ${entry.canonicalName}`)
    }

    fieldValues.push({
      fieldName: entry.canonicalName,
      label: entry.label,
      section: entry.section,
      required: entry.required,
      rawValue,
      confidenceScore: confidenceScore ?? 0,
      sourceLocation,
    })

    // Issue: missing required field
    if (entry.required && rawValue === null) {
      issues.push({
        issueType: 'MISSING_FIELD',
        severity: 'MEDIUM',
        message: `Required field "${entry.label}" was not extracted from the PDF.`,
      })
    }

    // Issue: low-confidence field (separate from missing; rawValue retained)
    if (confidenceScore !== null && confidenceScore < 0.5) {
      issues.push({
        issueType: 'LOW_CONFIDENCE',
        severity: 'LOW',
        message: `Field "${entry.label}" extracted with low confidence (score = ${confidenceScore.toFixed(2)}).`,
      })
    }
  }

  const hasRequiredMissing = fieldValues.some((fv) => fv.required && fv.rawValue === null)
  const nextStatus =
    issues.length > 0 || hasRequiredMissing ? 'NEEDS_REVIEW' : 'READY_FOR_APPROVAL'

  return {
    outcome: 'SUCCESS',
    nextStatus,
    issues,
    fieldValues,
  }
}
