import React, { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XIcon, AlertCircleIcon, DollarSignIcon } from 'lucide-react'
import type { CreatePartnershipCommitmentRequest } from 'packages/types/src'

interface AddCommitmentDrawerProps {
  open: boolean
  onClose: () => void
  onSave: (payload: CreatePartnershipCommitmentRequest) => Promise<boolean>
  isSubmitting?: boolean
}

export function AddCommitmentDrawer({
  open,
  onClose,
  onSave,
  isSubmitting = false,
}: AddCommitmentDrawerProps) {
  const [commitmentAmountUsd, setCommitmentAmountUsd] = useState('')
  const [commitmentDate, setCommitmentDate] = useState('')
  const [commitmentStartDate, setCommitmentStartDate] = useState('')
  const [commitmentEndDate, setCommitmentEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function reset() {
    setCommitmentAmountUsd('')
    setCommitmentDate('')
    setCommitmentStartDate('')
    setCommitmentEndDate('')
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

    const numericAmount = Number(commitmentAmountUsd)
    if (!commitmentAmountUsd || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setAmountError('Commitment amount must be greater than zero.')
      return
    }

    if (commitmentStartDate && commitmentEndDate && commitmentStartDate > commitmentEndDate) {
      setDateError('Start date cannot be after end date.')
      return
    }

    const ok = await onSave({
      commitmentAmountUsd: numericAmount,
      commitmentDate: commitmentDate || null,
      commitmentStartDate: commitmentStartDate || null,
      commitmentEndDate: commitmentEndDate || null,
      sourceType: 'manual',
      notes: notes.trim() || null,
      status: 'ACTIVE',
    })

    if (!ok) {
      setSubmitError('Unable to save commitment. Please try again.')
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
                      Add Commitment
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
                      Original commitment drives paid-in, unfunded, percent-called, and return multiple calculations.
                    </div>

                    <form id="add-commitment-drawer-form" onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">
                          Commitment Amount
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={commitmentAmountUsd}
                            onChange={(e) => setCommitmentAmountUsd(e.target.value)}
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
                        <label className="block text-sm font-medium text-text-primary mb-1">Commitment Date</label>
                        <input
                          type="date"
                          value={commitmentDate}
                          onChange={(e) => setCommitmentDate(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-text-primary mb-1">Start Date</label>
                          <input
                            type="date"
                            value={commitmentStartDate}
                            onChange={(e) => setCommitmentStartDate(e.target.value)}
                            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold ${dateError ? 'border-red-500' : 'border-gray-300'}`}
                            disabled={isSubmitting}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-primary mb-1">End Date</label>
                          <input
                            type="date"
                            value={commitmentEndDate}
                            onChange={(e) => setCommitmentEndDate(e.target.value)}
                            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold ${dateError ? 'border-red-500' : 'border-gray-300'}`}
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>

                      {dateError && (
                        <p className="text-xs text-red-600 inline-flex items-center gap-1">
                          <AlertCircleIcon className="w-3.5 h-3.5" />
                          {dateError}
                        </p>
                      )}

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
                      form="add-commitment-drawer-form"
                      className="px-4 py-2 rounded-lg bg-atlas-gold text-white text-sm font-medium hover:bg-atlas-hover disabled:opacity-50 inline-flex items-center gap-2"
                      disabled={isSubmitting}
                    >
                      <DollarSignIcon className="w-4 h-4" />
                      {isSubmitting ? 'Saving…' : 'Save Commitment'}
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
