import { Edit3, Plus, Trash2 } from 'lucide-react'
import type {
  TicInterest,
  TicOwner,
  TicProperty,
} from '../../../../../../packages/types/src/tic-registry'
import {
  allocationTone,
  formatCurrency,
  formatDate,
  formatPercent,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  statusTone,
} from './allocation'
import { TicInterestBlock } from './TicInterestBlock'

interface TicPropertyCardProps {
  property: TicProperty
  canEdit: boolean
  onEditProperty: (property: TicProperty) => void
  onDeleteProperty: (property: TicProperty) => void
  onAddInterest: (property: TicProperty) => void
  onEditInterest: (property: TicProperty, interest: TicInterest) => void
  onDeleteInterest: (interest: TicInterest) => void
  onAddOwner: (interest: TicInterest) => void
  onEditOwner: (interest: TicInterest, owner: TicOwner) => void
  onDeleteOwner: (owner: TicOwner) => void
}

const BAR_COLORS = [
  'bg-atlas-gold',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
]

export function TicPropertyCard({
  property,
  canEdit,
  onEditProperty,
  onDeleteProperty,
  onAddInterest,
  onEditInterest,
  onDeleteInterest,
  onAddOwner,
  onEditOwner,
  onDeleteOwner,
}: TicPropertyCardProps) {
  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-gray-950">{property.name}</h2>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
              <span>{PROPERTY_TYPE_LABELS[property.propertyType]}</span>
              <span>acquired {formatDate(property.acquiredDate)}</span>
              {property.estimatedValueUsd != null && (
                <span>{formatCurrency(property.estimatedValueUsd)}</span>
              )}
              <span>{property.interests.length} TIC interests</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(property.status)}`}>
              {PROPERTY_STATUS_LABELS[property.status]}
            </span>
            <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${allocationTone(property.allocation.status)}`}>
              TIC {formatPercent(property.allocation.allocatedPercentage)}
            </span>
            {canEdit && (
              <>
                <button
                  type="button"
                  title="Edit property"
                  onClick={() => onEditProperty(property)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Delete property"
                  onClick={() => onDeleteProperty(property)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
          {property.interests.length > 0 ? property.interests.map((interest, index) => (
            <div
              key={interest.id}
              className={`inline-block h-full align-top ${BAR_COLORS[index % BAR_COLORS.length]}`}
              style={{ width: `${Math.max(0, Math.min(interest.propertyPercentage, 100))}%` }}
            />
          )) : (
            <div className="h-full w-full bg-gray-200" />
          )}
        </div>

        {property.interests.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700">
            {property.interests.map((interest, index) => (
              <span key={interest.id} className="inline-flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${BAR_COLORS[index % BAR_COLORS.length]}`} />
                <span className="truncate font-medium">{interest.name}</span>
                <span className="text-gray-500">{formatPercent(interest.propertyPercentage)}</span>
              </span>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs font-medium text-gray-500">
          TIC shares: {property.allocation.message}
        </p>

        {property.notes && (
          <p className="mt-3 text-sm leading-6 text-gray-600">{property.notes}</p>
        )}
      </div>

      {property.interests.length > 0 ? (
        property.interests.map((interest) => (
          <TicInterestBlock
            key={interest.id}
            interest={interest}
            canEdit={canEdit}
            onEditInterest={(selectedInterest) => onEditInterest(property, selectedInterest)}
            onDeleteInterest={onDeleteInterest}
            onAddOwner={onAddOwner}
            onEditOwner={onEditOwner}
            onDeleteOwner={onDeleteOwner}
          />
        ))
      ) : (
        <div className="border-t border-gray-200 px-5 py-5 text-sm text-gray-500">
          No TIC interests recorded.
        </div>
      )}

      {canEdit && (
        <div className="border-t border-gray-200 bg-gray-50/70 px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={() => onAddInterest(property)}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Add TIC interest
          </button>
        </div>
      )}
    </article>
  )
}
