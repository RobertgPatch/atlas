import { useId } from 'react'
import type { K1TrackerValue } from '../../../../../../packages/types/src/k1-tracker'
import type { K1TrackerWritableFieldKey } from '../../../../../../packages/types/src/k1-tracker'
import { CurrencyInput } from '../../../components/shared/CurrencyField'
import type { K1FieldDefinition } from '../k1FieldGroups'

const sourceLabel = (source: K1TrackerValue): string => {
  const sourceName = source.sourceType.replaceAll('_', ' ')
  const location = source.sourceSheet
    ? `${source.sourceSheet}${source.sourceCell ? `!${source.sourceCell}` : ''}`
    : null
  const carryforward = source.carryforwardFromTaxYear ? `from ${source.carryforwardFromTaxYear}` : null
  return [sourceName, location, carryforward].filter(Boolean).join(' · ')
}

const displayCurrency = (value: string | null | undefined): string => value == null
  ? 'Not available'
  : new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value))

export interface K1FormFieldCellProps {
  field: K1FieldDefinition
  value: string
  onChange: (value: string) => void
  canEdit: boolean
  derivedFromCashActivity?: boolean
  source?: K1TrackerValue
  carryforward?: string
  conflictMessage?: string
  visibleLabel?: string | false
  compact?: boolean
}

export type K1FormFieldState = Omit<K1FormFieldCellProps, 'visibleLabel' | 'compact'>
export type K1FormFieldStateGetter = (fieldKey: K1TrackerWritableFieldKey) => K1FormFieldState

export function K1FormFieldCell({
  field,
  value,
  onChange,
  canEdit,
  derivedFromCashActivity = false,
  source,
  carryforward,
  conflictMessage,
  visibleLabel,
  compact = false,
}: K1FormFieldCellProps) {
  const id = useId()
  const annotationId = `${id}-annotation`
  const conflictId = `${id}-conflict`
  const label = visibleLabel === undefined ? field.label : visibleLabel
  const hasAnnotation = derivedFromCashActivity || Boolean(source) || Boolean(carryforward)
  const describedBy = [
    hasAnnotation ? annotationId : undefined,
    conflictMessage ? conflictId : undefined,
  ].filter(Boolean).join(' ') || undefined
  const controlClass = `${compact ? 'min-h-9 px-2 py-1.5 text-xs' : 'min-h-11 px-3 py-2.5 text-sm'} mt-1 w-full min-w-0 rounded-none border border-gray-400 bg-white text-gray-950 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-jackson-gold disabled:bg-gray-100 disabled:text-gray-700`
  const disabled = !canEdit || derivedFromCashActivity

  const control = field.inputKind === 'money'
    ? <CurrencyInput
      id={id}
      aria-label={field.label}
      aria-describedby={describedBy}
      disabled={disabled}
      allowNegative={field.allowNegative}
      value={value}
      onChange={onChange}
      placeholder={carryforward ? displayCurrency(carryforward) : '$0.00'}
      className={`${compact ? 'py-1.5 text-xs' : 'py-2.5'} min-w-0 rounded-none border-gray-400 bg-white text-right font-mono tabular-nums text-gray-950 disabled:bg-gray-100 disabled:text-gray-700`}
    />
    : field.inputKind === 'select'
      ? <select
        id={id}
        aria-label={field.label}
        aria-describedby={describedBy}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass}
      >
        <option value="">Select one</option>
        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      : field.inputKind === 'checkbox'
        ? <span className={`${controlClass} flex items-center gap-2 ${disabled ? '!bg-gray-100 !text-gray-700' : ''}`}>
          <input
            id={id}
            type="checkbox"
            aria-label={field.label}
            aria-describedby={describedBy}
            disabled={disabled}
            checked={['true', '1', 'yes', 'checked'].includes(value.toLowerCase())}
            onChange={(event) => onChange(event.target.checked ? 'true' : '')}
            className="h-4 w-4 shrink-0 accent-jackson-gold focus:outline-none focus:ring-2 focus:ring-jackson-gold focus:ring-offset-2"
          />
          <span className="text-[11px] font-semibold leading-tight text-gray-700">Checked on Schedule K-1</span>
        </span>
        : <span className="relative block">
          <input
            id={id}
            type="text"
            inputMode={field.inputKind === 'percentage' ? 'decimal' : undefined}
            aria-label={field.label}
            aria-describedby={describedBy}
            disabled={disabled}
            value={value}
            maxLength={field.maxLength}
            onChange={(event) => onChange(field.key.endsWith('_code') ? event.target.value.toUpperCase() : event.target.value)}
            placeholder={field.placeholder}
            className={`${controlClass} ${field.inputKind === 'percentage' ? 'pr-7 text-right font-mono tabular-nums' : ''}`}
          />
          {field.inputKind === 'percentage' && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-bold text-gray-500">%</span>}
        </span>

  return <label className="block min-w-0">
    <span className={label === false ? 'sr-only' : 'block text-[11px] font-semibold leading-tight text-gray-800'}>
      {label === false ? field.label : label}
    </span>
    {control}
    {hasAnnotation && <span id={annotationId} className="mt-1 block text-[10px] leading-snug text-gray-600">
      {derivedFromCashActivity
        ? <span className="font-semibold text-amber-800">Calculated from dated cash activity</span>
        : source
          ? sourceLabel(source)
          : `Carried from the prior year: ${displayCurrency(carryforward)}`}
    </span>}
    {conflictMessage && <span id={conflictId} className="mt-1 block border-l-2 border-red-600 pl-2 text-[10px] leading-snug text-red-800">
      Source conflict: {conflictMessage}
    </span>}
  </label>
}
