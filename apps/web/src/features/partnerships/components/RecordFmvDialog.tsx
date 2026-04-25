import React, { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XIcon } from 'lucide-react'
import { useRecordFmvSnapshot } from '../hooks/useFmvMutations'
import type { FmvSource } from 'packages/types/src'

interface RecordFmvDialogProps {
  open: boolean
  onClose: () => void
  partnershipId: string
  partnershipStatus: string
}

const SOURCE_OPTIONS: { value: FmvSource; label: string }[] = [
  { value: 'manager_statement', label: 'Manager Statement' },
  { value: 'valuation_409a', label: 'Valuation (409A)' },
  { value: 'k1', label: 'K-1' },
  { value: 'manual', label: 'Manual' },
]

export function RecordFmvDialog({ open, onClose, partnershipId, partnershipStatus }: RecordFmvDialogProps) {
  const { mutateAsync, isPending } = useRecordFmvSnapshot()

  const today = new Date().toISOString().slice(0, 10)

  const [asOfDate, setAsOfDate] = useState(today)
  const [amountUsd, setAmountUsd] = useState('')
  const [source, setSource] = useState<FmvSource>('manual')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ asOfDate?: string; amountUsd?: string; server?: string }>({})

  function reset() {
    setAsOfDate(today)
    setAmountUsd('')
    setSource('manual')
    setNote('')
    setErrors({})
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: typeof errors = {}

    const amount = parseFloat(amountUsd)
    if (!amountUsd || isNaN(amount)) {
      newErrors.amountUsd = 'Enter a valid amount'
    } else if (amount < 0) {
      newErrors.amountUsd = 'Amount cannot be negative'
    } else if (amount === 0 && partnershipStatus !== 'LIQUIDATED') {
      newErrors.amountUsd = 'Zero FMV is only allowed for LIQUIDATED partnerships'
    }

    if (!asOfDate) {
      newErrors.asOfDate = 'Date is required'
    } else if (asOfDate > today) {
      newErrors.asOfDate = 'Date cannot be in the future'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    try {
      await mutateAsync({
        partnershipId,
        body: {
          asOfDate,
          amountUsd: amount,
          source,
          note: note.trim() || null,
        },
      })
      handleClose()
    } catch (err) {
      setErrors({ server: 'Failed to record FMV. Please try again.' })
    }
  }

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-white shadow-xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <Dialog.Title className="text-lg font-semibold text-text-primary">
                    Record FMV Snapshot
                  </Dialog.Title>
                  <button onClick={handleClose} className="p-1 rounded hover:bg-gray-100">
                    <XIcon className="w-5 h-5 text-text-secondary" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {/* As-of Date */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      As-of Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      max={today}
                      value={asOfDate}
                      onChange={(e) => { setAsOfDate(e.target.value); setErrors((p) => ({ ...p, asOfDate: undefined })) }}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent ${errors.asOfDate ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.asOfDate && <p className="mt-1 text-xs text-red-600">{errors.asOfDate}</p>}
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Amount (USD) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={amountUsd}
                      onChange={(e) => { setAmountUsd(e.target.value); setErrors((p) => ({ ...p, amountUsd: undefined })) }}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent ${errors.amountUsd ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.amountUsd && <p className="mt-1 text-xs text-red-600">{errors.amountUsd}</p>}
                  </div>

                  {/* Source */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Source</label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value as FmvSource)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      {SOURCE_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Note */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Note</label>
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  {errors.server && <p className="text-sm text-red-600">{errors.server}</p>}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                    >
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
