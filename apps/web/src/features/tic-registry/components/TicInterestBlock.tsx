import { Edit3, Plus, Trash2 } from 'lucide-react'
import type { TicInterest, TicOwner } from '../../../../../../packages/types/src/tic-registry'
import {
  ACQUISITION_ORIGIN_LABELS,
  allocationTone,
  formatCurrency,
  formatDate,
  formatPercent,
  INTEREST_STATUS_LABELS,
  statusTone,
} from './allocation'
import { TicOwnerRow } from './TicOwnerRow'

interface TicInterestBlockProps {
  interest: TicInterest
  canEdit: boolean
  onEditInterest: (interest: TicInterest) => void
  onDeleteInterest: (interest: TicInterest) => void
  onAddOwner: (interest: TicInterest) => void
  onEditOwner: (interest: TicInterest, owner: TicOwner) => void
  onDeleteOwner: (owner: TicOwner) => void
}

export function TicInterestBlock({
  interest,
  canEdit,
  onEditInterest,
  onDeleteInterest,
  onAddOwner,
  onEditOwner,
  onDeleteOwner,
}: TicInterestBlockProps) {
  return (
    <section className="border-t border-gray-200">
      <div className="px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-gray-950">{interest.name}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(interest.status)}`}>
                {INTEREST_STATUS_LABELS[interest.status]}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                {ACQUISITION_ORIGIN_LABELS[interest.acquisitionOrigin]}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
              <span>Property: {formatPercent(interest.propertyPercentage)}</span>
              <span>Acquired: {formatDate(interest.acquisitionDate)}</span>
              <span>Basis: {formatCurrency(interest.acquisitionValueUsd)}</span>
              {interest.relinquishedSourceLabel && (
                <span>Source: {interest.relinquishedSourceLabel}</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${allocationTone(interest.allocation.status)}`}>
              Owners {formatPercent(interest.allocation.allocatedPercentage)}
            </span>
            {canEdit && (
              <>
                <button
                  type="button"
                  title="Add owner"
                  onClick={() => onAddOwner(interest)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Edit TIC interest"
                  onClick={() => onEditInterest(interest)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Delete TIC interest"
                  onClick={() => onDeleteInterest(interest)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-gray-50/60">
        <div className="hidden grid-cols-[minmax(0,1fr)_6rem_6rem_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:grid">
          <span>Owner</span>
          <span className="text-right">TIC %</span>
          <span className="text-right">Property %</span>
          <span className="text-right">Actions</span>
        </div>
        {interest.owners.length > 0 ? (
          interest.owners.map((owner) => (
            <TicOwnerRow
              key={owner.id}
              owner={owner}
              canEdit={canEdit}
              onEdit={(selectedOwner) => onEditOwner(interest, selectedOwner)}
              onDelete={onDeleteOwner}
            />
          ))
        ) : (
          <div className="border-t border-gray-100 px-4 py-4 text-sm text-gray-500">
            No owners recorded.
          </div>
        )}
      </div>
    </section>
  )
}
