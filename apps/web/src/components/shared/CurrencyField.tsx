import { forwardRef, useId, useState } from 'react'
import { formatCurrency, normalizeCurrencyInput } from './currencyInput'
import { fieldClassName } from './colorRecipes'

type CurrencyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'inputMode'> & {
  value: string
  onChange: (value: string) => void
  allowNegative?: boolean
  onValueBlur?: (value: string | null) => void
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(function CurrencyInput(
  { value, onChange, allowNegative = true, onValueBlur, id, className = '', 'aria-describedby': describedBy, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-currency-error`
  const [error, setError] = useState<string>()

  const handleBlur = () => {
    const result = normalizeCurrencyInput(value, allowNegative)
    if (result.error) {
      setError(result.error)
      onValueBlur?.(null)
      return
    }
    setError(undefined)
    const formatted = result.value == null ? '' : formatCurrency(result.value)
    if (formatted !== value) onChange(formatted)
    onValueBlur?.(result.value)
  }

  return <>
    <input
      {...props}
      ref={ref}
      id={inputId}
      value={value}
      inputMode="decimal"
      aria-invalid={error ? true : undefined}
      aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
      onChange={(event) => { setError(undefined); onChange(event.target.value) }}
      onBlur={handleBlur}
      className={`${fieldClassName} mt-1 w-full px-3 py-2 text-sm ${error ? 'border-error' : ''} ${className}`}
    />
    {error && <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
  </>
})
