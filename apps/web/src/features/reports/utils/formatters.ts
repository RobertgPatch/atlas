const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

const PERCENT_FORMATTER = (decimals = 1) =>
  new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })

export const formatNa = (value: unknown, fallback = 'N/A'): string =>
  value == null ? fallback : String(value)

export const formatCurrency = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  return CURRENCY_FORMATTER.format(value)
}

export const formatPercent = (
  value: number | null | undefined,
  decimals = 1,
): string => {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  return PERCENT_FORMATTER(decimals).format(value / 100)
}

export const formatMultiple = (
  value: number | null | undefined,
  decimals = 2,
): string => {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  return `${value.toFixed(decimals)}x`
}

export const parseMonetaryInput = (
  value: string,
): { value: number | null; error: string | null } => {
  const normalized = value.trim().replace(/[$,\s]/g, '')

  if (normalized.length === 0) {
    return { value: null, error: 'Enter an amount.' }
  }

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return { value: null, error: 'Use numbers only (up to 2 decimals).' }
  }

  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) {
    return { value: null, error: 'Enter a valid number.' }
  }

  if (numeric < 0) {
    return { value: null, error: 'Amount cannot be negative.' }
  }

  if (numeric > 999_999_999_999.99) {
    return { value: null, error: 'Maximum is 999,999,999,999.99.' }
  }

  return { value: numeric, error: null }
}
