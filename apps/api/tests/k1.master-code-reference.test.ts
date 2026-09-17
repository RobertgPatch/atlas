import { describe, expect, it } from 'vitest'
import { mapBdaResult } from '../src/modules/k1/extraction/mapBdaResult.js'
import { k1CodeDescription, K1_STATEMENT_BOXES } from '../src/modules/k1/extraction/k1CodeReference.js'
import { mapReviewedK1ApplicationValues } from '../src/modules/k1/application/k1ApplicationMapper.js'
import type { DurableK1FieldValueRecord } from '../src/modules/review/review.repository.js'

const input = (box: number, text: string, code = '*', heading = `Schedule K-1, Line ${box} - Supporting details`) => ({
  outputSegments: [{ customOutputStatus: 'MATCH',
    standardOutput: { elements: [
      { id: 'face', type: 'TEXT', locations: [{ page_index: 0 }], representation: { text: 'Schedule K-1 (Form 1065)' } },
      { id: 'heading', type: 'TEXT', reading_order: 1, locations: [{ page_index: 2 }], representation: { text: heading } },
      { id: 'statement', type: 'TABLE', reading_order: 2, locations: [{ page_index: 2 }], representation: { text } },
    ] },
    customOutput: { inference_result: { match__tax_year: 2019,
      [`official__box_${box}_entries`]: [{ code, description: 'STMT', amount: '' }],
    } },
  }],
})
const rows = (draft: ReturnType<typeof mapBdaResult>, box: number) => draft.values.filter(value => value.canonicalPath === `official.box_${box}_entries`)
const apply = (draft: ReturnType<typeof mapBdaResult>) => mapReviewedK1ApplicationValues(draft.values.map(value => ({
  id: value.occurrenceId, reviewStatus: 'ACCEPTED', canonicalPath: value.canonicalPath,
  normalizedValueJson: value.normalizedValue, destinationKind: value.destination?.kind, destinationKey: value.destination?.key,
})) as DurableK1FieldValueRecord[])

