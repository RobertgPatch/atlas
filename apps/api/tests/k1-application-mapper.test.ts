import { describe, expect, it } from 'vitest'
import { mapReviewedK1ApplicationValues } from '../src/modules/k1/application/k1ApplicationMapper.js'
import type { DurableK1FieldValueRecord } from '../src/modules/review/review.repository.js'

const reviewedSectionLWithdrawal = (normalizedValue: string | null): DurableK1FieldValueRecord => ({
  id: 'field-1',
  k1DocumentId: 'document-1',
  extractionAttemptId: 'attempt-1',
  canonicalPath: 'calculation.section_l_withdrawals_distributions',
  occurrenceId: null,
  occurrenceIndex: null,
  fieldName: 'capital_withdrawals_distributions',
  label: 'Withdrawals and distributions',
  section: 'CAPITAL_ACCOUNT',
  required: false,
  valueKind: 'money',
  rawValue: normalizedValue,
  rawValueJson: null,
  normalizedValue,
  normalizedValueJson: null,
  reviewerCorrectedValue: null,
  reviewerCorrectedValueJson: null,
  confidenceScore: 0.99,
  sourceLocations: [],
  destinationKind: 'CALCULATION',
  destinationKey: 'section_l_withdrawals_distributions',
  mappingRuleVersion: 'test',
  reviewStatus: 'ACCEPTED',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
})

const reviewedCodeRow = (
  id: string,
  destinationKey: 'box_11_entries' | 'box_13_entries' | 'box_18_entries' | 'box_19_entries' | 'box_20_entries' | 'box_21_entries',
  code: string,
  amount: string | null,
): DurableK1FieldValueRecord => ({
  ...reviewedSectionLWithdrawal('0.00'),
  id,
  canonicalPath: `official.${destinationKey}`,
  fieldName: `official.${destinationKey}`,
  label: `${destinationKey} ${code}`,
  valueKind: 'CODE_ROW',
  rawValue: JSON.stringify({ code, amount }),
  rawValueJson: { code, amount },
  normalizedValue: JSON.stringify({ code, amount }),
  normalizedValueJson: { code, amount },
  destinationKind: 'OFFICIAL',
  destinationKey,
})

