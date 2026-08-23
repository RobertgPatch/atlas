import { AlertTriangle, Loader2, Plus, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  TicInterest,
  TicOwner,
  TicProperty,
  TicPropertyStatus,
  TicPropertyType,
  TicRegistryQuery,
} from '../../../../../../packages/types/src/tic-registry'
import { PageHeader } from '../../../components/shared/PageHeader'
import { ConfirmationDialog } from '../../../components/shared/ConfirmationDialog'
import { TicRegistryApiError } from '../api/ticRegistryClient'
import {
  useDeleteTicInterest,
  useDeleteTicOwner,
  useDeleteTicProperty,
  useTicRegistry,
} from '../hooks/useTicRegistry'
import {
  allocationTone,
  formatCurrency,
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
} from './allocation'
import { InterestDialog, OwnerDialog, PropertyDialog } from './TicRegistryDialogs'
import { TicPropertyCard } from './TicPropertyCard'

interface TicRegistryPageContentProps {
  canEdit: boolean
}

type InterestDialogState = {
  property: TicProperty
  interest: TicInterest | null
}

type OwnerDialogState = {
  interest: TicInterest
  owner: TicOwner | null
}

type DeleteTarget =
  | { kind: 'property'; record: TicProperty }
  | { kind: 'interest'; record: TicInterest }
  | { kind: 'owner'; record: TicOwner }

function describeError(error: unknown): string {
  if (error instanceof TicRegistryApiError) {
    if (error.code === 'DATABASE_REQUIRED') {
      return 'TIC Registry requires the RDS database connection before records can be loaded.'
    }
    if (error.code === 'FORBIDDEN_ROLE') {
      return 'Only Admin users can change TIC registry records.'
    }
    if (error.code === 'STALE_TIC_UPDATE') {
      return 'This record changed after it was opened. Refresh and try again.'
    }
    return error.code
  }
  return error instanceof Error ? error.message : 'Unable to load TIC Registry'
}

