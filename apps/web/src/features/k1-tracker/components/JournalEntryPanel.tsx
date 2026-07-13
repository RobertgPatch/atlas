import { useState } from 'react'
import type { K1TrackerCalculation, K1TrackerYearDetail } from '../../../../../packages/types/src/k1-tracker'

const currency = (amount: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount))
const journalSources: Record<string, string[]> = {
  'Interest Income': ['box_5_interest_income', 'book_interest_income'],
  'Dividend Income': ['box_6a_ordinary_dividends', 'book_dividend_income'],
  'Realized Capital Gains/Losses': ['box_8_net_short_term_capital_gain_loss', 'box_9a_net_long_term_capital_gain_loss', 'box_10_net_section_1231_gain_loss', 'book_realized_capital_gain_loss'],
  'Partnership Income - General': ['box_1_ordinary_income_loss', 'box_2_net_rental_real_estate_income_loss', 'box_3_other_net_rental_income_loss', 'box_4c_guaranteed_payments', 'box_7_royalties', 'box_11_other_income_loss', 'box_12_section_179_deduction', 'box_13_other_deductions', 'box_18a_nondeductible_expenses', 'box_18b_tax_exempt_income', 'book_other_partnership_income_loss'],
}
const sourceText = (detail: K1TrackerYearDetail | undefined, account: string) => {
  const keys = journalSources[account]
  if (!detail || !keys) return 'Calculated balancing entry'
  const sourceCells = detail.values.filter((value) => keys.includes(value.fieldKey) && value.amount != null).map((value) => value.sourceCell ? `${value.sourceType.replaceAll('_', ' ')} ${value.sourceCell}` : value.sourceType.replaceAll('_', ' '))
  return sourceCells.join('; ') || 'Calculated from entered K-1 and book values'
}

export function JournalEntryPanel({ calculation, detail }: { calculation: K1TrackerCalculation; detail?: K1TrackerYearDetail }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard?.writeText(calculation.journalEntries.map((entry) => `${entry.account}\t${entry.amount}`).join('\n'))
    setCopied(true)
  }
  const balanced = Math.abs(Number(calculation.journalBalance)) <= 1
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-gray-950">Journal preview</h3><p className="mt-1 text-xs text-gray-500">Debit positive - credit negative</p></div><button type="button" onClick={() => void copy()} className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700">{copied ? 'Copied' : 'Copy rows'}</button></div><p aria-live="polite" className="sr-only">{copied ? 'Journal rows copied.' : ''}</p><div className="mt-3 space-y-3 text-sm">{calculation.journalEntries.map((entry) => <div key={entry.account} className="flex justify-between gap-3"><div><p className="text-gray-600">{entry.account}</p><p className="mt-1 text-xs text-gray-500">{sourceText(detail, entry.account)}</p></div><span className="font-medium text-gray-900">{currency(entry.amount)}</span></div>)}<div className={`mt-2 flex justify-between border-t border-gray-100 pt-2 font-semibold ${balanced ? 'text-emerald-700' : 'text-red-700'}`}><span>Balance {balanced ? 'passes' : 'needs review'}</span><span>{currency(calculation.journalBalance)}</span></div></div></div>
}
