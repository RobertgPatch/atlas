import { bounded, format, MONEY_SCALE } from '../csv/decimal.js'

const MAX_TOKEN_BYTES = 256
const MAX_EXPONENT = 100n
const powers = Array.from({ length: 357 }, (_, exponent) => 10n ** BigInt(exponent))

export interface LexicalDecimal {
  raw: string
  value: string
  scale: number
  rounded: boolean
  roundingMode: 'HALF_AWAY_FROM_ZERO'
}

const power = (exponent: number): bigint => {
  if (exponent < 0 || exponent >= powers.length) throw new Error('DECIMAL_OVERFLOW')
  return powers[exponent]!
}

/**
 * Converts a source numeric token to numeric(28, scale) using only lexical
 * parsing and BigInt arithmetic. The raw token is retained for evidence and
 * rounding is explicitly reported; IEEE-754 conversion never participates.
 */
export function lexicalDecimal(raw: string, scale = MONEY_SCALE): LexicalDecimal {
  if (!Number.isInteger(scale) || scale < 0 || scale > 28) throw new Error('DECIMAL_SCALE')
  if (typeof raw !== 'string') throw new Error('INVALID_DECIMAL')
  if (Buffer.byteLength(raw, 'utf8') > MAX_TOKEN_BYTES) throw new Error('DECIMAL_TOKEN_LIMIT')
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(raw)
  if (!match) throw new Error('INVALID_DECIMAL')

  const exponentToken = match[5] ?? '0'
  const exponentMagnitude = BigInt(exponentToken.replace(/^[+-]/, '') || '0')
  if (exponentMagnitude > MAX_EXPONENT) throw new Error('DECIMAL_EXPONENT_LIMIT')
  const exponent = Number(BigInt(exponentToken))
  const whole = match[2] ?? '0'
  const fraction = match[3] ?? match[4] ?? ''
  const coefficient = BigInt(`${whole}${fraction}`)
  const sign = match[1] === '-' ? -1n : 1n
  const shift = exponent - fraction.length + scale

  let magnitude: bigint
  let rounded = false
  if (shift >= 0) {
    magnitude = coefficient * power(shift)
  } else {
    const divisor = power(-shift)
    const remainder = coefficient % divisor
    magnitude = coefficient / divisor
    rounded = remainder !== 0n
    if (remainder * 2n >= divisor) magnitude += 1n
  }
  const scaled = bounded(sign * magnitude)
  return {
    raw,
    value: format(scaled, scale),
    scale,
    rounded,
    roundingMode: 'HALF_AWAY_FROM_ZERO',
  }
}
