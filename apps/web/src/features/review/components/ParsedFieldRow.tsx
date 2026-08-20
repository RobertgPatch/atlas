import { Flag, AlertTriangle } from 'lucide-react'
import type {
  K1FieldValue,
} from '../../../../../../packages/types/src/review-finalization'
import { CONFIDENCE_COLOR } from '../hooks/useFieldEdits'
import { getK1FieldDisplay } from '../k1FieldDisplay'

interface Props {
  field: K1FieldValue
  disabled: boolean
  value: unknown
  onChange: (value: unknown) => void
  onOpenIssue?: () => void
  onEvidenceSelect?: () => void
}

const displayValue = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
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
  onEvidenceSelect,
}: Props) => {
  const display = getK1FieldDisplay(field)
  const confidence = confidenceLabel(field.confidenceBand)
  const confidenceCls = CONFIDENCE_COLOR[field.confidenceBand] ?? CONFIDENCE_COLOR.none
  const hasOpenIssue = field.linkedIssueIds.length > 0
  const isEmptyRequired = field.required && (value == null || value === '')
  const codeRow = field.valueKind === 'CODE_ROW' && value && typeof value === 'object'
    ? value as Record<string, unknown> : null
  const rawDisplay = displayValue(field.rawValueJson ?? field.rawValue) || '—'

  return (
    <div
      className={`grid gap-4 border-b border-gray-100 px-5 py-4 sm:px-6 xl:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)_auto] ${
        isEmptyRequired ? 'bg-red-50/40' : ''
      }`}
      data-testid={`field-row-${field.fieldName}`}
    >
      <div className="min-w-0 xl:pr-2">
        <div className="break-words text-sm font-semibold leading-5 text-slate-900">
          {display.title}
          {field.required && <span className="ml-1 text-red-500" aria-label="required">*</span>}
        </div>
        {display.detail && <div className="mt-1 break-words text-xs leading-5 text-slate-600">{display.detail}</div>}
        <details className="mt-2 text-[11px] text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-500 hover:text-slate-700">Extraction key</summary>
          <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 font-mono text-[10px] leading-4 text-slate-600">
            {display.sourceKey}
          </code>
        </details>
      </div>
      <div className="min-w-0">
        {field.valueKind === 'BOOLEAN' ? (
          <label className="inline-flex min-h-10 items-center gap-3 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700">
            <input type="checkbox" disabled={disabled} checked={!!value} onChange={(event) => onChange(event.target.checked)} />
            {value ? 'Checked' : 'Not checked'}
          </label>
        ) : codeRow ? (
          <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2" data-testid={`field-input-${field.fieldName}`}>
            <input aria-label={`${display.title} code`} disabled={disabled} value={displayValue(codeRow.code)}
              onChange={(event) => onChange({ ...codeRow, code: event.target.value })}
              className="rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm focus:border-cyan-600 focus:ring-2 focus:ring-cyan-200" />
            <input aria-label={`${display.title} amount`} disabled={disabled} value={displayValue(codeRow.value ?? codeRow.amount)}
              onChange={(event) => onChange({ ...codeRow, value: event.target.value })}
              className="rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm focus:border-cyan-600 focus:ring-2 focus:ring-cyan-200" />
          </div>
        ) : (
          <input
            type="text"
            disabled={disabled}
            value={displayValue(value)}
            onChange={(e) => onChange(e.target.value || null)}
            className={`w-full rounded-md border px-3 py-1.5 text-sm font-mono ${
              disabled
                ? 'bg-gray-50 text-gray-500 border-gray-200'
                : 'bg-white border-gray-300 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-600'
            }`}
            aria-label={display.title}
            data-testid={`field-input-${field.fieldName}`}
          />
        )}
        <div className="mt-1 break-words text-xs text-gray-400 font-mono">
          Provider: {rawDisplay}
        </div>
        {field.correctionHistory && field.correctionHistory.length > 0 && (
          <details className="mt-1 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-cyan-700">Correction history ({field.correctionHistory.length})</summary>
            <ol className="mt-1 space-y-1 border-l border-slate-200 pl-3">
              {field.correctionHistory.map((entry) => (
                <li key={entry.id}>v{entry.documentVersion} · {displayValue(entry.correctedValue) || 'cleared'}</li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <div className="flex min-w-24 flex-row items-center gap-2 xl:flex-col xl:items-end xl:gap-1">
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
        {field.sourceLocations && field.sourceLocations.length > 0 && (
          <button type="button" onClick={onEvidenceSelect} className="text-xs font-medium text-cyan-700 hover:text-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600">
            Page {field.sourceLocations[0].page}
          </button>
        )}
        {onOpenIssue && <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
          onClick={onOpenIssue}
          disabled={disabled}
          aria-label={`Flag an issue for ${display.title}`}
          title="Create a review issue linked to this field"
        >
          <Flag size={12} />
          Flag issue
        </button>}
      </div>
    </div>
  )
}
