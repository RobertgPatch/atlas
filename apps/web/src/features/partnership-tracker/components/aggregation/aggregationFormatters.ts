export const formatExactMoney = (value: string | null | undefined) => value == null
  ? null
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))

export const formatMultiple = (value: string | null | undefined) => value == null ? null : `${Number(value).toFixed(2)}×`

export const formatPercent = (value: string | null | undefined) => value == null ? null : `${(Number(value) * 100).toFixed(1)}%`

export const formatLedgerDate = (value: string | null | undefined) => value == null
  ? null
  : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))

export const humanizeCode = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
