import React, { Fragment, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XIcon } from 'lucide-react'
import { useCreatePartnershipAsset } from '../hooks/useAssetMutations'
import type { AssetFmvSource } from 'packages/types/src'

const ASSET_TYPES = ['Private Equity', 'Real Estate', 'Hedge Fund', 'Venture Capital', 'Credit', 'Infrastructure', 'Other']

const SOURCE_OPTIONS: { value: AssetFmvSource; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'manager_statement', label: 'Manager Statement' },
  { value: 'valuation_409a', label: 'Valuation (409A)' },
  { value: 'k1', label: 'K-1' },
  { value: 'imported', label: 'Imported' },
  { value: 'plaid', label: 'Plaid' },
]

interface AddAssetDialogProps {
  open: boolean
  onClose: () => void
  partnershipId: string
}

export function AddAssetDialog({ open, onClose, partnershipId }: AddAssetDialogProps) {
  const { mutateAsync, isPending } = useCreatePartnershipAsset(partnershipId)
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [name, setName] = useState('')
  const [assetType, setAssetType] = useState(ASSET_TYPES[0])
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [includeInitialValuation, setIncludeInitialValuation] = useState(false)
  const [valuationDate, setValuationDate] = useState(today)
  const [amountUsd, setAmountUsd] = useState('')
  const [source, setSource] = useState<AssetFmvSource>('manual')
  const [confidenceLabel, setConfidenceLabel] = useState('')
  const [valuationNote, setValuationNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setName('')
    setAssetType(ASSET_TYPES[0])
    setDescription('')
    setNotes('')
    setIncludeInitialValuation(false)
    setValuationDate(today)
    setAmountUsd('')
    setSource('manual')
    setConfidenceLabel('')
    setValuationNote('')
    setErrors({})
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const trimmedName = name.trim()

    if (!trimmedName) nextErrors.name = 'Asset name is required.'
    if (!assetType) nextErrors.assetType = 'Asset type is required.'

    let parsedAmount: number | null = null
    if (includeInitialValuation) {
      parsedAmount = Number(amountUsd)
      if (!valuationDate) nextErrors.valuationDate = 'Valuation date is required.'
      if (valuationDate > today) nextErrors.valuationDate = 'Valuation date cannot be in the future.'
      if (!amountUsd || Number.isNaN(parsedAmount)) nextErrors.amountUsd = 'Enter a valid FMV amount.'
      else if (parsedAmount < 0) nextErrors.amountUsd = 'FMV amount cannot be negative.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    const result = await mutateAsync({
      name: trimmedName,
      assetType,
      description: description.trim() || null,
      notes: notes.trim() || null,
      initialValuation: includeInitialValuation && parsedAmount != null
        ? {
            valuationDate,
            amountUsd: parsedAmount,
            source,
            confidenceLabel: confidenceLabel.trim() || null,
            note: valuationNote.trim() || null,
          }
        : null,
    })

    if ('kind' in result && result.kind === 'duplicate-asset') {
      setErrors({ server: 'An asset with that name and type already exists under this partnership.' })
      return
    }

    handleClose()
  }

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-2xl border-l border-border bg-white shadow-xl">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-border px-6 py-5">
                      <div>
                        <Dialog.Title className="text-lg font-semibold text-text-primary">Add Asset</Dialog.Title>
                        <p className="mt-1 text-sm text-text-secondary">
                          Create a partnership-scoped asset and optionally capture its initial FMV estimate.
                        </p>
                      </div>
                      <button onClick={handleClose} className="rounded-full p-2 text-text-secondary hover:bg-gray-100">
                        <XIcon className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                      <form id="add-asset-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="label-text">Asset Name</label>
                            <input
                              value={name}
                              onChange={(event) => setName(event.target.value)}
                              className={`input-field ${errors.name ? 'border-red-500' : ''}`}
                              placeholder="e.g. North Campus"
                            />
                            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                          </div>
                          <div>
                            <label className="label-text">Asset Type</label>
                            <select
                              value={assetType}
                              onChange={(event) => setAssetType(event.target.value)}
                              className="input-field"
                            >
                              {ASSET_TYPES.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="label-text">Description</label>
                            <textarea
                              rows={3}
                              value={description}
                              onChange={(event) => setDescription(event.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="label-text">Notes</label>
                            <textarea
                              rows={3}
                              value={notes}
                              onChange={(event) => setNotes(event.target.value)}
                              className="input-field"
                            />
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-gray-50/70 p-4">
                          <label className="flex items-center gap-3 text-sm font-medium text-text-primary">
                            <input
                              type="checkbox"
                              checked={includeInitialValuation}
                              onChange={(event) => setIncludeInitialValuation(event.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-atlas-gold focus:ring-atlas-gold"
                            />
                            Record an initial FMV estimate now
                          </label>

                          {includeInitialValuation && (
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <div>
                                <label className="label-text">Valuation Date</label>
                                <input
                                  type="date"
                                  max={today}
                                  value={valuationDate}
                                  onChange={(event) => setValuationDate(event.target.value)}
                                  className={`input-field ${errors.valuationDate ? 'border-red-500' : ''}`}
                                />
                                {errors.valuationDate && <p className="mt-1 text-xs text-red-600">{errors.valuationDate}</p>}
                              </div>
                              <div>
                                <label className="label-text">FMV Amount (USD)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={amountUsd}
                                  onChange={(event) => setAmountUsd(event.target.value)}
                                  className={`input-field ${errors.amountUsd ? 'border-red-500' : ''}`}
                                />
                                {errors.amountUsd && <p className="mt-1 text-xs text-red-600">{errors.amountUsd}</p>}
                              </div>
                              <div>
                                <label className="label-text">Source</label>
                                <select
                                  value={source}
                                  onChange={(event) => setSource(event.target.value as AssetFmvSource)}
                                  className="input-field"
                                >
                                  {SOURCE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="label-text">Confidence Label</label>
                                <input
                                  value={confidenceLabel}
                                  onChange={(event) => setConfidenceLabel(event.target.value)}
                                  className="input-field"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="label-text">Valuation Note</label>
                                <textarea
                                  rows={2}
                                  value={valuationNote}
                                  onChange={(event) => setValuationNote(event.target.value)}
                                  className="input-field"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {errors.server && <p className="text-sm text-red-600">{errors.server}</p>}
                      </form>
                    </div>

                    <div className="flex justify-end gap-3 border-t border-border bg-gray-50 px-6 py-4">
                      <button type="button" onClick={handleClose} className="btn-secondary">Cancel</button>
                      <button type="submit" form="add-asset-form" disabled={isPending} className="btn-primary disabled:opacity-50">
                        {isPending ? 'Saving…' : 'Create Asset'}
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}