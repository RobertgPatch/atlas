import { describe, expect, it } from 'vitest'
import { mapBdaResult } from '../src/modules/k1/extraction/mapBdaResult.js'
import { normalizeK1ExtractedValue } from '../src/modules/k1/extraction/k1DraftValidation.js'
import { mapReviewedK1ApplicationValues } from '../src/modules/k1/application/k1ApplicationMapper.js'
import { calculateTrackerYear, moneyToCents } from '../src/modules/k1-tracker/k1-tracker.calculation.js'
import type { DurableK1FieldValueRecord } from '../src/modules/review/review.repository.js'
import type { TrackerYearInput } from '../src/modules/k1-tracker/k1-tracker.types.js'

// De-identified regression for the supplied 2019 packet's visible layout and
// figures. No PDF, partner identifiers, or provider credentials are committed.
const element = (id: string, page: number, text: string) => ({
  id, type: 'TEXT', locations: [{ page_index: page - 1 }], representation: { text },
})
const row = (code: string, amount: string, description = '') => ({ code, amount, description })
const packet = () => ({ outputSegments: [{ customOutputStatus: 'MATCH', standardOutput: { elements: [
  element('face', 1, 'Schedule K-1 (Form 1065)'),
  element('legend', 2, 'Schedule K-1 (Form 1065) 2019 Page 2\nThis list identifies the codes used on Schedule K-1'),
  element('statement-3', 3, `SCH K-1 SUPPORTING SCHEDULES
ITEM L - RECONCILIATION OF INCOME
TOTAL INCOME PER SCHEDULE K-1  (62,170)
CAPITALIZATION OF ORGANIZATION COSTS  (1,028)
NET CHANGE IN TAX UNREALIZED GAIN/(LOSS) ON INVESTMENTS  63,151
TOTAL CURRENT YEAR NET INCOME/(LOSS) PER ITEM L  (47)
BOX 11 - OTHER INCOME/(LOSS)
A - OTHER PORTFOLIO INCOME/(LOSS)
OTHER PORTFOLIO INCOME/(LOSS)  1,536
OTHER INCOME/(LOSS)  3,061
TOTAL BOX A  4,597
C - SEC. 1256 CONTRACTS AND STRADDLES`),
  element('statement-4', 4, `NET SECTION 1256 GAIN/(LOSS) FROM INVESTMENT ACTIVITIES  16
TOTAL BOX C  16
E - CANCELLATION OF DEBT
CANCELLATION OF DEBT  3
TOTAL BOX E  3
H - SUBPART F INCOME
SUBPART F INCOME OTHER THAN SECTIONS 951A AND 965 INCLUSION  (1,653)
TOTAL BOX H  (1,653)
I - OTHER INCOME/(LOSS)
OTHER INCOME/(LOSS)  (968)
TOTAL BOX I  (968)
BOX 13 - OTHER DEDUCTIONS
A - CASH CONTRIBUTIONS (60%)
CONTRIBUTIONS (60%)  91
TOTAL BOX A  91
H - INVESTMENT INTEREST EXPENSE
INVESTMENT INTEREST EXPENSE FROM INVESTING ACTIVITIES  15,423
TOTAL BOX H  15,423
L - OTHER PORTFOLIO DEDUCTIONS
OTHER PORTFOLIO DEDUCTIONS  1
TOTAL BOX L  1
W - OTHER DEDUCTIONS
PLATFORM MANAGEMENT FEES  15,000
OTHER PORTFOLIO DEDUCTIONS  57,052
IRC SECTION 743 AMORTIZATION (TRADE OR BUSINESS)  33,577
INTEREST EXPENSE ON DEBT FINANCED DISTRIBUTIONS  747
TOTAL BOX W  106,376
LINE 17 - ALTERNATIVE MINIMUM TAX(AMT) ITEMS
D - OIL, GAS, & GEOTHERMAL - GROSS INCOME  251
E - OIL, GAS, & GEOTHERMAL - DEDUCTIONS  157
F - OTHER AMT ITEMS  135`),
  element('statement-5', 5, `BOX 20 - OTHER INFORMATION
AE - EXCESS TAXABLE INCOME  65
AF - EXCESS BUSINESS INTEREST INCOME  1
AG - GROSS RECEIPTS FOR SECTION 59A(E)  106,285`),
] }, customOutput: { inference_result: {
  match__tax_year: 2019, official__tax_period_beginning: '2019',
  calculation__box_1_ordinary_income_loss: 20002,
  calculation__box_2_net_rental_real_estate_income_loss: 93,
  calculation__box_3_other_net_rental_income_loss: 67,
  calculation__box_5_interest_income: 12785,
  calculation__box_6a_ordinary_dividends: 13149,
  official__box_6b_qualified_dividends: 10603,
  calculation__box_8_net_short_term_capital_gain_loss: -1681,
  calculation__box_9a_net_long_term_capital_gain_loss: 13528,
  calculation__box_10_net_section_1231_gain_loss: 89,
  official__box_11_entries: [row('A', '4597', 'Other portfolio income'), row('*', '', 'STMT')],
  official__box_13_entries: [row('A', '91', 'Cash contributions'), row('*', '', 'STMT')],
  official__box_16_entries: [row('A', 'OTHER', 'Country'), row('F', '18764', 'Foreign income'), row('P', '127', 'Taxes paid'), row('Q', '179', 'Taxes accrued')],
  official__box_17_entries: [row('A', '1'), row('B', '-123'), row('*', '', 'STMT')],
  official__box_18_entries: [row('A', '22'), row('C', '271')],
  official__box_19_entries: [row('A', '85995')],
  official__box_20_entries: [row('A', '30531'), row('B', '106377'), row('*', '', 'STMT')],
  calculation__section_l_current_year_net_income_loss: -47,
  calculation__section_l_withdrawals_distributions: -85995,
} } }] })

