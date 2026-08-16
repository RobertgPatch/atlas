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

  return <label className="block min-w-0" data-k1-field={field.key}>
    <span className={label === false ? 'sr-only' : 'block text-[11px] font-semibold leading-tight text-gray-800'}>
      {label === false ? field.label : label}
    </span>
    <CurrencyInput
      id={id}
      aria-label={field.label}
      aria-describedby={[
        hasAnnotation ? annotationId : undefined,
        conflictMessage ? conflictId : undefined,
      ].filter(Boolean).join(' ') || undefined}
      disabled={!canEdit || derivedFromCashActivity}
      allowNegative={field.allowNegative}
      value={value}
      onChange={onChange}
      placeholder={carryforward ? displayCurrency(carryforward) : '$0.00'}
      className={`${compact ? 'py-1.5 text-xs' : 'py-2.5'} min-w-0 rounded-none border-gray-400 bg-white text-right font-mono tabular-nums text-gray-950 disabled:bg-gray-100 disabled:text-gray-700`}
    />
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
