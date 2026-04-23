import type { ExtractFieldValue, ExtractIssue, ExtractResult } from './K1Extractor.js'
import { azureFieldMap } from './azureFieldMap.js'

export interface OcrAnalyzeResult {
  content?: string
}

interface ParsedField {
  rawValue: string
  confidenceScore: number
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function nextLineAfter(lines: string[], matcher: RegExp): string | null {
  const index = lines.findIndex((line) => matcher.test(line))
  if (index === -1) return null
  for (let i = index + 1; i < lines.length; i++) {
    if (lines[i]) return lines[i]
  }
  return null
}

function captureWithPatterns(
  text: string,
  patterns: RegExp[],
  transform: (value: string) => string | null,
  confidenceScore: number,
): ParsedField | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    const rawValue = match?.[1] ? transform(match[1]) : null
    if (rawValue) {
      return { rawValue, confidenceScore }
    }
  }
  return null
}

function formatCurrency(value: string): string | null {
  const compact = value.replace(/\s+/g, '')
  const negative = compact.includes('(') && compact.includes(')')
  const numeric = compact.replace(/[,$()]/g, '')
  if (!numeric || Number.isNaN(Number(numeric))) return null
  const amount = Number(numeric) * (negative ? -1 : 1)
  return amount.toFixed(2)
}

function formatPercentage(value: string): string | null {
  const numeric = value.replace(/[%\s,]/g, '')
  if (!numeric || Number.isNaN(Number(numeric))) return null
  return Number(numeric).toFixed(6)
}

function buildFieldValues(
  parsed: Record<string, ParsedField>,
): { fieldValues: ExtractFieldValue[]; issues: ExtractIssue[] } {
  const fieldValues: ExtractFieldValue[] = []
  const issues: ExtractIssue[] = [
    {
      issueType: 'OCR_FALLBACK',
      severity: 'MEDIUM',
      message:
        'Azure returned OCR/layout output rather than a K-1 field schema. Review extracted values before approval.',
    },
  ]

  for (const entry of azureFieldMap) {
    const found = parsed[entry.canonicalName]
    fieldValues.push({
      fieldName: entry.canonicalName,
      label: entry.label,
      section: entry.section,
      required: entry.required,
      rawValue: found?.rawValue ?? null,
      confidenceScore: found?.confidenceScore ?? 0,
      sourceLocation: null,
    })

    if (entry.required && !found?.rawValue) {
      issues.push({
        issueType: 'MISSING_FIELD',
        severity: 'MEDIUM',
        message: `Required field "${entry.label}" was not extracted from the PDF.`,
      })
    }
  }

  return { fieldValues, issues }
}

