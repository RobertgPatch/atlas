import { useState, type ComponentPropsWithoutRef } from 'react'

/** Commas are presentation only; never send formatted currency to the API. */
export const currencyInputValue = (text: string): string | null => {
  const value = text.trim().replace(/[$,\s]/g, '')
  if (!value) return null
  return /^\(\d+(?:\.\d*)?\)$/.test(value) ? `-${value.slice(1, -1)}` : value
}

export const formatCurrencyValue = (value: unknown): string => {
  if (value == null) return ''
  const text = String(value)
  const canonical = currencyInputValue(text)
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(canonical ?? '')
  if (!match) return text
  // Work with decimal strings so grouping never changes precision or sign.
  const integer = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${match[1]}${integer}.${(match[3] ?? '').padEnd(2, '0')}`
}

interface Props extends Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange'> {
  value: unknown
  onValueChange: (value: string | null) => void
}

export const CurrencyInput = ({ value, onValueChange, onFocus, onBlur, ...props }: Props) => {
  const [draft, setDraft] = useState<string | null>(null)
  return <input {...props} type="text" inputMode="decimal"
    value={draft ?? formatCurrencyValue(value)}
    onFocus={event => { setDraft(formatCurrencyValue(value)); onFocus?.(event) }}
    onChange={event => {
      // Keep the user's text/caret stable while editing; regroup on blur.
      setDraft(event.target.value)
      onValueChange(currencyInputValue(event.target.value))
    }}
    onBlur={event => { setDraft(null); onBlur?.(event) }}
  />
}
