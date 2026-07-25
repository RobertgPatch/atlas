import type { K1TrackerCalculation, K1TrackerYearDetail } from '../../../../../packages/types/src/k1-tracker'

const currency = (value: unknown) => typeof value === 'string' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value)) : 'not available'
const stateClass = (status: string) => status === 'PASS' ? 'bg-emerald-50 text-emerald-800' : status === 'INCOMPLETE' ? 'bg-gray-100 text-gray-700' : 'bg-amber-50 text-amber-800'
const source = (detail: K1TrackerYearDetail, keys: string | string[]) => {
  const fieldKeys = Array.isArray(keys) ? keys : [keys]
  const value = fieldKeys
    .map((fieldKey) => detail.values.find((item) => item.fieldKey === fieldKey && item.amount != null))
    .find(Boolean)
  return value ? `${value.sourceType.replaceAll('_', ' ')}${value.sourceSheet ? ` - ${value.sourceSheet}${value.sourceCell ? `!${value.sourceCell}` : ''}` : ''}` : 'Calculated or not entered'
}

export function ReconciliationPanel({ calculation, detail }: { calculation: K1TrackerCalculation; detail: K1TrackerYearDetail }) {
  const section: Array<[string, unknown, string | string[] | null]> = [
    ['Reported beginning', calculation.sectionL.reportedBeginning, 'section_l_beginning_capital'],
    ['Reported capital contributed', calculation.sectionL.reportedContributions, ['section_l_capital_contributed', 'capital_contributions']],
    ['Part III calculated net income', calculation.sectionL.calculatedNetIncome, null],
    ['Reported net income', calculation.sectionL.reportedNetIncome, 'section_l_current_year_net_income_loss'],
    ['Reported withdrawals', calculation.sectionL.reportedWithdrawals, 'section_l_withdrawals_distributions'],
    ['Calculated ending', calculation.sectionL.calculatedEnding, null],
    ['Reported ending', calculation.sectionL.reportedEnding, 'section_l_ending_capital'],
    ['Ending variance', calculation.sectionL.endingDifference, null],
  ]
  const explanations: Array<[string, unknown, string | string[]]> = [['Tax-exempt income basis adjustment', calculation.bookTax.taxExemptIncomeBasisDifference, 'box_18b_tax_exempt_income'], ['Section 704(c)', calculation.bookTax.section704c, 'recon_section_704c'], ['Section 754', calculation.bookTax.section754, 'recon_section_754'], ['Timing differences', calculation.bookTax.timingDifferences, 'recon_timing_differences'], ['Other permanent differences', calculation.bookTax.otherPermanentDifferences, 'recon_other_permanent_differences']]
  const checks = calculation.checks.filter((check) => check.key.includes('section-l') || check.key.includes('book-tax') || check.key === 'journal-balance' || check.key === 'required-source-data')
  return <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-gray-950">Section L and book-tax reconciliation</h3><p className="mt-1 text-sm text-gray-600">Informational only. Differences are retained for reconciliation and never change outside basis or block sign-off.</p><div className="mt-3 divide-y divide-gray-100">{section.map(([label, value, key]) => <div key={String(label)} className="py-2"><div className="flex justify-between gap-3 text-sm"><span className="text-gray-600">{label}</span><span className="font-medium text-gray-900">{currency(value)}</span></div>{key && <p className="mt-1 text-xs text-gray-500">{source(detail, key)}</p>}</div>)}</div><div className="mt-4 border-t border-gray-100 pt-3"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Book-tax explanations</p>{explanations.map(([label, value, key]) => <div key={label} className="mt-2"><div className="flex justify-between text-sm"><span>{label}</span><span>{currency(value)}</span></div><p className="text-xs text-gray-500">{source(detail, key)}</p></div>)}<div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-sm font-medium"><span>Unexplained variance</span><span>{currency(calculation.bookTax.unexplainedVariance)}</span></div></div><div className="mt-4 border-t border-gray-100 pt-3"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Informational reconciliation checks</p><div className="mt-2 space-y-2">{checks.map((check) => <div key={check.key} className={`rounded-md px-3 py-2 text-xs ${stateClass(check.status)}`}><span className="font-semibold">{check.status}</span> - {check.message}</div>)}</div></div></div>
}
