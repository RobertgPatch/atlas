import React, { Fragment, useEffect, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XIcon } from 'lucide-react'
import { useRecordAssetFmvSnapshot } from '../hooks/useAssetMutations'
import type { AssetFmvSource, PartnershipAssetRow } from 'packages/types/src'

const SOURCE_OPTIONS: { value: AssetFmvSource; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'manager_statement', label: 'Manager Statement' },
  { value: 'valuation_409a', label: 'Valuation (409A)' },
  { value: 'k1', label: 'K-1' },
  { value: 'imported', label: 'Imported' },
  { value: 'plaid', label: 'Plaid' },
]

interface RecordAssetFmvDialogProps {
  open: boolean
  onClose: () => void
  partnershipId: string
  assets: PartnershipAssetRow[]
  initialAssetId?: string | null
}

export function RecordAssetFmvDialog({ open, onClose, partnershipId, assets, initialAssetId = null }: RecordAssetFmvDialogProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [assetId, setAssetId] = useState(initialAssetId ?? (assets.length === 1 ? assets[0].id : ''))
  const [valuationDate, setValuationDate] = useState(today)
  const [amountUsd, setAmountUsd] = useState('')
  const [source, setSource] = useState<AssetFmvSource>('manual')
  const [confidenceLabel, setConfidenceLabel] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutateAsync, isPending } = useRecordAssetFmvSnapshot(partnershipId, assetId || '__missing__')

  useEffect(() => {
    if (open) {
      setAssetId(initialAssetId ?? (assets.length === 1 ? assets[0].id : ''))
      setValuationDate(today)
      setAmountUsd('')
      setSource('manual')
      setConfidenceLabel('')
      setNote('')
      setErrors({})
    }
  }, [open, initialAssetId, assets, today])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const parsedAmount = Number(amountUsd)

    if (!assetId) nextErrors.assetId = 'Choose an asset first.'
    if (!valuationDate) nextErrors.valuationDate = 'Valuation date is required.'
    if (valuationDate > today) nextErrors.valuationDate = 'Valuation date cannot be in the future.'
    if (!amountUsd || Number.isNaN(parsedAmount)) nextErrors.amountUsd = 'Enter a valid FMV amount.'
    else if (parsedAmount < 0) nextErrors.amountUsd = 'FMV amount cannot be negative.'

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    await mutateAsync({
      valuationDate,
      amountUsd: parsedAmount,
      source,
      confidenceLabel: confidenceLabel.trim() || null,
      note: note.trim() || null,
    })
    onClose()
  }

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-text-primary">Record Asset FMV</Dialog.Title>
                    <p className="mt-1 text-sm text-text-secondary">Append a new FMV snapshot without overwriting any prior valuation history.</p>
                  </div>
                  <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
                    <XIcon className="h-5 w-5 text-text-secondary" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">Asset</label>
                    <select value={assetId} onChange={(event) => setAssetId(event.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold ${errors.assetId ? 'border-red-500' : 'border-gray-300'}`}>
                      <option value="">Select an asset</option>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>{asset.name} · {asset.assetType}</option>
                      ))}
                    </select>
                    {errors.assetId && <p className="mt-1 text-xs text-red-600">{errors.assetId}</p>}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text-primary">Valuation Date</label>
                      <input type="date" max={today} value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold ${errors.valuationDate ? 'border-red-500' : 'border-gray-300'}`} />
                      {errors.valuationDate && <p className="mt-1 text-xs text-red-600">{errors.valuationDate}</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text-primary">FMV Amount (USD)</label>
                      <input type="number" min="0" step="0.01" value={amountUsd} onChange={(event) => setAmountUsd(event.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold ${errors.amountUsd ? 'border-red-500' : 'border-gray-300'}`} />
                      {errors.amountUsd && <p className="mt-1 text-xs text-red-600">{errors.amountUsd}</p>}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text-primary">Source</label>
                      <select value={source} onChange={(event) => setSource(event.target.value as AssetFmvSource)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold">
                        {SOURCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text-primary">Confidence Label</label>
                      <input value={confidenceLabel} onChange={(event) => setConfidenceLabel(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-text-primary">Note</label>
                    <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold" />
                  </div>

                  {errors.server && <p className="text-sm text-red-600">{errors.server}</p>}

                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={isPending} className="rounded-lg bg-atlas-gold px-4 py-2 text-sm text-white hover:bg-atlas-hover disabled:opacity-50">
                      {isPending ? 'Saving…' : 'Record FMV'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}