const rows = (draft: ReturnType<typeof mapBdaResult>, box: number) => draft.values
  .filter(value => value.canonicalPath === `official.box_${box}_entries`)
  .map(value => value.normalizedValue)

describe('Historical K-1 packet', () => {
  it('recovers real BDA layout: a missing face TIN, table padding, and a misplaced continuation heading', () => {
    const data = packet()
    const elements = data.outputSegments[0].standardOutput.elements
    elements[0].representation.text += '\n12-3456789'
    const located = (id: string, text: string, top: number, order: number, type = 'TEXT') => ({
      id, type, reading_order: order,
      locations: [{ page_index: 2, bounding_box: { left: 0.05, top, width: 0.9, height: 0.01 } }],
      representation: { text },
    })
    const statementTable = elements[2].representation.text
      .replace('SCH K-1 SUPPORTING SCHEDULES\n', '')
      .replace('ITEM L - RECONCILIATION OF INCOME\n', '')
      .replace('\nC - SEC. 1256 CONTRACTS AND STRADDLES', '')
      .replace(/  /g, '\t')
    elements.splice(2, 1,
      located('partner-header', '12-3456789 **-***4321', 0.02, 0),
      located('support-heading', 'SCH K-1 SUPPORTING SCHEDULES', 0.075, 1),
      located('item-l-heading', 'ITEM L - RECONCILIATION OF INCOME', 0.108, 2),
      // BDA emitted this heading before the table despite its bottom position.
      located('code-c-heading', 'C - SEC. 1256 CONTRACTS AND STRADDLES', 0.928, 3),
      located('statement-table', statementTable, 0.105, 4, 'TABLE'),
    )
    for (const item of elements.filter(item => item.locations[0].page_index >= 3)) {
      item.representation.text = `12-3456789 **-***4321\n${item.representation.text}`
    }
    const draft = mapBdaResult(data)
    expect(rows(draft, 11).map(value => (value as { code: string }).code)).toEqual(['A', 'C', 'E', 'H', 'I'])
    expect(rows(draft, 11)).toContainEqual(expect.objectContaining({ code: 'C', amount: '16.00' }))
    expect(rows(draft, 13)).toHaveLength(4)
    expect(rows(draft, 13)).toContainEqual(expect.objectContaining({ code: 'W', amount: '106376.00' }))
    expect(rows(draft, 17)).toHaveLength(5)
    expect(rows(draft, 20)).toHaveLength(5)
    expect(draft.validationIssues).toEqual([])
  })

  it.each(['12-3456789', '**-***4321'])('rejects a contradictory %s when the face actually supplies that identifier', identifier => {
    const data = packet()
    data.outputSegments[0].standardOutput.elements[0].representation.text += `\n${identifier}`
    data.outputSegments[0].standardOutput.elements[3].representation.text = `98-7654321 **-***9876\n${data.outputSegments[0].standardOutput.elements[3].representation.text}`
    expect(rows(mapBdaResult(data), 13)).not.toContainEqual(expect.objectContaining({ code: 'W' }))
  })

  it('uses an explicit TOTAL BOX C when OCR omitted the code heading', () => {
    const data = packet()
    data.outputSegments[0].standardOutput.elements[2].representation.text = data.outputSegments[0].standardOutput.elements[2].representation.text.replace('\nC - SEC. 1256 CONTRACTS AND STRADDLES', '')
    const draft = mapBdaResult(data)
    expect(rows(draft, 11)).toContainEqual({ code: 'C', description: 'Sec. 1256 contracts & straddles', amount: '16.00' })
    expect(rows(draft, 11).filter(value => (value as { code: string }).code === 'A')).toHaveLength(1)
    expect(draft.validationIssues).toEqual([])
  })

  it('recovers missing face rows and a box-wide star independently in each Part III column', () => {
    const data = packet()
    data.outputSegments[0].standardOutput.elements[0].representation.text += '\nInformation About the Partnership\nInformation About the Partner'
    data.outputSegments[0].standardOutput.elements.splice(1, 0, {
      ...element('face-table', 1, '3\tOther rental income 67\t16 A\tForeign transactions OTHER\n4a\tGuaranteed payments\tF\t18,764\n4b\tGuaranteed payments\tP\t127\n4c\tTotal guaranteed payments\tQ\t179\n11 A\tOther income 4,597\t19 A\tDistributions 85,995\n*\tSTMT\t20 A\tOther information 30,531\n13 A\tOther deductions 91\tB\t106,377\nH\t15,423\tZ\tSTMT\n*\tSTMT\t*\tSTMT'),
      type: 'TABLE',
    })
    data.outputSegments[0].customOutput.inference_result.official__box_16_entries = []
    data.outputSegments[0].customOutput.inference_result.official__box_11_entries = [row('A', '4597'), row('C*', '', 'STMT')]
    const draft = mapBdaResult(data)
    expect(rows(draft, 11).map(value => (value as { code: string }).code)).toEqual(['A', 'C', 'E', 'H', 'I'])
    expect(rows(draft, 16)).toHaveLength(4)
    expect(rows(draft, 16)).toContainEqual(expect.objectContaining({ code: 'P', amount: '127.00' }))
    expect(rows(draft, 13)).toContainEqual(expect.objectContaining({ code: 'H', amount: '15423.00' }))
    expect(rows(draft, 20)).not.toContainEqual(expect.objectContaining({ code: 'H' }))
    expect(draft.validationIssues).toEqual([])
  })

  it('replaces partial provider components with the printed code total, with a review issue', () => {
    const data = packet()
    data.outputSegments[0].customOutput.inference_result.official__box_13_entries.push(row('W', '15000', 'PLATFORM MANAGEMENT FEES'))
    const draft = mapBdaResult(data)
    expect(rows(draft, 13).filter(value => (value as { code: string }).code === 'W')).toEqual([
      { code: 'W', description: 'OTHER DEDUCTIONS', amount: '106376.00' },
    ])
    expect(draft.validationIssues).toContainEqual(expect.objectContaining({ code: 'K1_CODE_TOTAL_MISMATCH', severity: 'HIGH' }))
  })

  it('does not count custom output that includes both 11A and its breakdown twice', () => {
    const data = packet()
    data.outputSegments[0].customOutput.inference_result.official__box_11_entries.push(
      row('A', '1536', 'OTHER PORTFOLIO INCOME/(LOSS)'), row('A', '3061', 'OTHER INCOME/(LOSS)'),
    )
    expect(rows(mapBdaResult(data), 11).filter(value => (value as { code: string }).code === 'A')).toEqual([
      { code: 'A', description: 'Other portfolio income', amount: '4597.00' },
    ])
  })
  it('flags incomplete component extraction instead of silently accepting a partial total', () => {
    const data = packet()
    data.outputSegments[0].standardOutput.elements[3].representation.text = data.outputSegments[0].standardOutput.elements[3].representation.text.replace('PLATFORM MANAGEMENT FEES  15,000\n', '')
    const draft = mapBdaResult(data)
    expect(draft.validationIssues).toContainEqual(expect.objectContaining({ code: 'K1_STATEMENT_TOTAL_MISMATCH', severity: 'HIGH' }))
  })
  it.each(['State Schedule K-1', 'Tax year 2025'])('does not read %s as the current federal statement', label => {
    const data = packet()
    data.outputSegments[0].standardOutput.elements[3].representation.text = `${label}\n${data.outputSegments[0].standardOutput.elements[3].representation.text}`
    expect(rows(mapBdaResult(data), 11)).not.toContainEqual(expect.objectContaining({ code: 'H', amount: '-1653.00' }))
  })
  it('follows supporting pages in separate AWS segments without importing their custom fields', () => {
    const data = packet()
    const [face, legend, ...support] = data.outputSegments[0].standardOutput.elements
    const selected = { ...data.outputSegments[0], standardOutput: { elements: [face, legend] } }
    const draft = mapBdaResult({ outputSegments: [selected, ...support.map(item => ({
      customOutputStatus: 'NO_MATCH', standardOutput: { elements: [item] },
      customOutput: { inference_result: { calculation__box_1_ordinary_income_loss: 999999 } },
    }))] })
    expect(rows(draft, 11)).toHaveLength(5)
    expect(rows(draft, 13)).toHaveLength(4)
    expect(draft.values.find(value => value.canonicalPath === 'calculation.box_1_ordinary_income_loss')?.normalizedValue).toBe('20002.00')
    expect(draft.validationIssues).toEqual([])
    expect(draft.values.find(value => (value.normalizedValue as { code?: string })?.code === 'C')?.sourceLocations[0].page).toBe(4)
  })
  it('recovers all codes across pages, preserves 11A once, and does not invent ZZ', () => {
    const draft = mapBdaResult(packet())
    expect(rows(draft, 11)).toEqual([
      { code: 'A', description: 'Other portfolio income', amount: '4597.00' },
      { code: 'C', description: 'SEC. 1256 CONTRACTS AND STRADDLES', amount: '16.00' },
      { code: 'E', description: 'CANCELLATION OF DEBT', amount: '3.00' },
      { code: 'H', description: 'SUBPART F INCOME', amount: '-1653.00' },
      { code: 'I', description: 'OTHER INCOME/(LOSS)', amount: '-968.00' },
    ])
    expect(rows(draft, 13)).toEqual([
      { code: 'A', description: 'Cash contributions', amount: '91.00' },
      { code: 'H', description: 'INVESTMENT INTEREST EXPENSE', amount: '15423.00' },
      { code: 'L', description: 'OTHER PORTFOLIO DEDUCTIONS', amount: '1.00' },
      { code: 'W', description: 'OTHER DEDUCTIONS', amount: '106376.00' },
    ])
    expect(rows(draft, 17)).toHaveLength(5)
    expect(rows(draft, 20)).toHaveLength(5)
    expect(draft.values.find(v => v.canonicalPath === 'official.tax_period_beginning')?.normalizedValue).toBe('2019-01-01')
    expect(draft.validationIssues).toEqual([])
    expect(draft.evidence.some(evidence => evidence.page === 4)).toBe(true)
  })

  it('maps the reviewed packet to exactly -62170, with distributions and Box 18 handled separately', () => {
    const data = packet()
    // The older LIVE blueprint emits a scalar from 11A, omitting other codes.
    Object.assign(data.outputSegments[0].customOutput.inference_result, { calculation__box_11_other_income_loss: 4597 })
    const draft = mapBdaResult(data)
    expect(draft.values.some(value => value.canonicalPath === 'calculation.box_11_other_income_loss')).toBe(false)
    const mapped = mapReviewedK1ApplicationValues(draft.values.map(value => ({
      id: value.occurrenceId, reviewStatus: 'ACCEPTED', canonicalPath: value.canonicalPath,
      normalizedValueJson: value.normalizedValue, destinationKind: value.destination?.kind, destinationKey: value.destination?.key,
    })) as DurableK1FieldValueRecord[])
    const input: TrackerYearInput = { id: 'historical', taxYear: 2019, revision: 1, status: 'IMPORTED',
      values: Object.fromEntries(mapped.filter(v => v.destinationKind === 'CALCULATION').map(v => [v.destinationKey, moneyToCents(String(v.value))])),
      officialFormData: Object.fromEntries(mapped.filter(v => v.destinationKind === 'OFFICIAL').map(v => [v.destinationKey, v.value])),
    }
    const result = calculateTrackerYear(input)
    expect(result.sectionL).toMatchObject({ partThreeIncome: '60027.00', partThreeDeductions: '122197.00', historicalForeignTaxes: '306.00', calculatedNetIncome: '-62170.00', reportedNetIncome: '-47.00' })
    expect(result.basis.distributionDecrease).toBe('85995.00')
    expect(result.basis.nondeductibleExpenses).toBe('271.00')
    expect(result.basis.inferredNondeductibleExpenses).toBe('0.00')
    expect(result.checks.some(c => ['section-l-net-income', 'section-l-ending', 'book-tax-unexplained'].includes(c.key))).toBe(false)
    for (const taxYear of [2021, 2025]) {
      const modern = calculateTrackerYear({ ...input, taxYear })
      expect(modern.sectionL.historicalForeignTaxes).toBe('0.00')
      expect(modern.sectionL.calculatedNetIncome).toBe('-62135.00')
      expect(modern.checks.find(c => c.key === 'section-l-net-income')?.status).toBe('FAIL')
    }
  })

  it.each(['2019', 2019, ' 2019 '])('defaults the year-only date %s to January 1', value => {
    expect(normalizeK1ExtractedValue('official.tax_period_beginning', 'DATE', value)).toEqual({ value: '2019-01-01' })
  })
  it('preserves fiscal dates and rejects malformed dates', () => {
    expect(normalizeK1ExtractedValue('official.tax_period_beginning', 'DATE', '7/1/2019').value).toBe('2019-07-01')
    expect(normalizeK1ExtractedValue('official.tax_period_beginning', 'DATE', '2019-02-30').issue?.severity).toBe('HIGH')
  })
})
