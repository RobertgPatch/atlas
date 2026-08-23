import type {
  K1TrackerCalculation,
  K1TrackerCheckResult,
  K1TrackerFieldKey,
  K1TrackerJournalEntry,
  K1TrackerMoney,
  K1TrackerYearSummary,
} from './k1-tracker.contracts.js'
import { K1_TRACKER_CALCULATION_VERSION } from './k1-tracker.field-map.js'
import type { TrackerYearInput } from './k1-tracker.types.js'

const CENT = 100n
const TOLERANCE = 100n
const zero = 0n

export const moneyToCents = (value: string | number | bigint | null | undefined): bigint | null => {
  if (value == null || value === '') return null
  if (typeof value === 'bigint') return value
  const raw = String(value).trim().replace(/[$,\s]/g, '').replace(/^\((.+)\)$/, '-$1')
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) return null
  const negative = raw.startsWith('-')
  const normalized = negative ? raw.slice(1) : raw
  const [whole, fractional = ''] = normalized.split('.')
  const cents = BigInt(whole) * CENT + BigInt((fractional + '00').slice(0, 2))
  return negative ? -cents : cents
}

export const centsToMoney = (cents: bigint | null | undefined): K1TrackerMoney | null => {
  if (cents == null) return null
  const sign = cents < zero ? '-' : ''
  const absolute = cents < zero ? -cents : cents
  return `${sign}${absolute / CENT}.${String(absolute % CENT).padStart(2, '0')}`
}

const amount = (values: Partial<Record<K1TrackerFieldKey, bigint | null>>, key: K1TrackerFieldKey): bigint =>
  values[key] ?? zero

const positive = (value: bigint) => (value > zero ? value : zero)
const negativeMagnitude = (value: bigint) => (value < zero ? -value : zero)
const absolute = (value: bigint) => (value < zero ? -value : value)

const sectionLIncomeKeys: K1TrackerFieldKey[] = [
  'box_1_ordinary_income_loss',
  'box_2_net_rental_real_estate_income_loss',
  'box_3_other_net_rental_income_loss',
  'box_4c_guaranteed_payments',
  'box_5_interest_income',
  'box_6a_ordinary_dividends',
  'box_7_royalties',
  'box_8_net_short_term_capital_gain_loss',
  'box_9a_net_long_term_capital_gain_loss',
  'box_10_net_section_1231_gain_loss',
  'box_11_other_income_loss',
]

const deductionKeys: K1TrackerFieldKey[] = [
  'box_12_section_179_deduction',
  'box_18a_nondeductible_expenses',
  'box_21_foreign_taxes',
]

const sum = (values: bigint[]) => values.reduce((total, item) => total + item, zero)

const allocateLossPool = (
  categories: Array<{ key: string; amount: bigint }>,
  allowed: bigint,
) => {
  const total = sum(categories.map((category) => category.amount))
  if (total === zero || allowed === zero) {
    return categories.map((category) => ({ ...category, allowed: zero, suspended: category.amount }))
  }
  let remaining = allowed
  return categories.map((category, index) => {
    const allocated = index === categories.length - 1
      ? remaining
      : (category.amount * allowed) / total
    remaining -= allocated
    return { ...category, allowed: allocated, suspended: category.amount - allocated }
  })
}

const check = (
  key: string,
  status: K1TrackerCheckResult['status'],
  message: string,
  actual?: bigint | null,
  expected?: bigint | null,
  difference?: bigint | null,
  tolerance: bigint | null = TOLERANCE,
): K1TrackerCheckResult => ({
  key,
  status,
  message,
  actual: centsToMoney(actual),
  expected: centsToMoney(expected),
  difference: centsToMoney(difference),
  tolerance: centsToMoney(tolerance),
})

