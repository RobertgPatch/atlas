import type { K1TrackerCalculation, K1TrackerYearDetail } from '../../../../../packages/types/src/k1-tracker'

const currency = (value: unknown) => typeof value === 'string' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value)) : 'not available'
const sourceText = (detail: K1TrackerYearDetail, fieldKeys: string[]) => {
  const sources = detail.values.filter((value) => fieldKeys.includes(value.fieldKey) && value.amount != null)
  return sources.length ? sources.map((value) => `${value.sourceType.replaceAll('_', ' ')}${value.sourceSheet ? ` - ${value.sourceSheet}${value.sourceCell ? `!${value.sourceCell}` : ''}` : ''}`).join('; ') : 'Calculated or carried forward'
}

export function OutsideBasisPanel({ calculation, detail }: { calculation: K1TrackerCalculation; detail: K1TrackerYearDetail }) {
  const inferredNondeductibleExpenses = calculation.basis.inferredNondeductibleExpenses
  const rows: Array<[string, unknown, string[]]> = [
    ['Beginning basis', calculation.basis.beginningOutsideBasis, ['opening_outside_basis']],
    ['Contributions', calculation.basis.contributions, ['capital_contributions']],
    ['Income increases', calculation.basis.incomeIncrease, ['box_1_ordinary_income_loss', 'box_2_net_rental_real_estate_income_loss', 'box_3_other_net_rental_income_loss', 'box_4c_guaranteed_payments', 'box_5_interest_income', 'box_6a_ordinary_dividends', 'box_7_royalties', 'box_8_net_short_term_capital_gain_loss', 'box_9a_net_long_term_capital_gain_loss', 'box_10_net_section_1231_gain_loss', 'box_11_other_income_loss', 'box_18b_tax_exempt_income']],
    ['Cash and property distributions', calculation.distribution.cashOrPropertyDistribution, ['box_19_distributions']],
    ['Nondeductible expenses', calculation.basis.nondeductibleExpenses, ['box_18c_nondeductible_expenses']],
    ['Allowed losses', calculation.lossLimitation.allowedLoss, ['opening_suspended_loss', 'box_1_ordinary_income_loss', 'box_2_net_rental_real_estate_income_loss', 'box_3_other_net_rental_income_loss', 'box_8_net_short_term_capital_gain_loss', 'box_9a_net_long_term_capital_gain_loss', 'box_10_net_section_1231_gain_loss', 'box_12_section_179_deduction', 'box_13_other_deductions', 'box_18a_nondeductible_expenses', 'box_21_foreign_taxes']],
    ['Ending outside basis', calculation.basis.endingOutsideBasis, []],
  ]
  const allocations = Array.isArray(calculation.lossLimitation.allocations) ? calculation.lossLimitation.allocations : []
  const warnings = calculation.checks.filter((check) => check.status !== 'PASS' && (check.key.includes('basis') || check.key.includes('distribution') || check.key.includes('loss')))
  return <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-gray-950">Outside basis rollforward</h3><p className="mt-1 text-sm text-gray-600">Trace each movement to its entered source. Item K liabilities are reference-only and excluded from this rollforward.</p><div className="mt-3 divide-y divide-gray-100">{rows.map(([label, value, fields]) => <div key={label} className="py-2"><div className="flex justify-between gap-4 text-sm"><span className="text-gray-600">{label}</span><span className="font-medium text-gray-900">{currency(value)}</span></div><p className="mt-1 text-xs text-gray-500">{label === 'Nondeductible expenses' && inferredNondeductibleExpenses !== '0.00' ? 'Inferred from matching Section L and book-tax variances' : fields.length ? sourceText(detail, fields) : 'Authoritative tracker calculation'}</p></div>)}</div>{allocations.length > 0 && <div className="mt-4 border-t border-gray-100 pt-3"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Loss limitation allocation</p>{allocations.map((item) => <div key={String(item.key)} className="mt-2 flex justify-between gap-3 text-xs"><span className="capitalize">{String(item.key).replaceAll('-', ' ')}</span><span>Allowed {currency(item.allowed)} - Suspended {currency(item.suspended)}</span></div>)}</div>}{warnings.length > 0 && <div className="mt-4 rounded-lg bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Basis checks needing attention</p>{warnings.map((warning) => <p key={warning.key} className="mt-1 text-xs text-amber-800">{warning.message}</p>)}</div>}</div>
}
