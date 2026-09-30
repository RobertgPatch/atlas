import { describe, expect, it } from 'vitest'
import { lexicalDecimal } from '../../src/modules/liquidity-statements/readers/lexical-decimal.js'

// Independently authored decimal expectations. Never derive these through the
// implementation, Number/parseFloat, ExcelJS or the source fixture's parser.
describe('exact XLSX numeric lexemes', () => {
  it.each([
    ['0', '0'], ['-0', '0'], ['+0.000000000000', '0'], ['-0E-100', '0'],
    ['+001.2500', '1.25'], ['-.5', '-0.5'], ['1.', '1'],
    ['1e3', '1000'], ['1.2345E+3', '1234.5'], ['123456789e-8', '1.23456789'],
    ['-123456789E-8', '-1.23456789'], ['0.00000001e+8', '1'],
  ])('expands %s to the exact canonical string %s', (raw, value) => {
    expect(lexicalDecimal(raw)).toEqual({ raw, value, scale: 8, rounded: false, roundingMode: 'HALF_AWAY_FROM_ZERO' })
  })

  it.each([
    ['9007199254740993', '9007199254740993', false],
    ['10000000000000000001.00000001', '10000000000000000001.00000001', false],
    ['9007199254740993.123456789', '9007199254740993.12345679', true],
    ['9.007199254740993123456789e15', '9007199254740993.12345679', true],
    ['-1.234567890123456789E-7', '-0.00000012', true],
    ['1.000000005', '1.00000001', true],
  ])('preserves source precision binary floats would lose: %s', (raw, value, rounded) => {
    expect(lexicalDecimal(raw)).toMatchObject({ raw, value, rounded })
  })

  it.each([
    ['1.234567884', '1.23456788'], ['1.234567885', '1.23456789'], ['1.234567895', '1.2345679'],
    ['-1.234567884', '-1.23456788'], ['-1.234567885', '-1.23456789'], ['-1.234567895', '-1.2345679'],
    ['0.000000004999', '0'], ['0.000000005', '0.00000001'],
    ['-0.000000004999', '0'], ['-0.000000005', '-0.00000001'],
    ['9.999999995', '10'], ['-9.999999995', '-10'],
  ])('quantizes eight-place %s half away from zero to %s', (raw, value) => {
    expect(lexicalDecimal(raw, 8)).toEqual({ raw, value, scale: 8, rounded: true, roundingMode: 'HALF_AWAY_FROM_ZERO' })
  })

  it.each([
    ['0.1234567890124', '0.123456789012'], ['0.1234567890125', '0.123456789013'],
    ['-0.1234567890125', '-0.123456789013'], ['5E-13', '0.000000000001'],
    ['-5E-13', '-0.000000000001'], ['4.999e-13', '0'],
  ])('quantizes twelve-place ratio %s to %s without display-percent conversion', (raw, value) => {
    expect(lexicalDecimal(raw, 12)).toEqual({ raw, value, scale: 12, rounded: true, roundingMode: 'HALF_AWAY_FROM_ZERO' })
  })

  it('retains raw precision and records the operation without claiming trailing zero removal changed value', () => {
    expect(lexicalDecimal('1.230000000000')).toMatchObject({ raw: '1.230000000000', value: '1.23', rounded: false, scale: 8, roundingMode: 'HALF_AWAY_FROM_ZERO' })
    expect(lexicalDecimal('0.1250000000000', 12)).toMatchObject({ value: '0.125', rounded: false, scale: 12 })
    expect(lexicalDecimal('25', 12).value).toBe('25')
    expect(lexicalDecimal('0.25', 12).value).toBe('0.25')
  })

  it('preserves supported sub-cent precision before any portfolio aggregation', () => {
    expect(lexicalDecimal('0.0049')).toMatchObject({ value: '0.0049', rounded: false })
    expect(lexicalDecimal('-0.0049')).toMatchObject({ value: '-0.0049', rounded: false })
    expect(lexicalDecimal('0.00000001')).toMatchObject({ value: '0.00000001', rounded: false })
  })

  it.each([
    ['99999999999999999999.99999999', 8], ['-99999999999999999999.99999999', 8],
    ['9999999999999999.999999999999', 12], ['-9999999999999999.999999999999', 12],
  ] as const)('accepts exact boundary %s at numeric(28,%i)', (raw, scale) => {
    expect(lexicalDecimal(raw, scale)).toMatchObject({ value: raw, scale, rounded: false })
  })

  it.each([
    ['1e20', 8], ['-1e20', 8], ['1e16', 12], ['-1e16', 12],
    ['99999999999999999999.999999995', 8], ['-99999999999999999999.999999995', 8],
    ['9999999999999999.9999999999995', 12], ['-9999999999999999.9999999999995', 12],
  ] as const)('rejects magnitude or rounding-induced overflow for %s at scale %i', (raw, scale) => {
    expect(() => lexicalDecimal(raw, scale)).toThrow('DECIMAL_OVERFLOW')
  })

  it('allows extra digits just below an overflow-producing midpoint', () => {
    expect(lexicalDecimal('99999999999999999999.999999994', 8)).toMatchObject({ value: '99999999999999999999.99999999', rounded: true })
    expect(lexicalDecimal('9999999999999999.9999999999994', 12)).toMatchObject({ value: '9999999999999999.999999999999', rounded: true })
  })

  it('enforces 256 raw characters before trimming zeroes or expanding exponents', () => {
    const atLimit = `${'0'.repeat(255)}1`
    expect(atLimit.length).toBe(256)
    expect(lexicalDecimal(atLimit)).toMatchObject({ raw: atLimit, value: '1', rounded: false })
    expect(() => lexicalDecimal('0'.repeat(257))).toThrow('DECIMAL_TOKEN_LIMIT')
    expect(() => lexicalDecimal(`${'0'.repeat(254)}e-1`)).toThrow('DECIMAL_TOKEN_LIMIT')
  })

  it('accepts exponent magnitude 100 independently of coefficient and canonical magnitude', () => {
    expect(lexicalDecimal('0e100')).toMatchObject({ value: '0', rounded: false })
    expect(lexicalDecimal('1e-100')).toMatchObject({ value: '0', rounded: true })
    expect(lexicalDecimal(`1${'0'.repeat(100)}e-100`)).toMatchObject({ value: '1', rounded: false })
    expect(() => lexicalDecimal('1e100')).toThrow('DECIMAL_OVERFLOW')
  })

  it.each(['0e101', '0e-101', '1e+101', '1e-101', '0e999999999999999999999999999999999999'])('rejects oversized exponent %s even when zero could short-circuit arithmetic', raw => {
    expect(() => lexicalDecimal(raw)).toThrow('DECIMAL_EXPONENT_LIMIT')
  })

  it.each([
    '', ' ', 'NaN', 'Infinity', '-Infinity', '$1', '1,000', '(1)', '--', 'N/A', 'Incomplete',
    'true', '1_000', '0x10', '1e', '1e+', '1ee2', '1.2.3', '1e1.5', '=1+2', '\u22121', '1\u0000',
  ])('rejects nonnumeric lexical input %j instead of inventing zero or interpreting a formula', raw => {
    expect(() => lexicalDecimal(raw)).toThrow()
  })

  it('rejects runtime numbers whose original source lexemes have already been lost', () => {
    expect(() => lexicalDecimal(9007199254740992 as unknown as string)).toThrow()
    expect(() => lexicalDecimal(null as unknown as string)).toThrow()
  })

  it.each([-1, 1.5, 29, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid scale %s before allocation', scale => {
    expect(() => lexicalDecimal('1', scale as 8)).toThrow('DECIMAL_SCALE')
  })
})