describe('Master K-1 code reference and supporting statements', () => {
  it('resolves a box-wide 11* marker to multiple signed coded values used by reconciliation', () => {
    const draft = mapBdaResult(input(11, '11A\tPortfolio income\t100\n11B\tInvoluntary conversions\t(20)\n11E\tCancellation of debt\t0', '11*'))
    expect(rows(draft, 11).map(row => row.normalizedValue)).toEqual([
      { code: 'A', description: 'Portfolio income', amount: '100.00' },
      { code: 'B', description: 'Involuntary conversions', amount: '-20.00' },
      { code: 'E', description: 'Cancellation of debt', amount: '0.00' },
    ])
    expect(rows(draft, 11).every(row => row.sourceLocations.some(location => location.page === 3))).toBe(true)
    expect(apply(draft)).toContainEqual(expect.objectContaining({ destinationKey: 'box_11_other_income_loss', value: '80.00' }))
    expect(draft.validationIssues).toEqual([])
  })

  it.each(K1_STATEMENT_BOXES)('follows code-specific references for box %s', box => {
    const draft = mapBdaResult(input(box, 'A\tFirst entry\t10\nB\tSecond entry\t20', 'B*'))
    expect(rows(draft, box).map(row => row.normalizedValue)).toEqual([{ code: 'B', description: 'Second entry', amount: '20.00' }])
  })

  it('preserves historical 16A country text and 16B/16P amounts without summing foreign reporting totals', () => {
    const draft = mapBdaResult(input(16, 'A\tCountry\tCanada\nB\tGross income\t1000\nP\tForeign taxes paid\t25'))
    expect(rows(draft, 16).map(row => row.normalizedValue)).toEqual([
      { code: 'A', description: 'Country', amount: 'Canada' },
      { code: 'B', description: 'Gross income', amount: '1000.00' },
      { code: 'P', description: 'Foreign taxes paid', amount: '25.00' },
    ])
    expect(apply(draft)).toContainEqual(expect.objectContaining({ destinationKey: 'box_16_entries', value: [
      { code: 'A', value: 'Canada' }, { code: 'B', value: '1000.00' }, { code: 'P', value: '25.00' },
    ] }))
    expect(apply(draft).filter(row => row.destinationKind === 'CALCULATION')).toEqual([])
  })

  it('uses the year-specific legend to label two-column statement rows', () => {
    const draft = mapBdaResult(input(11, 'E\t50'))
    expect(rows(draft, 11)[0].normalizedValue).toEqual({ code: 'E', description: 'Cancellation of debt', amount: '50.00' })
    expect(k1CodeDescription(2024, 11, 'E')).toBeNull()
    expect(k1CodeDescription(2019, 20, 'AH')).toBe('Other information')
  })

  it.each(K1_STATEMENT_BOXES)('uses each printed code total for box %s, retaining components as evidence', box => {
    const text = 'B - Example income\nFirst component  12\nSecond component  (2)\nTOTAL BOX B  10\nC - Example expense\nOnly component  3\nTOTAL BOX C  3'
    const draft = mapBdaResult(input(box, text))
    expect(rows(draft, box).map(row => row.normalizedValue)).toEqual([
      { code: 'B', description: 'Example income', amount: '10.00' },
      { code: 'C', description: 'Example expense', amount: '3.00' },
    ])
    expect(draft.evidence.some(evidence => evidence.sourceRef.includes('First component'))).toBe(true)
  })

  it.each(['*', '11*', 'STMT', 'SEE STATEMENT', 'SEE ATTACHED STATEMENT'])('expands box-wide %s without creating a marker field', code => {
    const draft = mapBdaResult(input(11, 'C\t16\nE\t3', code))
    expect(rows(draft, 11).map(row => row.normalizedValue)).toEqual([
      { code: 'C', description: 'Sec. 1256 contracts & straddles', amount: '16.00' },
      { code: 'E', description: 'Cancellation of debt', amount: '3.00' },
    ])
    expect(draft.validationIssues).toEqual([])
  })

  it('removes star suffixes from numeric fields and keeps unresolved references only as issues', () => {
    const data = input(11, '')
    data.outputSegments[0].customOutput.inference_result.official__box_11_entries = [
      { code: '11A*', description: 'Portfolio income', amount: '25' },
      { code: '*', description: 'STMT', amount: '' },
    ]
    const draft = mapBdaResult(data)
    expect(rows(draft, 11).map(row => row.normalizedValue)).toEqual([
      { code: 'A', description: 'Portfolio income', amount: '25.00' },
    ])
    expect(draft.validationIssues).toContainEqual(expect.objectContaining({ code: 'UNRESOLVED_K1_STATEMENT', canonicalPath: 'official.box_11_entries' }))
    expect(draft.validationIssues[0].occurrenceId).toBeUndefined()
  })

  it.each(['*', '20*', 'Z*', 'STMT', 'SEE STATEMENT'])('does not require missing Box 20 %s disclosures for federal reconciliation', code => {
    const data = input(20, 'A\tInvestment income\t30531', code)
    data.outputSegments[0].customOutput.inference_result.official__box_20_entries.push(
      { code: 'A', description: 'Investment income', amount: '30531' },
    )
    const draft = mapBdaResult(data)
    expect(rows(draft, 20).map(row => row.normalizedValue)).toEqual([
      { code: 'A', description: 'Investment income', amount: '30531.00' },
    ])
    expect(draft.validationIssues).toEqual([])
    expect(apply(draft)).toContainEqual(expect.objectContaining({ destinationKey: 'box_20_entries', value: [
      { code: 'A', value: '30531.00' },
    ] }))
    expect(apply(draft).filter(row => row.destinationKind === 'CALCULATION')).toEqual([])
  })

  it('resolves the same printed code using the appropriate 2019 or 2025 reference', () => {
    expect(k1CodeDescription(2019, 11, 'I')).toBe('Other income (loss)')
    expect(k1CodeDescription(2025, 11, 'I')).toContain('disposition of oil')
    expect(k1CodeDescription(2019, 20, 'AH')).toBe('Other information')
    expect(k1CodeDescription(2025, 20, 'AH')).toBe('Noncash charitable contributions')
    expect(k1CodeDescription(2025, 15, 'BC')).toBe('Transferred credits, section 6418')
    expect(k1CodeDescription(2025, 13, 'AE')).toBe('Deductions - portfolio income')
    expect(k1CodeDescription(2025, 16, 'A')).toBeNull()
    const data = input(11, 'ZZ\t75')
    data.outputSegments[0].customOutput.inference_result.match__tax_year = 2025
    const draft = mapBdaResult(data)
    expect(rows(draft, 11)[0].normalizedValue).toEqual({ code: 'ZZ', description: 'Other income (loss)', amount: '75.00' })
  })

  it.each(['Schedule K-1 (Form 1065) 2019 Page 2', 'State Schedule K-1, Line 11 - Other income', 'Schedule K-1, Line 13 - Other deductions'])('does not use unrelated tables or legends: %s', heading => {
    const draft = mapBdaResult(input(11, 'A\tPortfolio income\t500', '*', heading))
    expect(rows(draft, 11)).toEqual([])
    expect(draft.validationIssues).toContainEqual(expect.objectContaining({ code: 'UNRESOLVED_K1_STATEMENT', severity: 'HIGH' }))
  })

  it('ignores total rows and duplicate extracted statement rows', () => {
    const draft = mapBdaResult(input(11, 'A\tPortfolio income\t50\nA\tPortfolio income\t50\nTotal\tOther income\t50'))
    expect(rows(draft, 11)).toHaveLength(1)
  })

  it('keeps custom extracted values with supporting-page evidence and removes their resolved placeholder', () => {
    const data = input(11, 'A\tPortfolio income\t50')
    const segment = data.outputSegments[0]
    const draft = mapBdaResult({ outputSegments: [{ ...segment, customOutput: { inference_result: { extracted_fields: [
      { canonical_path: 'official.box_11_entries', value_kind: 'CODE_ROW', value: { code: '*', description: 'STMT', amount: '' } },
      { canonical_path: 'official.box_11_entries', value_kind: 'CODE_ROW', evidence_ids: ['statement'], value: { code: 'A', description: 'Portfolio income', amount: '50' } },
    ] } } }] })
    expect(rows(draft, 11)).toHaveLength(1)
    expect(rows(draft, 11)[0].sourceLocations[0].page).toBe(3)
    expect(draft.validationIssues).toEqual([])
  })
})
