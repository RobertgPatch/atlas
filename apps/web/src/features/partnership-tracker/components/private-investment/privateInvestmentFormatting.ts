import type { PrivateInvestmentActivityRow } from '../../../../../../../packages/types/src/partnership-tracker'

export const formatAccountingMoney = (
  value: string | null | undefined,
  direction?: PrivateInvestmentActivityRow['displayDirection'],
): string => {
  if (value == null) return '—'
  const negative = value.startsWith('-')
  const [whole, fraction = '00'] = value.replace(/^-/, '').split('.')
  const groupedWhole = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const formatted = `$${groupedWhole}.${fraction.padEnd(2, '0').slice(0, 2)}`
  return direction === 'OUTFLOW' || negative ? `(${formatted})` : formatted
}

export const formatDate = (value: string | null | undefined): string => value
  ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
  : '—'

export const formatRatio = (value: string | null | undefined): string =>
  value == null ? '—' : `${(Number(value) * 100).toFixed(2)}%`

export const formatMultiple = (value: string | null | undefined): string =>
  value == null ? '—' : `${Number(value).toFixed(2)}x`

export const humanizePrivateInvestmentCode = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^|\s)\w/g, (letter) => letter.toUpperCase())

export const privateInvestmentSourceLabel = (row: PrivateInvestmentActivityRow): string =>
  row.sourceKind === 'NET_CASH_ACTIVITY' ? 'Cash Activity' : 'FMV'