function parseOcrFields(text: string): Record<string, ParsedField> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const flatText = normalizeWhitespace(text)
  const parsed: Record<string, ParsedField> = {}

  const partnershipName = nextLineAfter(
    lines,
    /Partnership's name, address, city, state, and ZIP code/i,
  )
  if (partnershipName) {
    parsed.partnership_name = { rawValue: partnershipName, confidenceScore: 0.86 }
  }

  const partnerName = nextLineAfter(
    lines,
    /Partner's name, address, city, state, and ZIP code/i,
  )
  if (partnerName) {
    parsed.partner_name = { rawValue: partnerName, confidenceScore: 0.8 }
  }

  const partnerEntityType = captureWithPatterns(
    flatText,
    [/What type of entity is this partner\?\s+([A-Z][A-Z0-9 &.,'()/-]{2,})/i],
    (value) => value.trim(),
    0.8,
  )
  if (partnerEntityType) parsed.partner_entity_type = partnerEntityType

  const simpleStringFields: Array<[string, RegExp[], number]> = [
    [
      'partnership_ein',
      [/Partnership's employer identification number\s+([0-9A-Z*]{2}-[0-9A-Z*]{4,})/i],
      0.9,
    ],
    [
      'partner_tin',
      [
        /Partner's identifying number\s+([0-9A-Z*]{2,}-?[0-9A-Z*]{2,})/i,
        /partner's:\s+TIN\s+([0-9A-Z*]{2,}-?[0-9A-Z*]{2,})/i,
      ],
      0.72,
    ],
    [
      'irs_center',
      [/IRS center where partnership filed return:\s+([A-Z0-9 -]{2,})/i],
      0.74,
    ],
    [
      'box_20_other_information',
      [/20\s+Other information\s+([A-Z0-9* ]{2,})/i],
      0.68,
    ],
  ]

  for (const [fieldName, patterns, confidenceScore] of simpleStringFields) {
    const captured = captureWithPatterns(flatText, patterns, (value) => value.trim(), confidenceScore)
    if (captured) parsed[fieldName] = captured
  }

  const percentFields: Array<[string, RegExp, number]> = [
    [
      'profit_share_ending',
      /Profit\s+Beginning\s+Ending\s+[0-9.]+\s*%\s+([0-9.]+)\s*%/i,
      0.88,
    ],
    [
      'loss_share_ending',
      /Loss\s+Beginning\s+Ending\s+[0-9.]+\s*%\s+([0-9.]+)\s*%/i,
      0.88,
    ],
    [
      'capital_share_ending',
      /Capital\s+Beginning\s+Ending\s+[0-9.]+\s*%\s+([0-9.]+)\s*%/i,
      0.88,
    ],
    [
      'profit_share_beginning',
      /Profit\s+Beginning\s+Ending\s+([0-9.]+)\s*%\s+[0-9.]+\s*%/i,
      0.84,
    ],
    [
      'loss_share_beginning',
      /Loss\s+Beginning\s+Ending\s+([0-9.]+)\s*%\s+[0-9.]+\s*%/i,
      0.84,
    ],
    [
      'capital_share_beginning',
      /Capital\s+Beginning\s+Ending\s+([0-9.]+)\s*%\s+[0-9.]+\s*%/i,
      0.84,
    ],
  ]

  for (const [fieldName, pattern, confidenceScore] of percentFields) {
    const captured = captureWithPatterns(flatText, [pattern], formatPercentage, confidenceScore)
    if (captured) parsed[fieldName] = captured
  }

  const currencyFields: Array<[string, RegExp[], number]> = [
    [
      'box_1_ordinary_income',
      [
        /1\s+Ordinary business income \(loss\)\s+([\$(),0-9.\- ]+?)(?=\s+\d{1,2}\s+[A-Z]|$)/i,
      ],
      0.7,
    ],
    [
      'box_19_distributions',
      [/19\s+Distributions\s+([\$(),0-9.\- ]+?)(?=\s+\d{1,2}\s+[A-Z]|$)/i],
      0.86,
    ],
    [
      'capital_beginning',
      [/Beginning capital account\s+[$ ]*([\$(),0-9.\- ]+)/i],
      0.82,
    ],
    [
      'capital_current_year_net_income',
      [/Current year net income \(loss\)\s+[$ ]*([\$(),0-9.\- ]+)/i],
      0.82,
    ],
    [
      'capital_withdrawals_distributions',
      [/Withdrawals and distributions\s+[$ ]*([\$(),0-9.\- ]+)/i],
      0.82,
    ],
    [
      'capital_ending',
      [/Ending capital account\s+[$ ]*([\$(),0-9.\- ]+)/i],
      0.82,
    ],
    [
      'box_21_foreign_taxes',
      [
        /21\s+Foreign taxes paid or accrued\s+([\$(),0-9.\- ]+?)(?=\s+\d{1,2}\s+[A-Z]|$)/i,
      ],
      0.76,
    ],
  ]

  for (const [fieldName, patterns, confidenceScore] of currencyFields) {
    const captured = captureWithPatterns(flatText, patterns, formatCurrency, confidenceScore)
    if (captured) parsed[fieldName] = captured
  }

  return parsed
}

export function mapAzureOcrAnalyzeResult(
  result: OcrAnalyzeResult,
  _ctx: { k1DocumentId: string },
): ExtractResult {
  if (!result.content?.trim()) {
    return {
      outcome: 'FAILURE',
      errorCode: 'PARSE_SCHEMA_MISMATCH',
      errorMessage: 'Azure OCR response contained no text content.',
    }
  }

  const parsed = parseOcrFields(result.content)
  if (Object.keys(parsed).length === 0) {
    return {
      outcome: 'FAILURE',
      errorCode: 'PARSE_SCHEMA_MISMATCH',
      errorMessage: 'Azure OCR response did not contain recognizable K-1 fields.',
    }
  }

  const { fieldValues, issues } = buildFieldValues(parsed)
  const hasRequiredMissing = fieldValues.some((field) => field.required && field.rawValue === null)

  return {
    outcome: 'SUCCESS',
    nextStatus: issues.length > 0 || hasRequiredMissing ? 'NEEDS_REVIEW' : 'READY_FOR_APPROVAL',
    issues,
    fieldValues,
  }
}