import { Edit3, Trash2 } from 'lucide-react'
import type { TicOwner } from '../../../../../../packages/types/src/tic-registry'
import { formatPercent, OWNER_TYPE_LABELS } from './allocation'

interface TicOwnerRowProps {
  owner: TicOwner
  canEdit: boolean
  onEdit: (owner: TicOwner) => void
  onDelete: (owner: TicOwner) => void
}

export function TicOwnerRow({ owner, canEdit, onEdit, onDelete }: TicOwnerRowProps) {
  return (
    <div className="grid gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate font-medium text-gray-900">{owner.name}</span>
        <span className="rounded-md border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-gray-600">
          {OWNER_TYPE_LABELS[owner.ownerType]}
        </span>
      </div>
      <div className="text-gray-700 sm:text-right">
        <span className="font-medium">{formatPercent(owner.ticPercentage)}</span>
        <span className="text-gray-500"> of TIC ≈ </span>
        <span className="font-medium">{formatPercent(owner.effectivePropertyPercentage)}</span>
        <span className="text-gray-500"> of property</span>
      </div>
      <div className="flex items-center justify-end gap-1 sm:min-w-16">
        {canEdit && (
          <>
            <button
              type="button"
              title="Edit owner"
              onClick={() => onEdit(owner)}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Delete owner"
              onClick={() => onDelete(owner)}
              className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
