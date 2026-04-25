import { useMemo, useState } from 'react'
import { CheckIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { formatCurrency, parseMonetaryInput } from '../utils/formatters'

export interface EditableCellProps {
  value: number | null
  editable: boolean
  disabled?: boolean
  onCommit: (nextValue: number) => Promise<{ status: 'ok' } | { status: 'conflict'; message: string }>
  onUndo?: () => void
  showUndo?: boolean
}

export function EditableCell({
  value,
  editable,
  disabled = false,
  onCommit,
  onUndo,
  showUndo = false,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftValue, setDraftValue] = useState(
    value == null ? '' : value.toFixed(2),
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const displayValue = useMemo(() => formatCurrency(value), [value])

  const beginEdit = () => {
    if (!editable || disabled) return
    setDraftValue(value == null ? '' : value.toFixed(2))
    setError(null)
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setDraftValue(value == null ? '' : value.toFixed(2))
    setError(null)
    setIsEditing(false)
  }

  const submit = async () => {
    const parsed = parseMonetaryInput(draftValue)
    if (parsed.error || parsed.value == null) {
      setError(parsed.error)
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const result = await onCommit(parsed.value)
      if (result.status === 'conflict') {
        setError(result.message)
        return
      }

      setIsEditing(false)
      setDraftValue(parsed.value.toFixed(2))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isEditing) {
    return (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={beginEdit}
          disabled={!editable || disabled}
          className={`rounded px-1.5 py-0.5 text-right tabular-nums transition-colors ${
            editable && !disabled
              ? 'hover:bg-accent-light text-text-primary'
              : 'cursor-default text-text-secondary'
          }`}
          aria-label={editable ? 'Edit amount' : 'Amount is read only'}
          data-testid="editable-cell-display"
        >
          {displayValue}
        </button>

        {showUndo && onUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-accent-light"
            aria-label="Undo latest edit"
          >
            <RotateCcwIcon className="h-3.5 w-3.5" />
            Undo
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input
          value={draftValue}
          onChange={(event) => {
            setDraftValue(event.target.value)
            if (error) setError(null)
          }}
          className="w-36 rounded border border-border px-2 py-1 text-right text-sm tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          aria-label="Commitment amount"
          data-testid="editable-cell-input"
        />

        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSaving}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-green-700 hover:bg-green-50 disabled:opacity-50"
          aria-label="Save amount"
        >
          <CheckIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={cancelEdit}
          disabled={isSaving}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-text-secondary hover:bg-gray-100 disabled:opacity-50"
          aria-label="Cancel edit"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p className="max-w-56 text-right text-xs text-error" role="alert" data-testid="editable-cell-error">
          {error}
        </p>
      )}
    </div>
  )
}
