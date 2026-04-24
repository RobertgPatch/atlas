import React, { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XIcon, AlertCircleIcon, ArrowRightLeftIcon } from 'lucide-react'
import type {
  CapitalActivityEventType,
  CreateCapitalActivityEventRequest,
} from 'packages/types/src'

interface AddCapitalActivityDrawerProps {
  open: boolean
  onClose: () => void
  onSave: (payload: CreateCapitalActivityEventRequest) => Promise<boolean>
  isSubmitting?: boolean
}

const EVENT_TYPE_OPTIONS: Array<{ value: CapitalActivityEventType; label: string; hint: string }> = [
  {
    value: 'capital_call',
    label: 'Capital Call',
    hint: 'Requested capital amount from the manager',
  },
  {
    value: 'funded_contribution',
    label: 'Funded Contribution',
    hint: 'Actual amount funded by the entity',
  },
  {
    value: 'other_adjustment',
    label: 'Other Adjustment',
    hint: 'Manual adjustment for reporting context',
  },
]

export function AddCapitalActivityDrawer({
  open,
  onClose,
  onSave,
  isSubmitting = false,
}: AddCapitalActivityDrawerProps) {
  const [eventType, setEventType] = useState<CapitalActivityEventType>('capital_call')
  const [amountUsd, setAmountUsd] = useState('')
  const [activityDate, setActivityDate] = useState('')
  const [notes, setNotes] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function reset() {
    setEventType('capital_call')
    setAmountUsd('')
    setActivityDate('')
    setNotes('')
    setAmountError(null)
    setDateError(null)
    setSubmitError(null)
  }

  function handleClose() {
    if (isSubmitting) return
    reset()
    onClose()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setAmountError(null)
    setDateError(null)
    setSubmitError(null)

    if (!activityDate) {
      setDateError('Activity date is required.')
      return
    }

    const numericAmount = Number(amountUsd)
    if (!amountUsd || !Number.isFinite(numericAmount)) {
      setAmountError('Enter a valid amount.')
      return
    }
    if (numericAmount === 0) {
      setAmountError('Amount must be non-zero.')
      return
    }
    if ((eventType === 'capital_call' || eventType === 'funded_contribution') && numericAmount < 0) {
      setAmountError('Amount must be positive for this event type.')
      return
    }

    const ok = await onSave({
      activityDate,
      eventType,
      amountUsd: numericAmount,
      sourceType: 'manual',
      notes: notes.trim() || null,
    })

    if (!ok) {
      setSubmitError('Unable to save activity. Please try again.')
      return
    }

    handleClose()
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

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-200"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md bg-surface shadow-xl border-l border-border flex flex-col">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <Dialog.Title className="text-base font-semibold text-text-primary">
                      Add Capital Activity
                    </Dialog.Title>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="p-1 rounded hover:bg-gray-100"
                      disabled={isSubmitting}
                    >
                      <XIcon className="w-5 h-5 text-text-secondary" />
                    </button>
                  </div>

                  <div className="px-6 py-5 overflow-y-auto flex-1">
                    <div className="mb-5 rounded-lg border border-atlas-gold/30 bg-atlas-gold/10 px-4 py-3 text-sm text-text-secondary">
                      Capital activity updates paid-in and unfunded metrics and contributes to activity detail rows.
                    </div>

                    <form id="add-capital-activity-drawer-form" onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Event Type</label>
                        <select
                          value={eventType}
                          onChange={(e) => setEventType(e.target.value as CapitalActivityEventType)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                          disabled={isSubmitting}
                        >
                          {EVENT_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {EVENT_TYPE_OPTIONS.find((option) => option.value === eventType)?.hint}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Activity Date</label>
                        <input
                          type="date"
                          value={activityDate}
                          onChange={(e) => setActivityDate(e.target.value)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold ${dateError ? 'border-red-500' : 'border-gray-300'}`}
                          disabled={isSubmitting}
                        />
                        {dateError && (
                          <p className="mt-1 text-xs text-red-600 inline-flex items-center gap-1">
                            <AlertCircleIcon className="w-3.5 h-3.5" />
                            {dateError}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Amount</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={amountUsd}
                            onChange={(e) => setAmountUsd(e.target.value)}
                            className={`w-full rounded-lg border px-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold ${amountError ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="0.00"
                            disabled={isSubmitting}
                          />
                        </div>
                        {amountError && (
                          <p className="mt-1 text-xs text-red-600 inline-flex items-center gap-1">
                            <AlertCircleIcon className="w-3.5 h-3.5" />
                            {amountError}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Notes</label>
                        <textarea
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                          placeholder="Optional context"
                          disabled={isSubmitting}
                        />
                      </div>

                      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                    </form>
                  </div>

                  <div className="px-6 py-4 border-t border-border bg-gray-50 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-text-primary hover:bg-gray-50"
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      form="add-capital-activity-drawer-form"
                      className="px-4 py-2 rounded-lg bg-atlas-gold text-white text-sm font-medium hover:bg-atlas-hover disabled:opacity-50 inline-flex items-center gap-2"
                      disabled={isSubmitting}
                    >
                      <ArrowRightLeftIcon className="w-4 h-4" />
                      {isSubmitting ? 'Saving…' : 'Save Activity'}
                    </button>
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
