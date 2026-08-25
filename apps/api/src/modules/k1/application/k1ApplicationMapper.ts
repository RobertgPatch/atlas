import type { DurableK1FieldValueRecord } from '../../review/review.repository.js'
import { centsToMoney, moneyToCents } from '../../k1-tracker/k1-tracker.calculation.js'
import { trackerFieldByKey } from '../../k1-tracker/k1-tracker.field-map.js'
import type {
  K1TrackerFieldKey,
  K1TrackerOfficialFormFieldKey,
  K1TrackerOfficialFormValue,
} from '../../k1-tracker/k1-tracker.contracts.js'
import {
  K1_CALCULATION_DESTINATIONS,
  K1_OFFICIAL_DESTINATIONS,
  type K1CalculationMappingPolicy,
} from '../extraction/k1DestinationInventory.js'
import { normalizeK1PrintedCode } from '../extraction/k1DraftValidation.js'

export interface K1MappedApplicationValue {
  destinationKind: 'CALCULATION' | 'OFFICIAL'
  destinationKey: string
  value: string | boolean | Array<{ code: string; value: string }> | null
  sourceFieldValueIds: string[]
  policy: K1CalculationMappingPolicy | 'OFFICIAL_FORM'
  affectsDownstreamCalculations: boolean
}

const effective = (field: DurableK1FieldValueRecord): unknown =>
  field.reviewerCorrectedValueJson
  ?? field.normalizedValueJson
  ?? field.normalizedValue
  ?? field.rawValueJson
  ?? field.rawValue

const normalizeMoney = (value: unknown, fieldKey: K1TrackerFieldKey): string | null => {
  const parsed = moneyToCents(value == null ? null : String(value).replaceAll(',', '').replaceAll('$', '').trim())
  if (parsed == null) return null
  const definition = trackerFieldByKey.get(fieldKey)
  const normalized = fieldKey === 'section_l_withdrawals_distributions' && parsed > 0n
    ? -parsed
    : definition && (definition.role === 'deduction' || definition.role === 'distribution') && !definition.signed && parsed < 0n
      ? -parsed
      : parsed
  return centsToMoney(normalized)
}

const codeEntry = (value: unknown, destinationKey: K1TrackerOfficialFormFieldKey): { code: string; value: string } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const code = normalizeK1PrintedCode(`official.${destinationKey}`, String(row.code ?? ''))
  const amount = row.value ?? row.amount ?? ''
  const normalizedValue = typeof amount === 'number' ? centsToMoney(BigInt(Math.round(amount * 100)))! : String(amount).trim()
  if (!code && !normalizedValue) return null
  return { code, value: normalizedValue }
}

interface ReviewedCodeRow {
  field: DurableK1FieldValueRecord
  code: string
  amount: bigint
}

const reviewedCodeRow = (field: DurableK1FieldValueRecord): ReviewedCodeRow | null => {
  const value = effective(field)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const parsed = moneyToCents(row.amount == null && row.value == null
    ? null
    : String(row.amount ?? row.value))
  if (parsed == null) return null
  return {
    field,
    code: normalizeK1PrintedCode(
      field.canonicalPath ?? `official.${field.destinationKey ?? ''}`,
      String(row.code ?? ''),
    ).replace(/\*+$/, ''),
    amount: parsed,
  }
}

const absolute = (value: bigint): bigint => value < 0n ? -value : value
const sum = (values: bigint[]): bigint => values.reduce((total, value) => total + value, 0n)

const calculationPolicies = new Map(
  K1_CALCULATION_DESTINATIONS.map((destination) => [destination.key, destination.policy]),
)
const repeatedOfficial = new Set(
  K1_OFFICIAL_DESTINATIONS.filter((destination) => destination.repeated).map((destination) => destination.key),
)

const groupByDestination = (fields: DurableK1FieldValueRecord[]): Map<string, DurableK1FieldValueRecord[]> => {
  const grouped = new Map<string, DurableK1FieldValueRecord[]>()
  for (const field of fields) grouped.set(field.destinationKey!, [...(grouped.get(field.destinationKey!) ?? []), field])
  return grouped
}

