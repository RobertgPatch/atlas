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

  it('keeps liabilities as reference-only values outside the distribution limit', () => {
    const result = calculateTrackerYear({ id: 'year-2024', taxYear: 2024, revision: 1, status: 'IMPORTED', values: values({ opening_outside_basis: '100.00', liability_nonrecourse_beginning: '50.00', liability_nonrecourse_ending: '0.00', box_19_distributions: '75.00', section_l_beginning_capital: '100.00', section_l_current_year_net_income_loss: '0.00', section_l_ending_capital: '100.00', book_capital_account: '100.00' }) })
    expect(result.distribution.liabilityRelief).toBe('0.00')
    expect(result.distribution.taxableExcessDistribution).toBe('0.00')
    expect(result.basis.endingOutsideBasis).toBe('25.00')
    expect(result.checks.some((check) => check.key.includes('liability'))).toBe(false)
  })

  it('uses the canonical contribution once and falls back to the legacy value only when needed', () => {
    const canonical = calculateTrackerYear({ id: 'canonical', taxYear: 2024, revision: 1, status: 'IN_PROGRESS', values: values({ opening_outside_basis: '0.00', capital_contributions: '20.00', section_l_capital_contributed: '50.00' }) })
    const legacy = calculateTrackerYear({ id: 'legacy', taxYear: 2024, revision: 1, status: 'IN_PROGRESS', values: values({ opening_outside_basis: '0.00', section_l_capital_contributed: '30.00' }) })
    expect(canonical.basis.contributions).toBe('20.00')
    expect(canonical.sectionL.reportedContributions).toBe('20.00')
    expect(legacy.basis.contributions).toBe('30.00')
  })

  it('projects comparison cash values with canonical, absolute, zero, and null semantics', () => {
    const canonical = calculateTrackerYear({ id: 'canonical-summary', taxYear: 2024, revision: 1, status: 'IN_PROGRESS', values: values({ capital_contributions: '0.00', section_l_capital_contributed: '50.00', box_19_distributions: '-25.00' }) })
    const legacy = calculateTrackerYear({ id: 'legacy-summary', taxYear: 2023, revision: 1, status: 'IN_PROGRESS', values: values({ section_l_capital_contributed: '30.00' }) })
    const cleared = calculateTrackerYear({ id: 'cleared-summary', taxYear: 2022, revision: 1, status: 'IN_PROGRESS', values: { capital_contributions: null, section_l_capital_contributed: 5000n, box_19_distributions: null } })

    expect(canonical.summary).toMatchObject({ capitalContributed: '0.00', distributions: '25.00' })
    expect(legacy.summary).toMatchObject({ capitalContributed: '30.00', distributions: null })
    expect(cleared.summary).toMatchObject({ capitalContributed: null, distributions: null })
  })

  it('uses split Line 13 fields exactly once with a presence-based legacy fallback', () => {
    const legacy = calculateTrackerYear({ id: 'legacy-line-13', taxYear: 2022, revision: 1, status: 'IN_PROGRESS', values: values({ opening_outside_basis: '100.00', box_13_other_deductions: '50.00' }) })
    const split = calculateTrackerYear({ id: 'split-line-13', taxYear: 2023, revision: 1, status: 'IN_PROGRESS', values: values({ opening_outside_basis: '100.00', box_13_other_deductions: '999.00', box_13_other_portfolio_deductions: '30.00', box_13_management_fees: '20.00' }) })
    const cleared = calculateTrackerYear({ id: 'cleared-line-13', taxYear: 2024, revision: 1, status: 'IN_PROGRESS', values: { opening_outside_basis: 10000n, box_13_other_deductions: 5000n, box_13_management_fees: null } as any })

    expect(legacy.basis.deductions).toBe('50.00')
    expect(split.basis.deductions).toBe('50.00')
    expect(split.lossLimitation.deductions).toBe('50.00')
    expect(cleared.basis.deductions).toBe('0.00')
    expect(split.calculationVersion).toContain('split-line-13')
  })

  it('treats Box 18B tax-exempt income as a basis-only permanent difference', () => {
    const result = calculateTrackerYear({
      id: 'tax-exempt-income', taxYear: 2024, revision: 1, status: 'IN_PROGRESS',
      values: values({
        opening_outside_basis: '1000.00',
        box_1_ordinary_income_loss: '-100.00',
        box_18b_tax_exempt_income: '642.00',
        section_l_beginning_capital: '1000.00',
        section_l_current_year_net_income_loss: '-100.00',
        section_l_ending_capital: '900.00',
        book_capital_account: '900.00',
      }),
    })

    expect(result.basis.endingOutsideBasis).toBe('1542.00')
    expect(result.sectionL.calculatedNetIncome).toBe('-100.00')
    expect(result.sectionL.calculatedEnding).toBe('900.00')
    expect(result.bookTax.taxExemptIncomeBasisDifference).toBe('-642.00')
    expect(result.bookTax.unexplainedVariance).toBe('0.00')
    expect(result.checks.find((check) => check.key === 'section-l-net-income')?.status).toBe('PASS')
    expect(result.checks.find((check) => check.key === 'section-l-ending')?.status).toBe('PASS')
    expect(result.checks.find((check) => check.key === 'book-tax-unexplained')?.status).toBe('PASS')
    expect(result.checks.every((check) => check.status === 'PASS')).toBe(true)
    expect(result.summary.status).toBe('RECONCILED')
  })

  it('reduces basis and Section L capital for Box 18C nondeductible expenses', () => {
    const result = calculateTrackerYear({
      id: 'box-18c-nondeductible-expense', taxYear: 2022, revision: 1, status: 'IMPORTED',
      values: values({
        opening_outside_basis: '1932344.00',
        box_1_ordinary_income_loss: '-57343.00',
        box_5_interest_income: '1996.00',
        box_13_other_deductions: '855.00',
        box_18c_nondeductible_expenses: '642.00',
        box_19_distributions: '190773.00',
        section_l_beginning_capital: '1932344.00',
        section_l_current_year_net_income_loss: '-56844.00',
        section_l_withdrawals_distributions: '-190773.00',
        section_l_ending_capital: '1684727.00',
        book_capital_account: '1684727.00',
      }),
    })

    expect(result.basis.nondeductibleExpenses).toBe('642.00')
    expect(result.basis.inferredNondeductibleExpenses).toBe('0.00')
    expect(result.basis.endingOutsideBasis).toBe('1684727.00')
    expect(result.sectionL.calculatedNetIncome).toBe('-56844.00')
    expect(result.sectionL.reportedWithdrawals).toBe('-190773.00')
    expect(result.sectionL.calculatedEnding).toBe('1684727.00')
    expect(result.bookTax.unexplainedVariance).toBe('0.00')
    expect(result.lossLimitation.cumulativeSuspendedLoss).toBe('0.00')
    expect(result.checks.every((check) => check.status === 'PASS')).toBe(true)
    expect(result.summary.status).toBe('RECONCILED')
  })

  it('reconciles the 2025 AC Bell Section L after attached Line 13 deductions are included', () => {
    const result = calculateTrackerYear({
      id: 'ac-bell-2025', taxYear: 2025, revision: 1, status: 'IMPORTED',
      values: values({
        opening_outside_basis: '1144214.00',
        box_1_ordinary_income_loss: '-173653.00',
        box_5_interest_income: '7469.00',
        box_10_net_section_1231_gain_loss: '-22899.00',
        box_13_other_deductions: '3226.00',
        box_18c_nondeductible_expenses: '296.00',
        box_19_distributions: '255786.00',
        section_l_beginning_capital: '1144214.00',
        section_l_current_year_net_income_loss: '-192605.00',
        section_l_withdrawals_distributions: '-255786.00',
        section_l_ending_capital: '695823.00',
        book_capital_account: '695823.00',
      }),
    })

    expect(result.sectionL.calculatedNetIncome).toBe('-192605.00')
    expect(result.sectionL.calculatedEnding).toBe('695823.00')
    expect(result.basis.endingOutsideBasis).toBe('695823.00')
    expect(result.bookTax.unexplainedVariance).toBe('0.00')
    expect(result.checks.every((check) => check.status === 'PASS')).toBe(true)
    expect(result.summary.status).toBe('RECONCILED')
  })

  it('infers a missing Box 18C nondeductible expense from matching reconciliation variances', () => {
    const result = calculateTrackerYear({
      id: 'inferred-box-18c-nondeductible-expense', taxYear: 2022, revision: 1, status: 'IMPORTED',
      values: values({
        opening_outside_basis: '1932344.00',
        box_1_ordinary_income_loss: '-57343.00',
        box_5_interest_income: '1996.00',
        box_13_other_deductions: '855.00',
        box_19_distributions: '190773.00',
        section_l_beginning_capital: '1932344.00',
        section_l_current_year_net_income_loss: '-56844.00',
        section_l_withdrawals_distributions: '-190773.00',
        section_l_ending_capital: '1684727.00',
        book_capital_account: '1684727.00',
      }),
    })

    expect(result.basis.inferredNondeductibleExpenses).toBe('642.00')
    expect(result.basis.endingOutsideBasis).toBe('1684727.00')
    expect(result.sectionL.calculatedNetIncome).toBe('-56844.00')
    expect(result.bookTax.unexplainedVariance).toBe('0.00')
    expect(result.checks.every((check) => check.status === 'PASS')).toBe(true)
    expect(result.summary.status).toBe('RECONCILED')
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

  it('identifies missing beginning capital when a reported Section L ending was imported', () => {
    const result = calculateTrackerYear({
      id: 'ac-bell-2021', taxYear: 2021, revision: 1, status: 'IMPORTED',
      values: values({
        opening_outside_basis: '0.00',
        capital_contributions: '3000000.00',
        box_1_ordinary_income_loss: '-1067656.00',
        section_l_current_year_net_income_loss: '-1067656.00',
        section_l_withdrawals_distributions: '0.00',
        section_l_ending_capital: '1932344.00',
      }),
    })

    expect(result.checks.find((check) => check.key === 'section-l-ending')).toMatchObject({
      status: 'INCOMPLETE',
      actual: '1932344.00',
      expected: null,
      difference: null,
      message: 'Section L ending capital was imported, but beginning capital is missing.',
    })
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
      expect(result.calculationVersion).toBe('irs-k1-basis-v8-split-line-13-signed-section-l-withdrawals')
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
