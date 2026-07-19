import { X } from 'lucide-react'
import { useState } from 'react'

export function AddYearDialog({ defaultTaxYear, pending, onClose, onAdd }: { defaultTaxYear: number; pending: boolean; onClose: () => void; onAdd: (taxYear: number) => Promise<void> }) {
  const [taxYear, setTaxYear] = useState(String(defaultTaxYear))
  const [error, setError] = useState<string>()
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = Number(taxYear)
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) { setError('Enter a whole tax year from 1900 through 2100.'); return }
    try { await onAdd(parsed) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add this tracker year.') }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="add-tracker-year-title"><form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="add-tracker-year-title" className="text-lg font-semibold text-gray-950">Add tracker year</h2><p className="mt-1 text-sm text-gray-600">Choose any tax year. It does not have to be the next chronological year.</p></div><button type="button" aria-label="Close add tracker year dialog" onClick={onClose} className="rounded-md p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><label className="mt-5 block"><span className="text-sm font-medium text-gray-800">Tax year</span><input autoFocus aria-label="Tax year" type="number" min="1900" max="2100" step="1" value={taxYear} onChange={(event) => { setTaxYear(event.target.value); setError(undefined) }} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jackson-gold" /></label>{error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button><button type="submit" disabled={pending} className="rounded-md bg-jackson-gold px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Add year</button></div></form></div>
}
