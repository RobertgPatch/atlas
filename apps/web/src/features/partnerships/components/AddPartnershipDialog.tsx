import React, { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XIcon } from 'lucide-react'
import { useCreatePartnership } from '../hooks/usePartnershipMutations'
import type { PartnershipStatus } from 'packages/types/src'

interface AddPartnershipDialogProps {
  open: boolean
  onClose: () => void
}

const STATUS_OPTIONS: PartnershipStatus[] = ['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED']
const ASSET_CLASSES = ['Private Equity', 'Real Estate', 'Hedge Fund', 'Venture Capital', 'Credit', 'Infrastructure', 'Other']

export function AddPartnershipDialog({ open, onClose }: AddPartnershipDialogProps) {
  const { mutateAsync, isPending } = useCreatePartnership()

  const [entityId, setEntityId] = useState('')
  const [name, setName] = useState('')
  const [assetClass, setAssetClass] = useState('')
  const [status, setStatus] = useState<PartnershipStatus>('ACTIVE')
  const [notes, setNotes] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function reset() {
    setEntityId('')
    setName('')
    setAssetClass('')
    setStatus('ACTIVE')
    setNotes('')
    setNameError(null)
    setSubmitError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNameError(null)
    setSubmitError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError('Name is required')
      return
    }
    if (trimmedName.length > 120) {
      setNameError('Name must be 120 characters or fewer')
      return
    }

    const result = await mutateAsync({
      entityId: entityId.trim(),
      name: trimmedName,
      assetClass: assetClass || null,
      status,
      notes: notes.trim() || null,
    })

    if ('kind' in result && result.kind === 'duplicate-name') {
      setNameError('A partnership with this name already exists for the selected entity.')
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
              <Dialog.Panel className="w-full max-w-lg rounded-xl bg-white shadow-xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <Dialog.Title className="text-lg font-semibold text-text-primary">
                    Add Partnership
                  </Dialog.Title>
                  <button onClick={handleClose} className="p-1 rounded hover:bg-gray-100">
                    <XIcon className="w-5 h-5 text-text-secondary" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {/* Entity ID */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Entity ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="UUID of the entity"
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                    />
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => { setName(e.target.value); setNameError(null) }}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold ${nameError ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
                  </div>

                  {/* Asset Class */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Asset Class</label>
                    <select
                      value={assetClass}
                      onChange={(e) => setAssetClass(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                    >
                      <option value="">— None —</option>
                      {ASSET_CLASSES.map((ac) => (
                        <option key={ac} value={ac}>{ac}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as PartnershipStatus)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Notes</label>
                    <textarea
                      rows={3}
                      maxLength={10000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                    />
                  </div>

                  {submitError && (
                    <p className="text-sm text-red-600">{submitError}</p>
                  )}

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
                      className="px-4 py-2 text-sm rounded-lg bg-atlas-gold text-white hover:bg-atlas-hover disabled:opacity-50"
                    >
                      {isPending ? 'Saving…' : 'Add Partnership'}
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
