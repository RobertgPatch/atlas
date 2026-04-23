import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import type { K1FieldValue, K1IssueSeverity } from '../../../../../../packages/types/src/review-finalization'

interface Props {
  fields: K1FieldValue[]
  /** Initial linked field id (e.g. when raised from a specific row). */
  initialFieldId?: string | null
  onSubmit: (args: {
    fieldId: string | null
    message: string
    severity: K1IssueSeverity
  }) => void
  onCancel: () => void
  isPending?: boolean
}

const SEVERITY_LABELS: Record<K1IssueSeverity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

export const IssueQueueDialog = ({
  fields,
  initialFieldId = null,
  onSubmit,
  onCancel,
  isPending = false,
}: Props) => {
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState<K1IssueSeverity>('MEDIUM')
  const [fieldId, setFieldId] = useState<string | null>(initialFieldId)

  const canSubmit = message.trim().length > 0 && !isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ fieldId, message: message.trim(), severity })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="issue-dialog"
    >
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            <h2 id="issue-dialog-title" className="text-sm font-semibold text-gray-800">
              Open Issue
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-md p-1 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Optional field picker */}
          <div>
            <label htmlFor="issue-field" className="block text-xs font-medium text-gray-600 mb-1">
              Linked field <span className="text-gray-400">(optional)</span>
            </label>
            <select
              id="issue-field"
              value={fieldId ?? ''}
              onChange={(e) => setFieldId(e.target.value || null)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
            >
              <option value="">— None —</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity picker */}
          <div>
            <label htmlFor="issue-severity" className="block text-xs font-medium text-gray-600 mb-1">
              Severity
            </label>
            <div id="issue-severity" className="flex gap-2">
              {(Object.keys(SEVERITY_LABELS) as K1IssueSeverity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    severity === s
                      ? s === 'HIGH'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : s === 'MEDIUM'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                  aria-pressed={severity === s}
                >
                  {SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label htmlFor="issue-message" className="block text-xs font-medium text-gray-600 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="issue-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-400 resize-none"
              data-testid="issue-message-input"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-md bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:bg-gray-300"
              data-testid="issue-submit-button"
            >
              {isPending ? 'Saving…' : 'Open Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
