import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { calculateTrackerYear, moneyToCents } from '../src/modules/k1-tracker/k1-tracker.calculation.js'
import { parseTrackerWorkbook } from '../src/modules/k1-tracker/k1-tracker.import.js'
import type { K1TrackerFieldKey } from '../src/modules/k1-tracker/k1-tracker.contracts.js'

const values = (entries: Record<string, string>) => Object.fromEntries(
  Object.entries(entries).map(([key, value]) => [key, moneyToCents(value)]),
)

describe('K1 tracker calculation', () => {
  it('limits distribution and losses without allowing negative outside basis', () => {
    const result = calculateTrackerYear({
      id: 'year-2024', taxYear: 2024, revision: 1, status: 'IMPORTED',
      values: values({ opening_outside_basis: '100.00', box_1_ordinary_income_loss: '-80.00', box_19_distributions: '75.00', section_l_beginning_capital: '100.00', section_l_current_year_net_income_loss: '-80.00', section_l_ending_capital: '-55.00', book_capital_account: '-55.00', recon_other_permanent_differences: '-55.00' }),
    })
    expect(result.basis.endingOutsideBasis).toBe('0.00')
    expect(result.distribution.taxableExcessDistribution).toBe('0.00')
    expect(result.lossLimitation.allowedLoss).toBe('25.00')
    expect(result.lossLimitation.cumulativeSuspendedLoss).toBe('55.00')
  })

  it('carries the prior ending basis and suspended losses to the next year', () => {
    const prior = calculateTrackerYear({ id: 'year-2023', taxYear: 2023, revision: 1, status: 'IMPORTED', values: values({ opening_outside_basis: '100.00', box_1_ordinary_income_loss: '-40.00', section_l_beginning_capital: '100.00', section_l_current_year_net_income_loss: '-40.00', section_l_ending_capital: '60.00', book_capital_account: '60.00', recon_other_permanent_differences: '0.00' }) })
    const current = calculateTrackerYear({ id: 'year-2024', taxYear: 2024, revision: 1, status: 'IMPORTED', values: values({ capital_contributions: '20.00', section_l_current_year_net_income_loss: '0.00', section_l_ending_capital: '80.00', book_capital_account: '80.00', recon_other_permanent_differences: '0.00' }) }, {
      endingOutsideBasis: moneyToCents(prior.summary.endingOutsideBasis)!, cumulativeSuspendedLoss: moneyToCents(prior.summary.cumulativeSuspendedLoss)!, sectionLEndingCapital: moneyToCents(prior.sectionL.reportedEnding as string), liabilities: { nonrecourse: 0n, qualifiedNonrecourse: 0n, recourse: 0n },
    })
    expect(current.basis.beginningOutsideBasis).toBe('60.00')
    expect(current.basis.endingOutsideBasis).toBe('80.00')
    expect(current.lossLimitation.cumulativeSuspendedLoss).toBe('0.00')
  })

  it('keeps journal entries balanced to exact cents', () => {
    const result = calculateTrackerYear({ id: 'year-2024', taxYear: 2024, revision: 1, status: 'IMPORTED', values: values({ opening_outside_basis: '10.00', box_5_interest_income: '12.34', book_interest_income: '10.00', section_l_beginning_capital: '10.00', section_l_current_year_net_income_loss: '12.34', section_l_ending_capital: '22.34', book_capital_account: '22.34', recon_other_permanent_differences: '12.34' }) })
    expect(result.journalBalance).toBe('0.00')
    expect(result.checks.find((check) => check.key === 'journal-balance')?.status).toBe('PASS')
  })

  it('uses liability relief in the distribution limit and reports taxable excess separately', () => {
    const result = calculateTrackerYear({ id: 'year-2024', taxYear: 2024, revision: 1, status: 'IMPORTED', values: values({ opening_outside_basis: '100.00', liability_nonrecourse_beginning: '50.00', liability_nonrecourse_ending: '0.00', box_19_distributions: '75.00', section_l_beginning_capital: '100.00', section_l_current_year_net_income_loss: '0.00', section_l_ending_capital: '100.00', book_capital_account: '100.00' }) })
    expect(result.distribution.liabilityRelief).toBe('50.00')
    expect(result.distribution.taxableExcessDistribution).toBe('25.00')
    expect(result.basis.endingOutsideBasis).toBe('0.00')
  })

  it('allocates insufficient basis proportionately across loss categories', () => {
    const result = calculateTrackerYear({ id: 'year-2024', taxYear: 2024, revision: 1, status: 'IMPORTED', values: values({ opening_outside_basis: '90.00', opening_suspended_loss: '30.00', box_1_ordinary_income_loss: '-30.00', box_12_section_179_deduction: '30.00', box_19_distributions: '60.00', section_l_beginning_capital: '90.00', section_l_current_year_net_income_loss: '-30.00', section_l_ending_capital: '0.00', book_capital_account: '0.00' }) })
    const allocations = result.lossLimitation.allocations as Array<{ key: string; allowed: string; suspended: string }>
    expect(allocations.map((allocation) => allocation.allowed)).toEqual(['10.00', '10.00', '10.00'])
    expect(allocations.map((allocation) => allocation.suspended)).toEqual(['20.00', '20.00', '20.00'])
  })

  it('accepts exactly one dollar of Section L variance but rejects a larger variance', () => {
    const base = { opening_outside_basis: '100.00', section_l_beginning_capital: '100.00', section_l_current_year_net_income_loss: '0.00', section_l_ending_capital: '101.00', book_capital_account: '100.00' }
    const oneDollar = calculateTrackerYear({ id: 'within', taxYear: 2024, revision: 1, status: 'IMPORTED', values: values(base) })
    expect(oneDollar.checks.find((check) => check.key === 'section-l-ending')?.status).toBe('PASS')
    const moreThanDollar = calculateTrackerYear({ id: 'outside', taxYear: 2024, revision: 1, status: 'IMPORTED', values: values({ ...base, section_l_ending_capital: '101.01' }) })
    expect(moreThanDollar.checks.find((check) => check.key === 'section-l-ending')?.status).toBe('FAIL')
    expect(moreThanDollar.summary.status).toBe('NEEDS_REVIEW')
  })

  it('distinguishes an explicitly reviewed zero from a missing opening basis', () => {
    const missing = calculateTrackerYear({ id: 'missing', taxYear: 2024, revision: 1, status: 'NOT_STARTED', values: {} })
    expect(missing.checks.find((check) => check.key === 'required-source-data')?.status).toBe('INCOMPLETE')
    const zero = calculateTrackerYear({ id: 'zero', taxYear: 2024, revision: 1, status: 'IMPORTED', values: { opening_outside_basis: 0n } })
    expect(zero.checks.find((check) => check.key === 'required-source-data')?.status).toBe('PASS')
  })

  it('matches the CPA workbook ending-basis regression values and corrects its inception-year net-income defect', async () => {
    const workbook = await parseTrackerWorkbook(await readFile(new URL('./fixtures/k1-tracker-basis-template.xlsx', import.meta.url)))
    const importedYears = workbook.preview.sheets[0]!.years.slice(0, 5)
    const expectedEndingBasis = ['1932344.00', '1684727.00', '1376978.00', '1144214.00', '695823.00']
    let previous: { endingOutsideBasis: bigint; cumulativeSuspendedLoss: bigint; sectionLEndingCapital: bigint | null; liabilities: { nonrecourse: bigint; qualifiedNonrecourse: bigint; recourse: bigint } } | undefined

    for (const [index, importedYear] of importedYears.entries()) {
      const importedValues = Object.fromEntries(importedYear.values
        .filter((value) => value.amount != null)
        .map((value) => [value.fieldKey, moneyToCents(value.amount)!])) as Partial<Record<K1TrackerFieldKey, bigint | null>>
      const result = calculateTrackerYear({ id: `workbook-${importedYear.taxYear}`, taxYear: importedYear.taxYear, revision: 1, status: 'IMPORTED', values: importedValues }, previous)

      expect(result.basis.endingOutsideBasis).toBe(expectedEndingBasis[index])
      expect(result.calculationVersion).toBe('irs-k1-basis-v1')
      if (importedYear.taxYear === 2021) {
        expect(result.sectionL.calculatedNetIncome).toBe('-1067656.00')
        expect(result.checks.find((check) => check.key === 'section-l-net-income')?.status).toBe('PASS')
      }
      previous = {
        endingOutsideBasis: moneyToCents(result.basis.endingOutsideBasis as string)!,
        cumulativeSuspendedLoss: moneyToCents(result.lossLimitation.cumulativeSuspendedLoss as string)!,
        sectionLEndingCapital: moneyToCents(result.sectionL.reportedEnding as string | null),
        liabilities: {
          nonrecourse: moneyToCents(result.liabilities.nonrecourseEnding as string)!,
          qualifiedNonrecourse: moneyToCents(result.liabilities.qualifiedNonrecourseEnding as string)!,
          recourse: moneyToCents(result.liabilities.recourseEnding as string)!,
        },
      }
    }
  })
})
