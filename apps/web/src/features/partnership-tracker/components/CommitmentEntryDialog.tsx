import { useEffect, useRef, useState } from 'react'
import { CurrencyInput } from '../../../components/shared/CurrencyField'
import { normalizeCurrencyInput } from '../../../components/shared/currencyInput'
import type { PartnershipCommitmentEntry } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'

export function CommitmentEntryDialog({ partnershipId, entry, onClose }: { partnershipId: string; entry?: PartnershipCommitmentEntry; onClose: () => void }) {
  const actions = usePartnershipTrackerActions()
  const [amount, setAmount] = useState(entry?.amount ?? '')
  const [effectiveDate, setEffectiveDate] = useState(entry?.effectiveDate ?? new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string>()
  const amountRef = useRef<HTMLInputElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; amountRef.current?.focus(); return () => previous?.focus() }, [])
  const pending = actions.createCommitment.isPending || actions.updateCommitment.isPending

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    const parsedAmount = normalizeCurrencyInput(amount, false)
    if (parsedAmount.error || parsedAmount.value == null) { setError(parsedAmount.error ?? 'Enter a committed-capital amount.'); return }
    try {
      if (entry) await actions.updateCommitment.mutateAsync({ id: partnershipId, entryId: entry.id, body: { amount: parsedAmount.value, effectiveDate, note: note.trim() || null, expectedUpdatedAt: entry.updatedAt } })
      else await actions.createCommitment.mutateAsync({ id: partnershipId, body: { amount: parsedAmount.value, effectiveDate, note: note.trim() || null } })
      onClose()
    } catch (caught) {
      setError(caught instanceof PartnershipTrackerApiError && caught.isStale ? 'This entry changed while you were editing. The latest history has been reloaded.' : caught instanceof Error ? caught.message : 'The commitment could not be saved.')
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="commitment-dialog-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 id="commitment-dialog-title" className="text-lg font-semibold">{entry ? 'Correct committed capital' : 'Add committed capital'}</h2><p className="mt-1 text-sm text-gray-500">Enter the total commitment effective on this date. Backdated entries do not replace later values.</p><form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm font-medium">Total committed capital<CurrencyInput ref={amountRef} required allowNegative={false} value={amount} onChange={setAmount} placeholder="$1,250,000.00" /></label><label className="block text-sm font-medium">Effective date<input type="date" required value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="block text-sm font-medium">Note <span className="font-normal text-gray-500">(optional)</span><textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={pending} className="rounded-lg bg-jackson-gold px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Saving...' : 'Save entry'}</button></div></form></div></div>
}
