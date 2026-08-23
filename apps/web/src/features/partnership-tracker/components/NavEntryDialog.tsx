import { useEffect, useRef, useState } from 'react'
import { CurrencyInput } from '../../../components/shared/CurrencyField'
import { normalizeCurrencyInput } from '../../../components/shared/currencyInput'
import type { PartnershipNavEntry } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'

export function NavEntryDialog({ partnershipId, entry, onClose }: { partnershipId: string; entry?: PartnershipNavEntry; onClose: () => void }) {
  const actions = usePartnershipTrackerActions()
  const [amount, setAmount] = useState(entry?.amount ?? '')
  const [valuationDate, setValuationDate] = useState(entry?.valuationDate ?? new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string>()
  const amountRef = useRef<HTMLInputElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; amountRef.current?.focus(); return () => previous?.focus() }, [])
  const pending = actions.createNav.isPending || actions.updateNav.isPending

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    const parsedAmount = normalizeCurrencyInput(amount, false)
    if (parsedAmount.error || parsedAmount.value == null) { setError(parsedAmount.error ?? 'Enter a NAV amount.'); return }
    try {
      if (entry) await actions.updateNav.mutateAsync({ id: partnershipId, entryId: entry.id, body: { amount: parsedAmount.value, valuationDate, note: note.trim() || null, expectedUpdatedAt: entry.updatedAt } })
      else await actions.createNav.mutateAsync({ id: partnershipId, body: { amount: parsedAmount.value, valuationDate, note: note.trim() || null } })
      onClose()
    } catch (caught) {
      setError(caught instanceof PartnershipTrackerApiError && caught.code === 'DUPLICATE_NAV_DATE' ? 'A NAV value already exists for this exact date. Edit that entry instead.' : caught instanceof PartnershipTrackerApiError && caught.isStale ? 'This NAV entry changed while you were editing. The latest history has been reloaded.' : caught instanceof Error ? caught.message : 'The NAV entry could not be saved.')
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="nav-dialog-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 id="nav-dialog-title" className="text-lg font-semibold">{entry ? 'Correct NAV entry' : 'Add NAV entry'}</h2><p className="mt-1 text-sm text-gray-500">Record the partnership's net asset value on a specific date. Multiple dates in one year are supported.</p><form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm font-medium">NAV<CurrencyInput ref={amountRef} required allowNegative={false} value={amount} onChange={setAmount} placeholder="$950,000.00" /></label><label className="block text-sm font-medium">Valuation date<input type="date" required value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="block text-sm font-medium">Note <span className="font-normal text-gray-500">(optional)</span><textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Saving...' : 'Save NAV'}</button></div></form></div></div>
}
