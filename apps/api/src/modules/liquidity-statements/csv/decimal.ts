/** Authoritative values use PostgreSQL numeric(28, scale), never IEEE floats. */
export const MONEY_SCALE = 8
export const RATIO_SCALE = 12
const powers = Array.from({ length: 29 }, (_, n) => 10n ** BigInt(n))
const power = (scale: number): bigint => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 28) throw new Error('DECIMAL_SCALE')
  return powers[scale]!
}
export const bounded = (value: bigint): bigint => {
  if (value <= -power(28) || value >= power(28)) throw new Error('DECIMAL_OVERFLOW')
  return value
}
export function decimal(raw: string, scale = MONEY_SCALE): bigint | null {
  let token = raw.trim()
  if (/^(?:|--|-|N\/A|Incomplete)$/i.test(token)) return null
  const negative = token.startsWith('(') && token.endsWith(')')
  if (negative) token = token.slice(1, -1)
  token = token.replace(/^\$/, '')
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(token) || (negative && token.startsWith('-'))) throw new Error('INVALID_DECIMAL')
  const sign = negative || token.startsWith('-') ? -1n : 1n
  const [whole, fraction = ''] = token.replace(/[-,]/g, '').split('.')
  if (fraction.length > scale) throw new Error('DECIMAL_PRECISION')
  return bounded(sign * (BigInt(whole!) * power(scale) + BigInt(fraction.padEnd(scale, '0') || '0')))
}
export function format(value: bigint, scale = MONEY_SCALE): string {
  bounded(value)
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0')
  if (scale === 0) return `${negative ? '-' : ''}${digits}`
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`
}
/** Rational -> fixed scale, ties round away from zero. */
export function round(numerator: bigint, denominator: bigint, scale = MONEY_SCALE): bigint {
  if (denominator === 0n) throw new Error('DECIMAL_DIVIDE_BY_ZERO')
  const signed = (numerator < 0n) !== (denominator < 0n) ? -1n : 1n
  const n = (numerator < 0n ? -numerator : numerator) * power(scale)
  const d = denominator < 0n ? -denominator : denominator
  return bounded(signed * (n / d + (2n * (n % d) >= d ? 1n : 0n)))
}
export const add = (a: bigint, b: bigint) => bounded(a + b)
export const subtract = (a: bigint, b: bigint) => bounded(a - b)
export const multiply = (a: bigint, b: bigint, scale = MONEY_SCALE) => round(a * b, power(scale) ** 2n, scale)
export const divide = (a: bigint, b: bigint, outputScale = MONEY_SCALE) => round(a, b, outputScale)
export const abs = (a: bigint) => a < 0n ? -a : a
export const sum = (values: bigint[]) => values.reduce(add, 0n)
export function percent(raw: string, unit: 'PERCENT_POINTS' | 'RATIO'): bigint | null {
  const value = decimal(raw.trim().replace(/%$/, ''), RATIO_SCALE)
  return value == null ? null : unit === 'RATIO' ? value : round(value, power(RATIO_SCALE) * 100n, RATIO_SCALE)
}
