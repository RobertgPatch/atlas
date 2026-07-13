import React, { Fragment, useEffect, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { X } from 'lucide-react'
import type {
  TicAcquisitionOrigin,
  TicInterest,
  TicInterestStatus,
  TicOwner,
  TicOwnerType,
  TicProperty,
  TicPropertyStatus,
  TicPropertyType,
} from '../../../../../../packages/types/src/tic-registry'
import {
  useCreateTicInterest,
  useCreateTicOwner,
  useCreateTicProperty,
  useUpdateTicInterest,
  useUpdateTicOwner,
  useUpdateTicProperty,
} from '../hooks/useTicRegistry'
import {
  ACQUISITION_ORIGIN_LABELS,
  INTEREST_STATUS_LABELS,
  INTEREST_STATUSES,
  OWNER_TYPE_LABELS,
  OWNER_TYPES,
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
} from './allocation'

type DialogShellProps = {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
}

function DialogShell({ open, title, children, onClose }: DialogShellProps) {
  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
                <div className="mb-5 flex items-center justify-between">
                  <Dialog.Title className="text-lg font-semibold text-gray-950">
                    {title}
                  </Dialog.Title>
                  <button
                    type="button"
                    title="Close"
                    onClick={onClose}
                    className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalInteger(value: string): number | null {
  const parsed = parseOptionalNumber(value)
  return parsed == null || !Number.isInteger(parsed) ? null : parsed
}

interface PropertyDialogProps {
  open: boolean
  property: TicProperty | null
  onClose: () => void
}

export function PropertyDialog({ open, property, onClose }: PropertyDialogProps) {
  const createProperty = useCreateTicProperty()
  const updateProperty = useUpdateTicProperty()
  const isEditing = Boolean(property)

  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [propertyState, setPropertyState] = useState('')
  const [propertyCode, setPropertyCode] = useState('')
  const [numberOfUnits, setNumberOfUnits] = useState('')
  const [propertyType, setPropertyType] = useState<TicPropertyType>('multifamily')
  const [status, setStatus] = useState<TicPropertyStatus>('held')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [acquisitionPriceUsd, setAcquisitionPriceUsd] = useState('')
  const [notes, setNotes] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(property?.name ?? '')
    setCity(property?.city ?? '')
    setPropertyState(property?.state ?? '')
    setPropertyCode(property?.propertyCode ?? '')
    setNumberOfUnits(property?.numberOfUnits?.toString() ?? '')
    setPropertyType(property?.propertyType ?? 'multifamily')
    setStatus(property?.status ?? 'held')
    setAcquiredDate(property?.acquiredDate ?? '')
    setAcquisitionPriceUsd(property?.acquisitionPriceUsd?.toString() ?? '')
    setNotes(property?.notes ?? '')
    setSubmitError(null)
  }, [open, property])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setSubmitError('Name is required')
      return
    }
    const parsedNumberOfUnits = parseOptionalInteger(numberOfUnits)
    if (numberOfUnits.trim() && (parsedNumberOfUnits == null || parsedNumberOfUnits < 0)) {
      setSubmitError('Number of units must be a whole number')
      return
    }

    try {
      if (property) {
        await updateProperty.mutateAsync({
          propertyId: property.id,
          payload: {
            expectedUpdatedAt: property.updatedAt,
            name: trimmedName,
            city: city.trim() || null,
            state: propertyState.trim() || null,
            propertyCode: propertyCode.trim() || null,
            numberOfUnits: parsedNumberOfUnits,
            propertyType,
            status,
            acquiredDate: acquiredDate || null,
            acquisitionPriceUsd: parseOptionalNumber(acquisitionPriceUsd),
            notes: notes.trim() || null,
          },
        })
      } else {
        await createProperty.mutateAsync({
          name: trimmedName,
          city: city.trim() || null,
          state: propertyState.trim() || null,
          propertyCode: propertyCode.trim() || null,
          numberOfUnits: parsedNumberOfUnits,
          propertyType,
          status,
          acquiredDate: acquiredDate || null,
          acquisitionPriceUsd: parseOptionalNumber(acquisitionPriceUsd),
          notes: notes.trim() || null,
        })
      }
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save property')
    }
  }

  const isPending = createProperty.isPending || updateProperty.isPending

  return (
    <DialogShell
      open={open}
      title={isEditing ? 'Edit Property' : 'Add Property'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="tic-property-name" className="mb-1 block text-sm font-medium text-gray-800">Name</label>
            <input
              id="tic-property-name"
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
          <div>
            <label htmlFor="tic-property-code" className="mb-1 block text-sm font-medium text-gray-800">Property Code</label>
            <input
              id="tic-property-code"
              maxLength={50}
              value={propertyCode}
              onChange={(event) => setPropertyCode(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="tic-property-city" className="mb-1 block text-sm font-medium text-gray-800">City</label>
            <input
              id="tic-property-city"
              maxLength={100}
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
          <div>
            <label htmlFor="tic-property-state" className="mb-1 block text-sm font-medium text-gray-800">State</label>
            <input
              id="tic-property-state"
              maxLength={50}
              value={propertyState}
              onChange={(event) => setPropertyState(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="tic-property-type" className="mb-1 block text-sm font-medium text-gray-800">Type</label>
            <select
              id="tic-property-type"
              value={propertyType}
              onChange={(event) => setPropertyType(event.target.value as TicPropertyType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROPERTY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tic-property-status" className="mb-1 block text-sm font-medium text-gray-800">Status</label>
            <select
              id="tic-property-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as TicPropertyStatus)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            >
              {PROPERTY_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {PROPERTY_STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tic-property-acquired-date" className="mb-1 block text-sm font-medium text-gray-800">Acquired Date</label>
            <input
              id="tic-property-acquired-date"
              type="date"
              value={acquiredDate}
              onChange={(event) => setAcquiredDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
          <div>
            <label htmlFor="tic-property-units" className="mb-1 block text-sm font-medium text-gray-800">Number of Units</label>
            <input
              id="tic-property-units"
              inputMode="numeric"
              value={numberOfUnits}
              onChange={(event) => setNumberOfUnits(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="tic-property-acquisition-price" className="mb-1 block text-sm font-medium text-gray-800">Acquisition Price</label>
          <input
            id="tic-property-acquisition-price"
            inputMode="decimal"
            value={acquisitionPriceUsd}
            onChange={(event) => setAcquisitionPriceUsd(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
          />
        </div>

        <div>
          <label htmlFor="tic-property-notes" className="mb-1 block text-sm font-medium text-gray-800">Notes</label>
          <textarea
            id="tic-property-notes"
            rows={3}
            maxLength={10000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
          />
        </div>

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-atlas-gold px-4 py-2 text-sm font-medium text-white hover:bg-atlas-hover disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </DialogShell>
  )
}

interface InterestDialogProps {
  open: boolean
  property: TicProperty | null
  interest: TicInterest | null
  properties: TicProperty[]
  onClose: () => void
}

export function InterestDialog({
  open,
  property,
  interest,
  properties,
  onClose,
}: InterestDialogProps) {
  const createInterest = useCreateTicInterest()
  const updateInterest = useUpdateTicInterest()
  const isEditing = Boolean(interest)

  const [name, setName] = useState('')
  const [propertyPercentage, setPropertyPercentage] = useState('')
  const [status, setStatus] = useState<TicInterestStatus>('active')
  const [acquisitionOrigin, setAcquisitionOrigin] = useState<TicAcquisitionOrigin>('cash')
  const [sourceMode, setSourceMode] = useState<'existing' | 'manual'>('existing')
  const [sourceInterestId, setSourceInterestId] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [acquisitionDate, setAcquisitionDate] = useState('')
  const [acquisitionValueUsd, setAcquisitionValueUsd] = useState('')
  const [notes, setNotes] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const sourceOptions = useMemo(
    () =>
      properties.flatMap((sourceProperty) =>
        sourceProperty.interests
          .filter((candidate) => candidate.id !== interest?.id)
          .map((candidate) => ({
            id: candidate.id,
            label: `${sourceProperty.name} / ${candidate.name}`,
          })),
      ),
    [interest?.id, properties],
  )

  useEffect(() => {
    if (!open) return
    setName(interest?.name ?? '')
    setPropertyPercentage(interest?.propertyPercentage?.toString() ?? '')
    setStatus(interest?.status ?? 'active')
    setAcquisitionOrigin(interest?.acquisitionOrigin ?? 'cash')
    setSourceMode(interest?.relinquishedSourceName ? 'manual' : 'existing')
    setSourceInterestId(interest?.relinquishedInterestId ?? '')
    setSourceName(interest?.relinquishedSourceName ?? '')
    setAcquisitionDate(interest?.acquisitionDate ?? '')
    setAcquisitionValueUsd(interest?.acquisitionValueUsd?.toString() ?? '')
    setNotes(interest?.notes ?? '')
    setSubmitError(null)
  }, [interest, open])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitError(null)

    const trimmedName = name.trim()
    const parsedPropertyPercentage = parseOptionalNumber(propertyPercentage)
    if (!trimmedName) {
      setSubmitError('Name is required')
      return
    }
    if (parsedPropertyPercentage == null || parsedPropertyPercentage < 0 || parsedPropertyPercentage > 100) {
      setSubmitError('Property percentage must be between 0 and 100')
      return
    }
    if (acquisitionOrigin === 'exchange') {
      const hasExistingSource = sourceMode === 'existing' && sourceInterestId
      const hasManualSource = sourceMode === 'manual' && sourceName.trim()
      if (!hasExistingSource && !hasManualSource) {
        setSubmitError('Exchange source is required')
        return
      }
    }

    const sourcePayload =
      acquisitionOrigin === 'exchange'
        ? {
            relinquishedInterestId: sourceMode === 'existing' ? sourceInterestId : null,
            relinquishedSourceName: sourceMode === 'manual' ? sourceName.trim() : null,
          }
        : {
            relinquishedInterestId: null,
            relinquishedSourceName: null,
          }

    try {
      if (interest) {
        await updateInterest.mutateAsync({
          interestId: interest.id,
          payload: {
            expectedUpdatedAt: interest.updatedAt,
            name: trimmedName,
            propertyPercentage: parsedPropertyPercentage,
            status,
            acquisitionOrigin,
            acquisitionDate: acquisitionDate || null,
            acquisitionValueUsd: parseOptionalNumber(acquisitionValueUsd),
            notes: notes.trim() || null,
            ...sourcePayload,
          },
        })
      } else if (property) {
        await createInterest.mutateAsync({
          propertyId: property.id,
          payload: {
            name: trimmedName,
            propertyPercentage: parsedPropertyPercentage,
            status,
            acquisitionOrigin,
            acquisitionDate: acquisitionDate || null,
            acquisitionValueUsd: parseOptionalNumber(acquisitionValueUsd),
            notes: notes.trim() || null,
            ...sourcePayload,
          },
        })
      }
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save TIC interest')
    }
  }

  const isPending = createInterest.isPending || updateInterest.isPending

  return (
    <DialogShell
      open={open}
      title={isEditing ? 'Edit TIC' : 'Add TIC Interest'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">TIC / LLC Name</label>
            <input
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Property Share</label>
            <input
              required
              inputMode="decimal"
              value={propertyPercentage}
              onChange={(event) => setPropertyPercentage(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Status</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TicInterestStatus)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            >
              {INTEREST_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {INTEREST_STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Origin</label>
            <select
              value={acquisitionOrigin}
              onChange={(event) => setAcquisitionOrigin(event.target.value as TicAcquisitionOrigin)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            >
              {(['cash', 'exchange'] as TicAcquisitionOrigin[]).map((option) => (
                <option key={option} value={option}>
                  {ACQUISITION_ORIGIN_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Acquired Date</label>
            <input
              type="date"
              value={acquisitionDate}
              onChange={(event) => setAcquisitionDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
        </div>

        {acquisitionOrigin === 'exchange' && (
          <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">Source Type</label>
              <select
                value={sourceMode}
                onChange={(event) => setSourceMode(event.target.value as 'existing' | 'manual')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
              >
                <option value="existing">Existing TIC</option>
                <option value="manual">External Source</option>
              </select>
            </div>
            {sourceMode === 'existing' ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">Source TIC</label>
                <select
                  value={sourceInterestId}
                  onChange={(event) => setSourceInterestId(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                >
                  <option value="">Select a source</option>
                  {sourceOptions.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">External Source</label>
                <input
                  maxLength={200}
                  value={sourceName}
                  onChange={(event) => setSourceName(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Acquisition Value</label>
          <input
            inputMode="decimal"
            value={acquisitionValueUsd}
            onChange={(event) => setAcquisitionValueUsd(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Notes</label>
          <textarea
            rows={3}
            maxLength={10000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
          />
        </div>

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-atlas-gold px-4 py-2 text-sm font-medium text-white hover:bg-atlas-hover disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </DialogShell>
  )
}

interface OwnerDialogProps {
  open: boolean
  interest: TicInterest | null
  owner: TicOwner | null
  onClose: () => void
}

export function OwnerDialog({ open, interest, owner, onClose }: OwnerDialogProps) {
  const createOwner = useCreateTicOwner()
  const updateOwner = useUpdateTicOwner()
  const isEditing = Boolean(owner)

  const [name, setName] = useState('')
  const [ownerType, setOwnerType] = useState<TicOwnerType>('individual')
  const [ticPercentage, setTicPercentage] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(owner?.name ?? '')
    setOwnerType(owner?.ownerType ?? 'individual')
    setTicPercentage(owner?.ticPercentage?.toString() ?? '')
    setSubmitError(null)
  }, [open, owner])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitError(null)

    const trimmedName = name.trim()
    const parsedTicPercentage = parseOptionalNumber(ticPercentage)
    if (!trimmedName) {
      setSubmitError('Name is required')
      return
    }
    if (parsedTicPercentage == null || parsedTicPercentage < 0 || parsedTicPercentage > 100) {
      setSubmitError('TIC percentage must be between 0 and 100')
      return
    }

    try {
      if (owner) {
        await updateOwner.mutateAsync({
          ownerId: owner.id,
          payload: {
            expectedUpdatedAt: owner.updatedAt,
            name: trimmedName,
            ownerType,
            ticPercentage: parsedTicPercentage,
          },
        })
      } else if (interest) {
        await createOwner.mutateAsync({
          interestId: interest.id,
          payload: {
            name: trimmedName,
            ownerType,
            ticPercentage: parsedTicPercentage,
          },
        })
      }
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save owner')
    }
  }

  const isPending = createOwner.isPending || updateOwner.isPending

  return (
    <DialogShell
      open={open}
      title={isEditing ? 'Edit Owner' : 'Add Owner'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-800">Name</label>
          <input
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Owner Type</label>
            <select
              value={ownerType}
              onChange={(event) => setOwnerType(event.target.value as TicOwnerType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            >
              {OWNER_TYPES.map((option) => (
                <option key={option} value={option}>
                  {OWNER_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Owner Percentage of TIC</label>
            <input
              required
              inputMode="decimal"
              value={ticPercentage}
              onChange={(event) => setTicPercentage(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold"
            />
          </div>
        </div>

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-atlas-gold px-4 py-2 text-sm font-medium text-white hover:bg-atlas-hover disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </DialogShell>
  )
}