export function TicRegistryPageContent({ canEdit }: TicRegistryPageContentProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TicPropertyStatus | ''>('')
  const [propertyType, setPropertyType] = useState<TicPropertyType | ''>('')
  const [propertyDialog, setPropertyDialog] = useState<TicProperty | null | undefined>()
  const [interestDialog, setInterestDialog] = useState<InterestDialogState | null>(null)
  const [ownerDialog, setOwnerDialog] = useState<OwnerDialogState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const query = useMemo<TicRegistryQuery>(
    () => ({
      search: search.trim() || undefined,
      status: status || undefined,
      propertyType: propertyType || undefined,
    }),
    [propertyType, search, status],
  )

  const registryQuery = useTicRegistry(query)
  const deleteProperty = useDeleteTicProperty()
  const deleteInterest = useDeleteTicInterest()
  const deleteOwner = useDeleteTicOwner()

  const properties = registryQuery.data?.properties ?? []
  const summary = registryQuery.data?.summary
  const allocationIssueGroups = useMemo(() => {
    if (!summary) return []

    return [
      {
        key: 'under-properties',
        label: 'Under allocated properties',
        count: summary.underAllocatedPropertyCount,
        status: 'under' as const,
      },
      {
        key: 'over-properties',
        label: 'Over allocated properties',
        count: summary.overAllocatedPropertyCount,
        status: 'over' as const,
      },
      {
        key: 'under-interests',
        label: 'Under allocated TIC interests',
        count: summary.underAllocatedInterestCount,
        status: 'under' as const,
      },
      {
        key: 'over-interests',
        label: 'Over allocated TIC interests',
        count: summary.overAllocatedInterestCount,
        status: 'over' as const,
      },
    ].filter((issue) => issue.count > 0)
  }, [summary])
  async function handleDelete() {
    if (!deleteTarget) return
    setPageError(null)
    try {
      if (deleteTarget.kind === 'property') {
        await deleteProperty.mutateAsync({
          propertyId: deleteTarget.record.id,
          expectedUpdatedAt: deleteTarget.record.updatedAt,
        })
      } else if (deleteTarget.kind === 'interest') {
        await deleteInterest.mutateAsync({
          interestId: deleteTarget.record.id,
          expectedUpdatedAt: deleteTarget.record.updatedAt,
        })
      } else {
        await deleteOwner.mutateAsync({
          ownerId: deleteTarget.record.id,
          expectedUpdatedAt: deleteTarget.record.updatedAt,
        })
      }
    } catch (error) {
      setPageError(describeError(error))
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <>
      <PageHeader
        title="TIC Registry"
        subtitle="Property-level TIC interests, underlying owners, and exchange lineage."
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => setPropertyDialog(null)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              Add Property
            </button>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Properties</p>
          <p className="mt-2 text-2xl font-semibold text-gray-950">{summary?.propertyCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Units</p>
          <p className="mt-2 text-2xl font-semibold text-gray-950">
            {(summary?.totalUnits ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">TIC Interests</p>
          <p className="mt-2 text-2xl font-semibold text-gray-950">{summary?.ticInterestCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Underlying Owners</p>
          <p className="mt-2 text-2xl font-semibold text-gray-950">{summary?.ownerCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Held Acquisition Price</p>
          <p className="mt-2 text-2xl font-semibold text-gray-950">
            {formatCurrency(summary?.heldAcquisitionPriceUsd ?? 0)}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search properties, TICs, owners"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as TicPropertyStatus | '')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
          >
            <option value="">All statuses</option>
            {PROPERTY_STATUSES.map((option) => (
              <option key={option} value={option}>
                {PROPERTY_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
          <select
            value={propertyType}
            onChange={(event) => setPropertyType(event.target.value as TicPropertyType | '')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
          >
            <option value="">All types</option>
            {PROPERTY_TYPES.map((option) => (
              <option key={option} value={option}>
                {PROPERTY_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="Refresh"
            onClick={() => void registryQuery.refetch()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {pageError && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{pageError}</p>
        </div>
      )}

      {registryQuery.isError && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{describeError(registryQuery.error)}</p>
        </div>
      )}

      {registryQuery.isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-lg border border-gray-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : registryQuery.isError ? null : properties.length > 0 ? (
        <div className="space-y-5">
          {properties.map((property) => (
            <TicPropertyCard
              key={property.id}
              property={property}
              canEdit={canEdit}
              onEditProperty={(selectedProperty) => setPropertyDialog(selectedProperty)}
              onDeleteProperty={(record) => setDeleteTarget({ kind: 'property', record })}
              onAddInterest={(selectedProperty) =>
                setInterestDialog({ property: selectedProperty, interest: null })
              }
              onEditInterest={(selectedProperty, selectedInterest) =>
                setInterestDialog({ property: selectedProperty, interest: selectedInterest })
              }
              onDeleteInterest={(record) => setDeleteTarget({ kind: 'interest', record })}
              onAddOwner={(selectedInterest) =>
                setOwnerDialog({ interest: selectedInterest, owner: null })
              }
              onEditOwner={(selectedInterest, selectedOwner) =>
                setOwnerDialog({ interest: selectedInterest, owner: selectedOwner })
              }
              onDeleteOwner={(record) => setDeleteTarget({ kind: 'owner', record })}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-base font-medium text-gray-950">No TIC records found</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Add a property to start tracking tenant-in-common interests and owners.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setPropertyDialog(null)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              Add Property
            </button>
          )}
        </div>
      )}

      {allocationIssueGroups.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-950">Allocation Issues</h2>
          <div className="mt-3 grid gap-2">
            {allocationIssueGroups.map((issue) => (
              <div
                key={issue.key}
                className={`rounded-md border px-3 py-2 text-sm ${allocationTone(issue.status)}`}
              >
                {issue.label}: {issue.count}
              </div>
            ))}
          </div>
        </div>
      )}

      <PropertyDialog
        open={propertyDialog !== undefined}
        property={propertyDialog ?? null}
        onClose={() => setPropertyDialog(undefined)}
      />
      <InterestDialog
        open={Boolean(interestDialog)}
        property={interestDialog?.property ?? null}
        interest={interestDialog?.interest ?? null}
        properties={properties}
        onClose={() => setInterestDialog(null)}
      />
      <OwnerDialog
        open={Boolean(ownerDialog)}
        interest={ownerDialog?.interest ?? null}
        owner={ownerDialog?.owner ?? null}
        onClose={() => setOwnerDialog(null)}
      />
      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.record.name ?? 'record'}?`}
        description={
          deleteTarget?.kind === 'property' ? (
            <p>This permanently deletes the property, all of its TIC interests, and every underlying owner allocation.</p>
          ) : deleteTarget?.kind === 'interest' ? (
            <p>This permanently deletes the TIC interest and every owner allocation recorded beneath it.</p>
          ) : (
            <p>This permanently deletes the underlying owner allocation from this TIC interest.</p>
          )
        }
        confirmLabel={`Delete ${deleteTarget?.kind ?? 'record'}`}
        pending={deleteProperty.isPending || deleteInterest.isPending || deleteOwner.isPending}
        pendingLabel="Deleting record…"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}
