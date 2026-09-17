import { describe, expect, it } from 'vitest'
import { reserveBdaCostCents } from '../../src/modules/abuse-protection/bdaCostReservation.js'

describe('BDA cost reservations', () => {
  it('uses validated PDF pages and includes the entire retry allowance', () => {
    expect(reserveBdaCostCents(2, 100, 3)).toBe(39)
    expect(reserveBdaCostCents(1, 100, 1)).toBe(7)
    expect(reserveBdaCostCents(100, 100, 3)).toBe(1_920)
  })
  it('reserves the maximum document cost when older evidence lacks a page count', () => {
    expect(reserveBdaCostCents(null, 100, 3)).toBe(1_920)
    expect(reserveBdaCostCents(undefined, 100, 3)).toBe(1_920)
  })
  it.each([0, -1, 1.5, 101, NaN, Infinity])('rejects an invalid page count: %s', pages => {
    expect(() => reserveBdaCostCents(pages, 100, 3)).toThrow('INVALID_BDA_COST_RESERVATION')
  })
})
