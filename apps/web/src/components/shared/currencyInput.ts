export type CurrencyInputParseResult = { value: string | null; error?: string }

const invalid = (error: string): CurrencyInputParseResult => ({ value: null, error })

export function normalizeCurrencyInput(rawValue: string, allowNegative = true): CurrencyInputParseResult {
  let raw = rawValue.trim()
  if (!raw) return { value: null }

  let negative = false
  if (raw.startsWith('(') || raw.endsWith(')')) {
    if (!raw.startsWith('(') || !raw.endsWith(')')) return invalid('Use matching parentheses for a negative amount.')
    negative = true
    raw = raw.slice(1, -1).trim()
  }
  if (raw.startsWith('-')) {
    if (negative) return invalid('Use either a minus sign or parentheses, not both.')
    negative = true
    raw = raw.slice(1).trim()
  }
  if (raw.startsWith('$')) raw = raw.slice(1).trim()
  if (raw.includes('$') || raw.includes('-') || raw.includes('(') || raw.includes(')')) return invalid('Enter a valid US currency amount.')
  if (negative && !allowNegative) return invalid('This amount cannot be negative.')

  const match = raw.match(/^((?:\d+|\d{1,3}(?:,\d{3})+))(?:\.(\d{1,2}))?$/)
  if (!match) return invalid('Use digits, valid comma grouping, and no more than two decimal places.')

  const whole = BigInt(match[1]!.replaceAll(',', '')).toString()
  const fraction = (match[2] ?? '').padEnd(2, '0')
  return { value: `${negative ? '-' : ''}${whole}.${fraction}` }
}

export function formatCurrency(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  const match = value.match(/^(-?)(\d+)\.(\d{2})$/)
  if (!match) return value
  const grouped = match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${match[1] === '-' ? '-' : ''}$${grouped}.${match[3]}`
}