const statusForChecks = (checks: K1TrackerCheckResult[], hasValues: boolean): K1TrackerYearSummary['status'] => {
  if (checks.some((item) => item.status === 'INCOMPLETE')) return hasValues ? 'IN_PROGRESS' : 'NOT_STARTED'
  if (checks.some((item) => item.status === 'FAIL')) return 'NEEDS_REVIEW'
  if (checks.some((item) => item.status === 'WARNING')) return 'NEEDS_REVIEW'
  return 'RECONCILED'
}

export const calculateTrackerYear = (
  year: TrackerYearInput,
  previous?: {
    endingOutsideBasis: bigint
    cumulativeSuspendedLoss: bigint
    sectionLEndingCapital: bigint | null
    liabilities: { nonrecourse: bigint; qualifiedNonrecourse: bigint; recourse: bigint }
  },
): K1TrackerCalculation => {
  const values = year.values
  const carriedBeginning = previous?.endingOutsideBasis ?? zero
  const beginningOutsideBasis = values.opening_outside_basis ?? carriedBeginning
  const priorSuspendedLoss = values.opening_suspended_loss ?? previous?.cumulativeSuspendedLoss ?? zero

  const nonrecourseBeginning = values.liability_nonrecourse_beginning ?? previous?.liabilities.nonrecourse ?? zero
  const qualifiedBeginning = values.liability_qualified_nonrecourse_beginning ?? previous?.liabilities.qualifiedNonrecourse ?? zero
  const recourseBeginning = values.liability_recourse_beginning ?? previous?.liabilities.recourse ?? zero
  const nonrecourseEnding = amount(values, 'liability_nonrecourse_ending')
  const qualifiedEnding = amount(values, 'liability_qualified_nonrecourse_ending')
  const recourseEnding = amount(values, 'liability_recourse_ending')
  const totalLiabilityBeginning = nonrecourseBeginning + qualifiedBeginning + recourseBeginning
  const totalLiabilityEnding = nonrecourseEnding + qualifiedEnding + recourseEnding
  const liabilityChange = totalLiabilityEnding - totalLiabilityBeginning
  // Item K liabilities remain visible for manual handling, but this calculation
  // version intentionally excludes them from basis, distribution, and workflow math.
  const liabilityIncrease = zero
  const liabilityDecrease = zero

  const contributions = Object.hasOwn(values, 'capital_contributions')
    ? values.capital_contributions ?? zero
    : values.section_l_capital_contributed ?? zero
  const sectionLIncomeEffects = sectionLIncomeKeys.map((key) => amount(values, key))
  // Tax-exempt income increases outside basis but is not Section L book income.
  const taxExemptIncome = positive(amount(values, 'box_18b_tax_exempt_income'))
  const enteredNondeductibleExpenses = values.box_18c_nondeductible_expenses == null
    ? null
    : absolute(values.box_18c_nondeductible_expenses)
  const incomeIncrease = sum(sectionLIncomeEffects.map(positive)) + taxExemptIncome
  const currentLosses = sum(sectionLIncomeEffects.map(negativeMagnitude))
  const effectiveLine13 = Object.hasOwn(values, 'box_13_other_portfolio_deductions') || Object.hasOwn(values, 'box_13_management_fees')
    ? absolute(amount(values, 'box_13_other_portfolio_deductions')) + absolute(amount(values, 'box_13_management_fees'))
    : absolute(amount(values, 'box_13_other_deductions'))
  const deductions = sum(deductionKeys.map((key) => absolute(amount(values, key)))) + effectiveLine13
  const calculatedNetIncomeBeforeNondeductibleExpenses = sum(sectionLIncomeEffects) - deductions
  const distributions = absolute(amount(values, 'box_19_distributions'))
  const totalIncreases = contributions + incomeIncrease
  const basisAfterIncreases = beginningOutsideBasis + totalIncreases
  const distributionDecrease = distributions
  const taxableExcessDistribution = positive(distributionDecrease - positive(basisAfterIncreases))
  const basisAfterDistributions = positive(basisAfterIncreases - distributionDecrease)
  const totalLossPool = priorSuspendedLoss + currentLosses + deductions
  const allowedLossBeforeNondeductibleExpenses = totalLossPool < basisAfterDistributions ? totalLossPool : basisAfterDistributions
  const endingOutsideBasisBeforeNondeductibleExpenses = basisAfterDistributions - allowedLossBeforeNondeductibleExpenses

  const sectionLBeginning = values.section_l_beginning_capital ?? previous?.sectionLEndingCapital ?? null
  const sectionLContributions = contributions
  const sectionLNetIncome = values.section_l_current_year_net_income_loss ?? null
  const sectionLOther = amount(values, 'section_l_other_increase_decrease')
  const sectionLWithdrawals = amount(values, 'section_l_withdrawals_distributions')
  const sectionLEnding = values.section_l_ending_capital ?? null
  const bookCapital = values.book_capital_account ?? sectionLEnding
  const inferredNondeductibleExpenses = (() => {
    if (enteredNondeductibleExpenses != null || sectionLBeginning == null || sectionLNetIncome == null || sectionLEnding == null || bookCapital == null) return zero
    const inferredAmount = calculatedNetIncomeBeforeNondeductibleExpenses - sectionLNetIncome
    const calculatedSectionLEndingBeforeNondeductibleExpenses = sectionLBeginning + sectionLContributions + calculatedNetIncomeBeforeNondeductibleExpenses + sectionLOther + sectionLWithdrawals
    const sectionLEndingVariance = calculatedSectionLEndingBeforeNondeductibleExpenses - sectionLEnding
    const bookTaxVariance = endingOutsideBasisBeforeNondeductibleExpenses - bookCapital
    const canApplyWithoutChangingLossLimit = basisAfterDistributions >= totalLossPool + inferredAmount
    return inferredAmount > TOLERANCE
      && absolute(sectionLEndingVariance - inferredAmount) <= TOLERANCE
      && absolute(bookTaxVariance - inferredAmount) <= TOLERANCE
      && canApplyWithoutChangingLossLimit
      ? inferredAmount
      : zero
  })()
  // Box 18C is a nondeductible expense: it reduces capital and tax basis but
  // never enters the deductible-loss pool or creates a suspended deduction.
  const nondeductibleExpenses = enteredNondeductibleExpenses ?? inferredNondeductibleExpenses
  const basisAfterNondeductibleExpenses = positive(basisAfterDistributions - nondeductibleExpenses)
  const allowedLoss = totalLossPool < basisAfterNondeductibleExpenses ? totalLossPool : basisAfterNondeductibleExpenses
  const cumulativeSuspendedLoss = totalLossPool - allowedLoss
  const lossAllocations = allocateLossPool([
    { key: 'prior-suspended-loss', amount: priorSuspendedLoss },
    { key: 'current-k1-losses', amount: currentLosses },
    { key: 'deductions', amount: deductions },
  ], allowedLoss)
  const endingOutsideBasis = basisAfterNondeductibleExpenses - allowedLoss
  const endingBeforeLimit = beginningOutsideBasis + totalIncreases - currentLosses - deductions - nondeductibleExpenses - distributionDecrease

  const calculatedNetIncome = calculatedNetIncomeBeforeNondeductibleExpenses - nondeductibleExpenses
  const calculatedSectionLEnding = sectionLBeginning == null
    ? null
    : sectionLBeginning + sectionLContributions + calculatedNetIncome + sectionLOther + sectionLWithdrawals
  const sectionLBeginningDifference = sectionLBeginning == null ? null : sectionLBeginning - (previous?.sectionLEndingCapital ?? sectionLBeginning)
  const sectionLContributionDifference = zero
  const sectionLNetIncomeDifference = sectionLNetIncome == null ? null : sectionLNetIncome - calculatedNetIncome
  const sectionLEndingDifference = sectionLEnding == null || calculatedSectionLEnding == null
    ? null
    : sectionLEnding - calculatedSectionLEnding

  const bookTaxDifference = bookCapital == null ? null : bookCapital - endingOutsideBasis
  const manualReconTotal = sum([
    amount(values, 'recon_section_704c'),
    amount(values, 'recon_section_754'),
    amount(values, 'recon_timing_differences'),
    amount(values, 'recon_other_permanent_differences'),
  ])
  const taxExemptIncomeBasisDifference = -taxExemptIncome
  const reconTotal = manualReconTotal + taxExemptIncomeBasisDifference
  const unexplainedVariance = bookTaxDifference == null ? null : bookTaxDifference - reconTotal

  const interestAdjustment = amount(values, 'box_5_interest_income') - amount(values, 'book_interest_income')
  const dividendAdjustment = amount(values, 'box_6a_ordinary_dividends') - amount(values, 'book_dividend_income')
  const taxCapital = amount(values, 'box_8_net_short_term_capital_gain_loss') + amount(values, 'box_9a_net_long_term_capital_gain_loss') + amount(values, 'box_10_net_section_1231_gain_loss')
  const capitalAdjustment = taxCapital - amount(values, 'book_realized_capital_gain_loss')
  const taxGeneral = amount(values, 'box_1_ordinary_income_loss') + amount(values, 'box_2_net_rental_real_estate_income_loss') + amount(values, 'box_3_other_net_rental_income_loss') + amount(values, 'box_4c_guaranteed_payments') + amount(values, 'box_7_royalties') + amount(values, 'box_11_other_income_loss') - deductions - nondeductibleExpenses
  const generalAdjustment = taxGeneral - amount(values, 'book_other_partnership_income_loss')
  const investmentAdjustment = -(interestAdjustment + dividendAdjustment + capitalAdjustment + generalAdjustment)
  const journalEntries: K1TrackerJournalEntry[] = [
    { account: 'Interest Income', amount: centsToMoney(interestAdjustment)!, convention: 'DEBIT_POSITIVE_CREDIT_NEGATIVE' },
    { account: 'Dividend Income', amount: centsToMoney(dividendAdjustment)!, convention: 'DEBIT_POSITIVE_CREDIT_NEGATIVE' },
    { account: 'Realized Capital Gains/Losses', amount: centsToMoney(capitalAdjustment)!, convention: 'DEBIT_POSITIVE_CREDIT_NEGATIVE' },
    { account: 'Partnership Income - General', amount: centsToMoney(generalAdjustment)!, convention: 'DEBIT_POSITIVE_CREDIT_NEGATIVE' },
    { account: 'Investment in Partnership', amount: centsToMoney(investmentAdjustment)!, convention: 'DEBIT_POSITIVE_CREDIT_NEGATIVE' },
  ]
  const journalBalance = sum([interestAdjustment, dividendAdjustment, capitalAdjustment, generalAdjustment, investmentAdjustment])

  const requiredPresent = values.opening_outside_basis != null || previous != null
  const checks: K1TrackerCheckResult[] = [
    check('required-source-data', requiredPresent ? 'PASS' : 'INCOMPLETE', requiredPresent ? 'Opening basis is available.' : 'Enter opening outside basis or add a prior year.'),
    check('basis-continuity', previous == null || values.opening_outside_basis == null || values.opening_outside_basis === previous.endingOutsideBasis ? 'PASS' : 'WARNING', previous == null || values.opening_outside_basis == null || values.opening_outside_basis === previous.endingOutsideBasis ? 'Beginning basis is continuous.' : 'Opening basis differs from the prior ending basis.', values.opening_outside_basis ?? null, previous?.endingOutsideBasis ?? null, previous == null || values.opening_outside_basis == null ? null : values.opening_outside_basis - previous.endingOutsideBasis),
    check('negative-before-limit-basis', endingBeforeLimit < zero ? 'WARNING' : 'PASS', endingBeforeLimit < zero ? 'Basis is limited to zero before loss deductions.' : 'Basis remains nonnegative before limitations.', endingBeforeLimit),
    check('suspended-losses', cumulativeSuspendedLoss > zero ? 'WARNING' : 'PASS', cumulativeSuspendedLoss > zero ? 'Losses or deductions remain suspended.' : 'No suspended losses or deductions remain.', cumulativeSuspendedLoss),
    check('taxable-excess-distribution', taxableExcessDistribution > zero ? 'WARNING' : 'PASS', taxableExcessDistribution > zero ? 'Distributions exceed available basis.' : 'No taxable excess distribution.', taxableExcessDistribution),
    check('section-l-net-income', sectionLNetIncomeDifference == null ? 'INCOMPLETE' : absolute(sectionLNetIncomeDifference) <= TOLERANCE ? 'PASS' : 'FAIL', sectionLNetIncomeDifference == null ? 'Section L current-year net income is missing.' : absolute(sectionLNetIncomeDifference) <= TOLERANCE ? 'Section L net income ties to calculated K-1 activity.' : 'Section L net income differs from calculated K-1 activity.', sectionLNetIncome, calculatedNetIncome, sectionLNetIncomeDifference),
    check(
      'section-l-ending',
      sectionLEnding == null || calculatedSectionLEnding == null
        ? 'INCOMPLETE'
        : absolute(sectionLEndingDifference!) <= TOLERANCE ? 'PASS' : 'FAIL',
      sectionLEnding == null
        ? 'Section L ending capital is missing.'
        : calculatedSectionLEnding == null
          ? 'Section L ending capital was imported, but beginning capital is missing.'
          : absolute(sectionLEndingDifference!) <= TOLERANCE
            ? 'Section L ending capital reconciles.'
            : 'Section L ending capital variance exceeds $1.',
      sectionLEnding,
      calculatedSectionLEnding,
      sectionLEndingDifference,
    ),
    check('book-tax-unexplained', unexplainedVariance == null ? 'INCOMPLETE' : absolute(unexplainedVariance) <= TOLERANCE ? 'PASS' : 'FAIL', unexplainedVariance == null ? 'Book capital is incomplete.' : absolute(unexplainedVariance) <= TOLERANCE ? 'Book-tax difference is explained.' : 'Book-tax unexplained variance exceeds $1.', bookTaxDifference, reconTotal, unexplainedVariance),
    check('journal-balance', absolute(journalBalance) <= TOLERANCE ? 'PASS' : 'FAIL', absolute(journalBalance) <= TOLERANCE ? 'Journal entry balances.' : 'Journal entry does not balance to zero.', journalBalance, zero, journalBalance),
  ]

  const warningCount = checks.filter((item) => item.status === 'WARNING' || item.status === 'FAIL' || item.status === 'INCOMPLETE').length
  const status = statusForChecks(checks, Object.values(values).some((value) => value != null))
  const summary: K1TrackerYearSummary = {
    taxYear: year.taxYear,
    status,
    revision: year.revision,
    capitalContributed: Object.hasOwn(values, 'capital_contributions')
      ? centsToMoney(values.capital_contributions)
      : Object.hasOwn(values, 'section_l_capital_contributed')
        ? centsToMoney(values.section_l_capital_contributed)
        : null,
    distributions: Object.hasOwn(values, 'box_19_distributions')
      ? centsToMoney(values.box_19_distributions == null ? null : absolute(values.box_19_distributions))
      : null,
    endingOutsideBasis: centsToMoney(endingOutsideBasis),
    cumulativeSuspendedLoss: centsToMoney(cumulativeSuspendedLoss),
    taxableExcessDistribution: centsToMoney(taxableExcessDistribution),
    sectionLDifference: centsToMoney(sectionLEndingDifference),
    warningCount,
    sourceConflictCount: 0,
  }

  return {
    calculationVersion: K1_TRACKER_CALCULATION_VERSION,
    summary,
    basis: {
      beginningOutsideBasis: centsToMoney(beginningOutsideBasis), contributions: centsToMoney(contributions), incomeIncrease: centsToMoney(incomeIncrease), liabilityIncrease: centsToMoney(liabilityIncrease), totalIncreases: centsToMoney(totalIncreases), distributionDecrease: centsToMoney(distributionDecrease), currentLosses: centsToMoney(currentLosses), deductions: centsToMoney(deductions), nondeductibleExpenses: centsToMoney(nondeductibleExpenses), inferredNondeductibleExpenses: centsToMoney(inferredNondeductibleExpenses), endingBeforeLimit: centsToMoney(endingBeforeLimit), endingOutsideBasis: centsToMoney(endingOutsideBasis),
    },
    lossLimitation: { priorSuspendedLoss: centsToMoney(priorSuspendedLoss), currentLosses: centsToMoney(currentLosses), deductions: centsToMoney(deductions), totalLossPool: centsToMoney(totalLossPool), basisAvailableForLosses: centsToMoney(basisAfterNondeductibleExpenses), allowedLoss: centsToMoney(allowedLoss), cumulativeSuspendedLoss: centsToMoney(cumulativeSuspendedLoss), allocations: lossAllocations.map((item) => ({ key: item.key, pool: centsToMoney(item.amount), allowed: centsToMoney(item.allowed), suspended: centsToMoney(item.suspended) })) },
    distribution: { cashOrPropertyDistribution: centsToMoney(distributions), liabilityRelief: centsToMoney(liabilityDecrease), basisBeforeDistribution: centsToMoney(basisAfterIncreases), taxableExcessDistribution: centsToMoney(taxableExcessDistribution) },
    liabilities: { nonrecourseBeginning: centsToMoney(nonrecourseBeginning), nonrecourseEnding: centsToMoney(nonrecourseEnding), qualifiedNonrecourseBeginning: centsToMoney(qualifiedBeginning), qualifiedNonrecourseEnding: centsToMoney(qualifiedEnding), recourseBeginning: centsToMoney(recourseBeginning), recourseEnding: centsToMoney(recourseEnding), netChange: centsToMoney(liabilityChange) },
    sectionL: { reportedBeginning: centsToMoney(sectionLBeginning), reportedContributions: centsToMoney(sectionLContributions), reportedNetIncome: centsToMoney(sectionLNetIncome), reportedWithdrawals: centsToMoney(sectionLWithdrawals), reportedEnding: centsToMoney(sectionLEnding), calculatedNetIncome: centsToMoney(calculatedNetIncome), calculatedEnding: centsToMoney(calculatedSectionLEnding), beginningDifference: centsToMoney(sectionLBeginningDifference), contributionDifference: centsToMoney(sectionLContributionDifference), netIncomeDifference: centsToMoney(sectionLNetIncomeDifference), endingDifference: centsToMoney(sectionLEndingDifference) },
    bookTax: { endingBookCapital: centsToMoney(bookCapital), endingTaxBasis: centsToMoney(endingOutsideBasis), bookTaxDifference: centsToMoney(bookTaxDifference), section704c: centsToMoney(amount(values, 'recon_section_704c')), section754: centsToMoney(amount(values, 'recon_section_754')), timingDifferences: centsToMoney(amount(values, 'recon_timing_differences')), otherPermanentDifferences: centsToMoney(amount(values, 'recon_other_permanent_differences')), taxExemptIncomeBasisDifference: centsToMoney(taxExemptIncomeBasisDifference), totalExplainedDifference: centsToMoney(reconTotal), unexplainedVariance: centsToMoney(unexplainedVariance) },
    journalEntries,
    journalBalance: centsToMoney(journalBalance)!,
    checks,
  }
}