describe('reviewed K-1 application mapping', () => {
  it.each(['250.00', '-250.00'])('stores Section L withdrawal %s with the canonical negative sign', (sourceValue) => {
    expect(mapReviewedK1ApplicationValues([reviewedSectionLWithdrawal(sourceValue)]))
      .toContainEqual(expect.objectContaining({
        destinationKey: 'section_l_withdrawals_distributions',
        value: '-250.00',
      }))
  })

  it('omits a blank Section L withdrawals value instead of applying a zero or null field', () => {
    expect(mapReviewedK1ApplicationValues([reviewedSectionLWithdrawal(null)])).toEqual([])
  })

  it('preserves a negative Line 19 distribution from the reviewed K-1', () => {
    const field: DurableK1FieldValueRecord = {
      ...reviewedSectionLWithdrawal('-250.00'),
      canonicalPath: 'calculation.box_19_distributions',
      fieldName: 'box_19_distributions',
      label: 'Distributions',
      destinationKey: 'box_19_distributions',
    }

    expect(mapReviewedK1ApplicationValues([field])).toContainEqual(expect.objectContaining({
      destinationKey: 'box_19_distributions',
      value: '-250.00',
    }))
  })

  it('promotes verified coded rows into the calculation fields used by reconciliation', () => {
    const mapped = mapReviewedK1ApplicationValues([
      reviewedCodeRow('box-13-a', 'box_13_entries', 'A', '855.00'),
      reviewedCodeRow('box-13-zz-interest', 'box_13_entries', 'ZZ', '2313.00'),
      reviewedCodeRow('box-13-zz-depreciation', 'box_13_entries', 'ZZ', '22.00'),
      reviewedCodeRow('box-18-c', 'box_18_entries', 'C*', '642.00'),
      reviewedCodeRow('box-19-a', 'box_19_entries', 'A', '190773.00'),
    ])

    expect(mapped).toEqual(expect.arrayContaining([
      expect.objectContaining({
        destinationKind: 'CALCULATION',
        destinationKey: 'box_13_other_deductions',
        value: '3190.00',
        sourceFieldValueIds: ['box-13-a', 'box-13-zz-interest', 'box-13-zz-depreciation'],
        policy: 'REVIEWED_DERIVATION',
      }),
      expect.objectContaining({
        destinationKind: 'CALCULATION',
        destinationKey: 'box_18c_nondeductible_expenses',
        value: '642.00',
        sourceFieldValueIds: ['box-18-c'],
        policy: 'REVIEWED_DERIVATION',
      }),
      expect.objectContaining({
        destinationKind: 'CALCULATION',
        destinationKey: 'box_19_distributions',
        value: '190773.00',
        sourceFieldValueIds: ['box-19-a'],
        policy: 'DATED_ACTIVITY_AUTHORITATIVE',
      }),
    ]))
  })

  it('does not derive a duplicate calculation when BDA supplied the direct destination', () => {
    const direct: DurableK1FieldValueRecord = {
      ...reviewedSectionLWithdrawal('175.00'),
      id: 'direct-distribution',
      canonicalPath: 'calculation.box_19_distributions',
      destinationKey: 'box_19_distributions',
    }
    const mapped = mapReviewedK1ApplicationValues([
      direct,
      reviewedCodeRow('official-distribution', 'box_19_entries', 'A', '190773.00'),
    ])

    expect(mapped.filter((value) => value.destinationKind === 'CALCULATION'
      && value.destinationKey === 'box_19_distributions')).toEqual([
      expect.objectContaining({ value: '175.00', sourceFieldValueIds: ['direct-distribution'] }),
    ])
  })

  it('ignores coded statement rows that have no numeric amount', () => {
    const mapped = mapReviewedK1ApplicationValues([
      reviewedCodeRow('statement-row', 'box_13_entries', 'STMT', null),
    ])

    expect(mapped.some((value) => value.destinationKind === 'CALCULATION'
      && value.destinationKey === 'box_13_other_deductions')).toBe(false)
  })

  it('removes a repeated printed line number from an official code', () => {
    const mapped = mapReviewedK1ApplicationValues([
      reviewedCodeRow('box-20-a', 'box_20_entries', '20A', '7469.00'),
    ])

    expect(mapped).toContainEqual(expect.objectContaining({
      destinationKind: 'OFFICIAL',
      destinationKey: 'box_20_entries',
      value: [{ code: 'A', value: '7469.00' }],
    }))
  })

  it('applies the legacy Item J sale/exchange fields as one combined checkbox', () => {
    const officialField = (
      id: string,
      destinationKey: 'part_ii_j_decrease_sale' | 'part_ii_j_decrease_exchange',
      normalizedValue: boolean,
    ): DurableK1FieldValueRecord => ({
      ...reviewedSectionLWithdrawal('0.00'),
      id,
      canonicalPath: `official.${destinationKey}`,
      fieldName: `official.${destinationKey}`,
      label: destinationKey,
      valueKind: 'BOOLEAN',
      rawValue: String(normalizedValue),
      rawValueJson: normalizedValue,
      normalizedValue: String(normalizedValue),
      normalizedValueJson: normalizedValue,
      destinationKind: 'OFFICIAL',
      destinationKey,
    })

    expect(mapReviewedK1ApplicationValues([
      officialField('sale-field', 'part_ii_j_decrease_sale', false),
      officialField('exchange-field', 'part_ii_j_decrease_exchange', true),
    ])).toContainEqual({
      destinationKind: 'OFFICIAL',
      destinationKey: 'part_ii_j_decrease_sale',
      value: true,
      sourceFieldValueIds: ['sale-field', 'exchange-field'],
      policy: 'OFFICIAL_FORM',
      affectsDownstreamCalculations: false,
    })
  })

  it('treats an explicit correction to the combined Item J checkbox as authoritative', () => {
    const sale: DurableK1FieldValueRecord = {
      ...reviewedSectionLWithdrawal('0.00'),
      id: 'sale-field',
      canonicalPath: 'official.part_ii_j_decrease_sale',
      fieldName: 'official.part_ii_j_decrease_sale',
      label: 'Item J decrease due to sale or exchange',
      valueKind: 'BOOLEAN',
      rawValue: 'false',
      rawValueJson: false,
      normalizedValue: 'false',
      normalizedValueJson: false,
      reviewerCorrectedValue: 'false',
      reviewerCorrectedValueJson: false,
      destinationKind: 'OFFICIAL',
      destinationKey: 'part_ii_j_decrease_sale',
      reviewStatus: 'CORRECTED',
    }
    const legacyExchange: DurableK1FieldValueRecord = {
      ...sale,
      id: 'exchange-field',
      canonicalPath: 'official.part_ii_j_decrease_exchange',
      fieldName: 'official.part_ii_j_decrease_exchange',
      destinationKey: 'part_ii_j_decrease_exchange',
      normalizedValue: 'true',
      normalizedValueJson: true,
      reviewerCorrectedValue: null,
      reviewerCorrectedValueJson: null,
      reviewStatus: 'ACCEPTED',
    }

    expect(mapReviewedK1ApplicationValues([sale, legacyExchange]))
      .toContainEqual(expect.objectContaining({
        destinationKey: 'part_ii_j_decrease_sale',
        value: false,
      }))
  })
})
