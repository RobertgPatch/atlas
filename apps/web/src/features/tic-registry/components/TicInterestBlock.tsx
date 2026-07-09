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
    <section className="border-t border-gray-200 bg-gray-50/70">
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-emerald-900" />
              <h3 className="truncate text-base font-semibold text-gray-950">{interest.name}</h3>
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
                {ACQUISITION_ORIGIN_LABELS[interest.acquisitionOrigin]}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(interest.status)}`}>
                {INTEREST_STATUS_LABELS[interest.status]}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                {interest.acquisitionOrigin === 'cash' ? 'Cash purchase' : '1031 exchange'}
              </span>
              {interest.acquisitionValueUsd != null && (
                <span>{formatCurrency(interest.acquisitionValueUsd)}</span>
              )}
              <span>{formatDate(interest.acquisitionDate)}</span>
              {interest.relinquishedSourceLabel && (
                <span>source {interest.relinquishedSourceLabel}</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">
              {formatPercent(interest.propertyPercentage)}
            </span>
            <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${allocationTone(interest.allocation.status)}`}>
              Owners {formatPercent(interest.allocation.allocatedPercentage)}
            </span>
            {canEdit && (
              <button
                type="button"
                title="Delete TIC interest"
                onClick={() => onDeleteInterest(interest)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-2">
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
          <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No owners recorded.
          </div>
        )}
        </div>

        <p className="mt-3 text-xs font-medium text-gray-500">
          Owner shares: {interest.allocation.message}
        </p>

        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAddOwner(interest)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Add owner
            </button>
            <button
              type="button"
              onClick={() => onEditInterest(interest)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Edit3 className="h-4 w-4" />
              Edit TIC
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
