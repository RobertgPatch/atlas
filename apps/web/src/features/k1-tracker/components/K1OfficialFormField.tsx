import { Plus, X } from 'lucide-react'
import { useId } from 'react'
import type {
  K1TrackerCodeEntry,
  K1TrackerOfficialFormSource,
  K1TrackerOfficialFormValue,
} from '../../../../../../packages/types/src/k1-tracker'
import { CurrencyInput } from '../../../components/shared/CurrencyField'
import type { K1OfficialFormFieldDefinition } from '../k1OfficialFormFields'

export interface K1OfficialFormFieldState {
  field: K1OfficialFormFieldDefinition
  value: K1TrackerOfficialFormValue
  onChange: (value: K1TrackerOfficialFormValue) => void
  canEdit: boolean
  source?: K1TrackerOfficialFormSource
}

export type K1OfficialFormFieldStateGetter = (fieldKey: K1OfficialFormFieldDefinition['key']) => K1OfficialFormFieldState

const inputClass = (compact = false) => `${compact ? 'min-h-9 py-1.5' : 'min-h-10 py-2'} mt-1 w-full min-w-0 rounded-none border border-gray-400 bg-white px-2.5 text-xs text-gray-950 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-focus disabled:bg-gray-100 disabled:text-gray-600`

function CodedEntries({ field, value, onChange, canEdit, compact = false }: K1OfficialFormFieldState & { compact?: boolean }) {
  const entries = Array.isArray(value) ? value : []
  const visibleEntries: K1TrackerCodeEntry[] = entries
  const update = (index: number, patch: Partial<K1TrackerCodeEntry>) => {
    const next = [...visibleEntries]
    next[index] = { ...next[index]!, ...patch }
    onChange(next)
  }

  return <fieldset className="min-w-0">
    <legend className="text-[10px] font-semibold leading-tight text-gray-800">{field.label}</legend>
    {!visibleEntries.length && <p className="mt-1 text-[10px] text-gray-500">No code or statement entries recorded.</p>}
    <div className="mt-1 space-y-1.5">
      {visibleEntries.map((entry, index) => <div key={`${index}-${entry.code}`} className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_2.75rem] gap-1.5">
        <label className="min-w-0">
          <span className="sr-only">{field.label} code {index + 1}</span>
          <input
            aria-label={`${field.label} code ${index + 1}`}
            disabled={!canEdit}
            maxLength={24}
            value={entry.code}
            onChange={(event) => update(index, { code: event.target.value.toUpperCase() })}
            placeholder="Code"
            className={`${inputClass(compact)} mt-0 font-mono uppercase`}
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">{field.label} value {index + 1}</span>
          <input
            aria-label={`${field.label} value ${index + 1}`}
            disabled={!canEdit}
            maxLength={4_000}
            value={entry.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder="Amount, description, or SEE STMT"
            className={`${inputClass(compact)} mt-0 font-mono`}
          />
        </label>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))}
          aria-label={`Remove ${field.label} entry ${index + 1}`}
          className={`flex ${compact ? 'min-h-9' : 'min-h-11'} items-center justify-center border border-gray-400 text-gray-600 hover:bg-gray-950 hover:text-white focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-40`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>)}
    </div>
    {canEdit && <button
      type="button"
      onClick={() => onChange([...entries, { code: '', value: '' }])}
      className={`group mt-1.5 inline-flex ${compact ? 'min-h-9' : 'min-h-11'} items-center gap-2 rounded-none px-2 py-1.5 text-xs font-semibold text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-950 active:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1`}
    >
      <span
        aria-hidden="true"
        className="grid h-6 w-6 place-items-center border border-gray-300 bg-white transition-colors duration-150 group-hover:border-gray-500"
      >
        <Plus className="h-3 w-3" strokeWidth={2} />
      </span>
      <span>Add code row</span>
    </button>}
  </fieldset>
}