/** Compiles the reviewed active attempt into application destinations. */
export const mapReviewedK1ApplicationValues = (
  fields: DurableK1FieldValueRecord[],
): K1MappedApplicationValue[] => {
  const accepted = fields.filter((field) => field.reviewStatus !== 'REJECTED')
  if (accepted.some((field) => field.reviewStatus === 'PENDING')) {
    throw Object.assign(new Error('K1_REVIEW_INCOMPLETE'), { code: 'K1_REVIEW_INCOMPLETE' })
  }
  const mapped: K1MappedApplicationValue[] = []
  const calculationGroups = groupByDestination(
    accepted.filter((field) => field.destinationKind === 'CALCULATION' && field.destinationKey),
  )
  for (const [rawKey, destinationFields] of calculationGroups) {
    const key = rawKey as K1TrackerFieldKey
    const policy = calculationPolicies.get(key)
    if (!policy || policy === 'WORKPAPER_EXCLUDED') continue
    if (destinationFields.length !== 1) {
      throw Object.assign(new Error('DUPLICATE_CALCULATION_DESTINATION'), { code: 'DUPLICATE_CALCULATION_DESTINATION', destinationKey: key })
    }
    // Box 13/Line 18 historical calculations are only admitted when the
    // occurrence was explicitly classified by a reviewer or mapping rule.
    if (policy === 'REVIEWED_DERIVATION' && !['ACCEPTED', 'CORRECTED'].includes(destinationFields[0].reviewStatus)) continue
    const value = normalizeMoney(effective(destinationFields[0]), key)
    if (value == null && effective(destinationFields[0]) != null) {
      throw Object.assign(new Error('INVALID_CALCULATION_VALUE'), { code: 'INVALID_CALCULATION_VALUE', destinationKey: key })
    }
    if (key === 'section_l_withdrawals_distributions' && value === null) continue
    const role = trackerFieldByKey.get(key)?.role
    mapped.push({
      destinationKind: 'CALCULATION', destinationKey: key, value,
      sourceFieldValueIds: [destinationFields[0].id], policy,
      affectsDownstreamCalculations: role !== 'liability',
    })
  }

  const mappedCalculationKeys = new Set(mapped
    .filter((value) => value.destinationKind === 'CALCULATION')
    .map((value) => value.destinationKey))
  const officialCodeRows = (destinationKey: K1TrackerOfficialFormFieldKey): ReviewedCodeRow[] =>
    accepted
      .filter((field) => field.destinationKind === 'OFFICIAL' && field.destinationKey === destinationKey)
      .map(reviewedCodeRow)
      .filter((row): row is ReviewedCodeRow => row !== null)
  const addDerivedCalculation = (
    destinationKey: K1TrackerFieldKey,
    rows: ReviewedCodeRow[],
    amount: bigint,
    policy: K1CalculationMappingPolicy,
  ): void => {
    if (rows.length === 0 || mappedCalculationKeys.has(destinationKey)) return
    mapped.push({
      destinationKind: 'CALCULATION',
      destinationKey,
      value: centsToMoney(amount),
      sourceFieldValueIds: rows.map((row) => row.field.id),
      policy,
      affectsDownstreamCalculations: true,
    })
    mappedCalculationKeys.add(destinationKey)
  }

  // BDA preserves coded K-1 rows as official-form evidence. Promote verified
  // numeric rows into the corresponding calculator inputs so a correct scan
  // does not require the user to re-enter the same amounts in a workpaper.
  const box11Rows = officialCodeRows('box_11_entries')
  addDerivedCalculation(
    'box_11_other_income_loss',
    box11Rows,
    sum(box11Rows.map((row) => row.amount)),
    'DIRECT_K1_FIELD',
  )

  if (!mappedCalculationKeys.has('box_13_other_portfolio_deductions')
    && !mappedCalculationKeys.has('box_13_management_fees')) {
    const box13Rows = officialCodeRows('box_13_entries')
    addDerivedCalculation(
      'box_13_other_deductions',
      box13Rows,
      sum(box13Rows.map((row) => absolute(row.amount))),
      'REVIEWED_DERIVATION',
    )
  }

  const box18Rows = officialCodeRows('box_18_entries')
  const taxExemptRows = box18Rows.filter((row) => row.code === 'A' || row.code === 'B')
  addDerivedCalculation(
    'box_18b_tax_exempt_income',
    taxExemptRows,
    sum(taxExemptRows.map((row) => absolute(row.amount))),
    'REVIEWED_DERIVATION',
  )
  const nondeductibleRows = box18Rows.filter((row) => row.code === 'C')
  addDerivedCalculation(
    'box_18c_nondeductible_expenses',
    nondeductibleRows,
    sum(nondeductibleRows.map((row) => absolute(row.amount))),
    'REVIEWED_DERIVATION',
  )

  const box19Rows = officialCodeRows('box_19_entries')
  addDerivedCalculation(
    'box_19_distributions',
    box19Rows,
    sum(box19Rows.map((row) => absolute(row.amount))),
    'DATED_ACTIVITY_AUTHORITATIVE',
  )

  const box21Rows = officialCodeRows('box_21_entries')
  addDerivedCalculation(
    'box_21_foreign_taxes',
    box21Rows,
    sum(box21Rows.map((row) => absolute(row.amount))),
    'DIRECT_K1_FIELD',
  )

  const itemJDecreaseKeys = new Set(['part_ii_j_decrease_sale', 'part_ii_j_decrease_exchange'])
  const itemJDecreaseFields = accepted.filter((field) =>
    field.destinationKind === 'OFFICIAL' && field.destinationKey && itemJDecreaseKeys.has(field.destinationKey),
  )
  if (itemJDecreaseFields.length > 0) {
    const explicitlyCorrected = itemJDecreaseFields.find((field) =>
      field.destinationKey === 'part_ii_j_decrease_sale' && field.reviewerCorrectedValueJson !== null,
    ) ?? itemJDecreaseFields.find((field) => field.reviewerCorrectedValueJson !== null)
    const value = explicitlyCorrected
      ? effective(explicitlyCorrected) === true
      : itemJDecreaseFields.some((field) => effective(field) === true)
    mapped.push({
      destinationKind: 'OFFICIAL',
      destinationKey: 'part_ii_j_decrease_sale',
      value,
      sourceFieldValueIds: itemJDecreaseFields.map((field) => field.id),
      policy: 'OFFICIAL_FORM',
      affectsDownstreamCalculations: false,
    })
  }

  const officialGroups = groupByDestination(
    accepted.filter((field) => field.destinationKind === 'OFFICIAL'
      && field.destinationKey
      && !itemJDecreaseKeys.has(field.destinationKey)),
  )
  for (const [rawKey, destinationFields] of officialGroups) {
    const key = rawKey as K1TrackerOfficialFormFieldKey
    let value: K1TrackerOfficialFormValue
    if (repeatedOfficial.has(key)) {
      value = destinationFields.map((field) => codeEntry(effective(field), key)).filter((entry): entry is { code: string; value: string } => entry !== null)
    } else {
      if (destinationFields.length !== 1) {
        throw Object.assign(new Error('DUPLICATE_OFFICIAL_DESTINATION'), { code: 'DUPLICATE_OFFICIAL_DESTINATION', destinationKey: key })
      }
      const raw = effective(destinationFields[0])
      value = raw == null ? null : typeof raw === 'boolean' ? raw : String(raw)
    }
    mapped.push({
      destinationKind: 'OFFICIAL', destinationKey: key, value,
      sourceFieldValueIds: destinationFields.map((field) => field.id),
      policy: 'OFFICIAL_FORM', affectsDownstreamCalculations: false,
    })
  }
  return mapped
}
