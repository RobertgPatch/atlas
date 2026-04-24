import { Link, AlertTriangle } from 'lucide-react'
import type {
  K1FieldValue,
} from '../../../../../../packages/types/src/review-finalization'
import { CONFIDENCE_COLOR } from '../hooks/useFieldEdits'

interface Props {
  field: K1FieldValue
  disabled: boolean
  value: string | null
  onChange: (value: string | null) => void
  onOpenIssue: () => void
}

const confidenceLabel = (band: K1FieldValue['confidenceBand']) => {
  switch (band) {
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    case 'low':
      return 'Low'
    default:
      return '—'
  }
}

export const ParsedFieldRow = ({
  field,
  disabled,
  value,
  onChange,
  onOpenIssue,
}: Props) => {
  const confidence = confidenceLabel(field.confidenceBand)
  const confidenceCls = CONFIDENCE_COLOR[field.confidenceBand] ?? CONFIDENCE_COLOR.none
  const hasOpenIssue = field.linkedIssueIds.length > 0
  const isEmptyRequired = field.required && !value

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 ${
        isEmptyRequired ? 'bg-red-50/40' : ''
      }`}
      data-testid={`field-row-${field.fieldName}`}
    >
      <div className="w-56 shrink-0">
        <div className="text-sm font-medium text-gray-800">{field.label}</div>
        <div className="text-xs text-gray-500">
          {field.fieldName}
          {field.required && <span className="ml-1 text-red-500">*</span>}
        </div>
      </div>
      <div className="flex-1">
        <input
          type="text"
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={`w-full rounded-md border px-3 py-1.5 text-sm font-mono ${
            disabled
              ? 'bg-gray-50 text-gray-500 border-gray-200'
              : 'bg-white border-gray-300 focus:ring-2 focus:ring-blue-400 focus:border-blue-400'
          }`}
          aria-label={field.label}
          data-testid={`field-input-${field.fieldName}`}
        />
        <div className="mt-1 text-xs text-gray-400 font-mono truncate">
          Raw: {field.rawValue ?? '—'}
        </div>
      </div>
      <div className="w-24 shrink-0 flex flex-col items-end gap-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceCls}`}
          title={
            field.confidenceScore != null
              ? `${Math.round(field.confidenceScore * 100)}%`
              : 'no confidence score'
          }
        >
          {confidence}
        </span>
        {hasOpenIssue && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="Linked open issue">
            <AlertTriangle size={12} />
            issue
          </span>
        )}
        <button
          type="button"
          className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
          onClick={onOpenIssue}
          disabled={disabled}
        >
          <Link size={12} />
          Raise
        </button>
      </div>
    </div>
  )
}
