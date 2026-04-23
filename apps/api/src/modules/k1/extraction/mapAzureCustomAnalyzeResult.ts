import type { ExtractFieldValue, ExtractIssue, ExtractResult } from './K1Extractor.js'
import { azureFieldMap } from './azureFieldMap.js'

interface DocumentField {
  type?: string
  valueString?: string
  valueSelectionMark?: 'selected' | 'unselected'
  valueObject?: Record<string, DocumentField>
  content?: string
  confidence?: number
  boundingRegions?: Array<{ pageNumber: number; polygon: number[] }>
}

export interface CustomAnalyzeResult {
  documents?: Array<{
    docType?: string
    fields?: Record<string, DocumentField>
  }>
}

const omittedCanonicalNames = new Set(['partner_name', 'partner_tin', 'partner_address'])

const customFieldPathByCanonicalName: Partial<Record<string, string>> = {
  partnership_ein: 'partner_ein_number',
  partnership_name: 'partnership_name',
  partnership_address: 'partnership_address',
  partner_entity_type: 'partner_entity_type',
  is_general_partner: 'partner_general_or_llc_managed_mbr',
  profit_share_beginning: 'Profit Loss Capital.Profit.Beginning',
  profit_share_ending: 'Profit Loss Capital.Profit.COLUMN2',
  loss_share_beginning: 'Profit Loss Capital.Loss.Beginning',
  loss_share_ending: 'Profit Loss Capital.Loss.COLUMN2',
  capital_share_beginning: 'Profit Loss Capital.Capital.Beginning',
  capital_share_ending: 'Profit Loss Capital.Capital.COLUMN2',
  liab_nonrecourse_beginning: 'liabilities.Nonrecourse.Beginning',
  liab_nonrecourse_ending: 'liabilities.Nonrecourse.Ending',
  liab_qualified_nonrecourse_beginning:
    'liabilities.Qualified nonrecourse financing.Beginning',
  liab_qualified_nonrecourse_ending: 'liabilities.Qualified nonrecourse financing.Ending',
  liab_recourse_beginning: 'liabilities.Recourse.Beginning',
  liab_recourse_ending: 'liabilities.Recourse.Ending',
  capital_beginning: 'partner_beginning_capital',
  capital_current_year_net_income: 'partner_capital_curr_year_loss',
  capital_withdrawals_distributions: 'partner_capital_withdrawal_and_distributions',
  box_11_other_income: 'partnership_other_income',
  box_19_distributions: 'partner_share_distribution',
  box_21_foreign_taxes: 'partnership_foreign_taxes_paid_or_accruedd',
}

function resolveField(
  fields: Record<string, DocumentField>,
  dotPath: string,
): DocumentField | undefined {
  const parts = dotPath.split('.')
  let node: DocumentField | undefined = fields[parts[0]]
  for (let index = 1; index < parts.length; index++) {
    if (!node) return undefined
    node = node.valueObject?.[parts[index]]
  }
  return node
}

function normalizeNumericString(value: string): string | null {
  const compact = value.replace(/\s+/g, '')
  if (!compact) return null
  const negative = compact.includes('(') && compact.includes(')')
  const numeric = compact.replace(/[,$()]/g, '')
  if (!numeric || Number.isNaN(Number(numeric))) return null
  const amount = Number(numeric) * (negative ? -1 : 1)
  return amount.toFixed(2)
}

function normalizePercentageString(value: string): string | null {
  const numeric = value.replace(/[%\s,]/g, '')
  if (!numeric || Number.isNaN(Number(numeric))) return null
  return Number(numeric).toFixed(6)
}

function defaultValueForKind(kind: string): string {
  switch (kind) {
    case 'currency':
      return '0.00'
    case 'percentage':
      return '0.000000'
    case 'number':
      return '0'
    case 'boolean':
      return 'false'
    case 'date':
    case 'string':
    default:
      return ''
  }
}

function projectValue(field: DocumentField | undefined, kind: string): string | null {
  if (!field) return defaultValueForKind(kind)
  switch (kind) {
    case 'string':
      return field.valueString ?? field.content ?? defaultValueForKind(kind)
    case 'currency':
      return normalizeNumericString(field.valueString ?? field.content ?? '') ?? defaultValueForKind(kind)
    case 'percentage':
      return (
        normalizePercentageString(field.valueString ?? field.content ?? '') ??
        defaultValueForKind(kind)
      )
    case 'boolean': {
      if (field.valueSelectionMark === 'selected') return 'true'
      if (field.valueSelectionMark === 'unselected') return 'false'
      if ((field.valueString ?? field.content)?.trim().toUpperCase() === 'X') return 'true'
      return defaultValueForKind(kind)
    }
    default:
      return field.valueString ?? field.content ?? defaultValueForKind(kind)
  }
}

export function mapAzureCustomAnalyzeResult(
  result: CustomAnalyzeResult,
  _ctx: { k1DocumentId: string },
): ExtractResult {
  const doc = result.documents?.[0]
  if (!doc?.fields) {
    return {
      outcome: 'FAILURE',
      errorCode: 'PARSE_SCHEMA_MISMATCH',
      errorMessage: 'Azure custom model response contained no document fields.',
    }
  }

  const fieldValues: ExtractFieldValue[] = []
  const issues: ExtractIssue[] = []
  let extractedCount = 0

  for (const entry of azureFieldMap) {
    if (omittedCanonicalNames.has(entry.canonicalName)) continue

    const customPath = customFieldPathByCanonicalName[entry.canonicalName]
    const field = customPath ? resolveField(doc.fields, customPath) : undefined
    const rawValue = projectValue(field, entry.valueKind)
    if (field) extractedCount += 1

    fieldValues.push({
      fieldName: entry.canonicalName,
      label: entry.label,
      section: entry.section,
      required: entry.required,
      rawValue,
      confidenceScore: field?.confidence ?? 0,
      sourceLocation: null,
    })
  }

  if (extractedCount === 0) {
    return {
      outcome: 'FAILURE',
      errorCode: 'PARSE_SCHEMA_MISMATCH',
      errorMessage: 'Azure custom model fields did not match the app mapping.',
    }
  }

  return {
    outcome: 'SUCCESS',
    nextStatus: issues.length > 0 ? 'NEEDS_REVIEW' : 'READY_FOR_APPROVAL',
    issues,
    fieldValues,
  }
}