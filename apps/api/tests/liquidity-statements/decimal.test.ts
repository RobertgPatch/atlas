import { describe, expect, it } from 'vitest'
import { decimal, format, add, subtract, multiply, divide, percent, round } from '../../src/modules/liquidity-statements/csv/decimal.js'

describe('exact CSV decimals', () => {
  it('parses signed locale grammar without rounding or floating point', () => {
    expect(format(decimal('($1,250.50)')!)).toBe('-1250.5')
    expect(format(decimal(' 0 ')!)).toBe('0')
    expect(format(decimal('000001.00000001')!)).toBe('1.00000001')
    expect(decimal('Incomplete')).toBeNull()
    expect(decimal('N/A')).toBeNull()
    expect(format(add(decimal('0.1')!, decimal('0.2')!))).toBe('0.3')
    expect(format(subtract(decimal('800')!, decimal('-200')!))).toBe('1000')
  })
  it.each(['1,23', '1e3', '=1+2', 'NaN', 'Infinity', '--1', '(+1)', '1.000000001', '100000000000000000000'])('rejects unsafe numeric %s', value => {
    expect(() => decimal(value)).toThrow()
  })
  it('retains unavailable and rejects overflow in results', () => {
    expect(decimal('--')).toBeNull()
    expect(() => add(decimal('99999999999999999999.99999999')!, 1n)).toThrow()
    expect(() => divide(1n, 0n)).toThrow()
  })
  it('uses explicit percentage units and half-away-from-zero rounding', () => {
    expect(format(percent('-20.27', 'PERCENT_POINTS')!, 12)).toBe('-0.2027')
    expect(format(percent('0.2', 'RATIO')!, 12)).toBe('0.2')
    expect(format(divide(decimal('-200')!, decimal('1000')!, 12), 12)).toBe('-0.2')
    expect(round(125n, 1n, 2)).toBe(12500n)
    expect(format(multiply(decimal('0.00000001')!, decimal('0.5')!))).toBe('0.00000001')
    expect(format(multiply(decimal('-0.00000001')!, decimal('0.5')!))).toBe('-0.00000001')
  })
})
