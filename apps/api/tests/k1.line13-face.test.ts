import { describe, expect, it } from 'vitest'
import { mapBdaResult } from '../src/modules/k1/extraction/mapBdaResult.js'
import { mapReviewedK1ApplicationValues } from '../src/modules/k1/application/k1ApplicationMapper.js'
import { calculateTrackerYear, moneyToCents } from '../src/modules/k1-tracker/k1-tracker.calculation.js'
import type { DurableK1FieldValueRecord } from '../src/modules/review/review.repository.js'

const statementRows = [
  { code: 'ZZ', description: 'P/T INTEREST EXPENSE', amount: '2313.00' },
  { code: 'ZZ', description: 'SPECIALLY ALLOC DEPRECIATION', amount: '22.00' },
]
const input = (rows = statementRows, face = '13 A\tOther deductions 891\t\t\nZZ*\tSTMT', pageIndex = 1) => ({
  outputSegments: [{
    customOutputStatus: 'MATCH',
    standardOutput: {
      elements: [
        { id: 'heading', type: 'TEXT', locations: [{ page_index: 1 }], representation: { text: 'Schedule K-1 (Form 1065)' } },
        { id: 'face', type: 'TABLE', locations: [{ page_index: pageIndex, bounding_box: { left: .48, top: .05, width: .47, height: .72 } }], representation: { text: `Part III Partner's Share of Current Year Income, Deductions, Credits, and Other Items\n${face}` } },
        { id: 'statement-heading', type: 'TEXT', locations: [{ page_index: 3 }], reading_order: 1, representation: { text: 'Schedule K-1, Line 13 - Other Deductions' } },
        { id: 'statement', type: 'TABLE', locations: [{ page_index: 3 }], reading_order: 2, representation: { text: 'Code\tDescription\tAmount\nZZ\tP/T INTEREST EXPENSE\t2,313\nZZ\tSPECIALLY ALLOC DEPRECIATION\t22' } },
      ],
    },
    customOutput: { inference_result: { official__box_13_entries: rows } },
  }],
})
const line13 = (draft: ReturnType<typeof mapBdaResult>) => draft.values.filter(value => value.canonicalPath === 'official.box_13_entries')

describe('Line 13 main-form and statement completeness', () => {
  it('recovers face code A while preserving both separately coded statement amounts', () => {
    const draft = mapBdaResult(input())
    expect(line13(draft).map(value => value.normalizedValue)).toEqual([
      { code: 'A', description: 'Other deductions', amount: '891.00' }, ...statementRows,
    ])
    expect(line13(draft)[0].sourceLocations).toEqual([{ page: 2, textRef: 'face', bbox: [.48, .05, .95, .77] }])
    expect(draft.validationIssues).toEqual([])
    expect(line13(mapBdaResult(input()))[0].occurrenceId).toBe(line13(draft)[0].occurrenceId)
  })

  it('does not double-count a face amount already present under a different description', () => {
    const draft = mapBdaResult(input([{ code: 'A', description: 'Cash contributions', amount: '891' }, ...statementRows]))
    expect(line13(draft)).toHaveLength(3)
    expect(draft.validationIssues).toEqual([])
  })

  it('requires review of conflicting amounts instead of adding both', () => {
    const draft = mapBdaResult(input([{ code: 'A', description: 'Other deductions', amount: '819' }, ...statementRows]))
    expect(line13(draft)).toHaveLength(3)
    expect(draft.validationIssues).toContainEqual(expect.objectContaining({ code: 'CONFLICTING_LINE_13_AMOUNT', severity: 'HIGH' }))
  })

  it('resolves a supplemental STMT placeholder and recovers the face amount together', () => {
    const draft = mapBdaResult(input([{ code: 'ZZ*', description: 'STMT', amount: '' }]))
    expect(line13(draft).map(value => value.normalizedValue)).toEqual([
      { code: 'A', description: 'Other deductions', amount: '891.00' }, ...statementRows,
    ])
  })

  it('ignores a matching amount on another page such as a code legend or state schedule', () => {
    expect(line13(mapBdaResult(input(statementRows, '13 A\tOther deductions 891', 2)))).toHaveLength(2)
  })

  it('does not borrow the neighboring box number or amount from the right-hand column', () => {
    expect(line13(mapBdaResult(input(statementRows, '13 A\tOther deductions\t14\tSelf-employment earnings 891')))).toHaveLength(2)
  })

  it('retains all three amounts through application mapping and reconciliation', () => {
    const draft = mapBdaResult(input())
    const mapped = mapReviewedK1ApplicationValues(draft.values.map((value) => ({
      id: value.occurrenceId, reviewStatus: 'ACCEPTED',
      canonicalPath: value.canonicalPath, normalizedValueJson: value.normalizedValue,
      destinationKind: value.destination?.kind, destinationKey: value.destination?.key,
    }) as DurableK1FieldValueRecord))
    const total = mapped.find(value => value.destinationKey === 'box_13_other_deductions')
    expect(total?.value).toBe('3226.00')
    expect(total?.sourceFieldValueIds).toHaveLength(3)
    const calculate = (deductions: string) => calculateTrackerYear({
      id: 'synthetic-year', taxYear: 2025, revision: 1, status: 'IMPORTED',
      values: Object.fromEntries(Object.entries({
        opening_outside_basis: '10000.00', section_l_beginning_capital: '10000.00',
        box_1_ordinary_income_loss: '5000.00', box_13_other_deductions: deductions,
        box_18c_nondeductible_expenses: '0.00', section_l_current_year_net_income_loss: '1774.00',
        section_l_ending_capital: '11774.00',
      }).map(([key, value]) => [key, moneyToCents(value)])),
    })
    const affected = ['section-l-net-income', 'section-l-ending', 'book-tax-unexplained']
    expect(calculate('2335.00').checks.filter(check => affected.includes(check.key)).map(check => check.difference)).toEqual(['-891.00', '-891.00', '-891.00'])
    expect(calculate(String(total!.value)).checks.filter(check => affected.includes(check.key)).map(check => check.status)).toEqual(['PASS', 'PASS', 'PASS'])
  })
})