function SourceEvidence({ source }: { source?: K1TrackerOfficialFormSource }) {
  if (!source) return null
  const label = source.sourceType === 'FINALIZED_K1' ? 'Imported from reviewed K-1' : source.sourceType.replaceAll('_', ' ').toLowerCase()
  return <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-indigo-700" data-testid="official-field-source">
    {source.sourceK1DocumentId
      ? <a href={`/k1/${source.sourceK1DocumentId}/review`} className="underline decoration-indigo-300 underline-offset-2 hover:text-indigo-950">{label}</a>
      : <span>{label}</span>}
    {source.createdByEmail && <span className="normal-case font-medium tracking-normal text-slate-500">by {source.createdByEmail}</span>}
  </div>
}

export function K1OfficialFormField({ field, value, onChange, canEdit, source, compact = false }: K1OfficialFormFieldState & { compact?: boolean }) {
  const id = useId()
  if (field.kind === 'coded') return <div data-k1-official-field={field.key}><CodedEntries field={field} value={value} onChange={onChange} canEdit={canEdit} source={source} compact={compact} /><SourceEvidence source={source} /></div>

  if (field.kind === 'boolean') {
    return <div data-k1-official-field={field.key}><label className={`flex ${compact ? 'min-h-8' : 'min-h-11'} items-start gap-2.5 text-[11px] font-semibold leading-snug text-gray-800`}>
      <input
        id={id}
        type="checkbox"
        disabled={!canEdit}
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-1 disabled:opacity-60"
      />
      <span>{field.label}</span>
    </label><SourceEvidence source={source} /></div>
  }

  const stringValue = typeof value === 'string' ? value : ''
  if (field.kind === 'money') {
    return <div data-k1-official-field={field.key}><label className="block min-w-0">
      <span className="block text-[10px] font-semibold leading-tight text-gray-800">{field.label}</span>
      <CurrencyInput
        id={id}
        aria-label={field.label}
        disabled={!canEdit}
        allowNegative={field.allowNegative ?? false}
        value={stringValue}
        onChange={onChange}
        placeholder="$0.00"
        className="min-w-0 rounded-none border-gray-400 bg-white py-1.5 text-right font-mono text-xs tabular-nums text-gray-950 disabled:bg-gray-100 disabled:text-gray-600"
      />
    </label><SourceEvidence source={source} /></div>
  }

  if (field.kind === 'choice') {
    return <div data-k1-official-field={field.key}><label className="block min-w-0">
      <span className="block text-[10px] font-semibold leading-tight text-gray-800">{field.label}</span>
      <select id={id} aria-label={field.label} disabled={!canEdit} value={stringValue} onChange={(event) => onChange(event.target.value)} className={inputClass(compact)}>
        <option value="">Select</option>
        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label><SourceEvidence source={source} /></div>
  }

  if (field.kind === 'multiline') {
    return <div data-k1-official-field={field.key}><label className="block min-w-0">
      <span className="block text-[10px] font-semibold leading-tight text-gray-800">{field.label}</span>
      <textarea id={id} aria-label={field.label} disabled={!canEdit} rows={compact ? 1 : 3} maxLength={4_000} value={stringValue} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} className={`${inputClass(compact)} resize-y`} />
    </label><SourceEvidence source={source} /></div>
  }

  return <div data-k1-official-field={field.key}><label className="block min-w-0">
    <span className="block text-[10px] font-semibold leading-tight text-gray-800">{field.label}</span>
    <div className="relative">
      <input
        id={id}
        aria-label={field.label}
        type={field.kind === 'date' ? 'date' : 'text'}
        inputMode={field.kind === 'percentage' ? 'decimal' : undefined}
        disabled={!canEdit}
        maxLength={field.kind === 'percentage' ? 16 : 4_000}
        value={stringValue}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className={`${inputClass(compact)} ${field.kind === 'percentage' ? 'pr-8 text-right font-mono tabular-nums' : ''}`}
      />
      {field.kind === 'percentage' && <span aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 font-mono text-xs text-gray-500">%</span>}
    </div>
  </label><SourceEvidence source={source} /></div>
}
