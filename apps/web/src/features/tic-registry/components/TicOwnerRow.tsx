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
    <div className="grid gap-2 border-t border-gray-100 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">{owner.name}</p>
        <p className="text-xs text-gray-500">{OWNER_TYPE_LABELS[owner.ownerType]}</p>
      </div>
      <div className="flex items-center justify-between text-gray-700 sm:block sm:text-right">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 sm:hidden">TIC</span>
        {formatPercent(owner.ticPercentage)}
      </div>
      <div className="flex items-center justify-between text-gray-500 sm:block sm:text-right">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 sm:hidden">Property</span>
        {formatPercent(owner.effectivePropertyPercentage)}
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
