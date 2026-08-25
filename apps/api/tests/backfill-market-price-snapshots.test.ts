import { describe, expect, it } from 'vitest'
import {
  completedWeekdaysInRange,
  parseBackfillRange,
} from '../src/scripts/backfill-market-price-snapshots.js'

describe('market-price snapshot backfill range', () => {
  it('defaults to the previous Monday through today', () => {
    const now = new Date('2026-08-25T21:30:00.000Z')

    expect(parseBackfillRange([], now)).toEqual({
      from: '2026-08-17',
      to: '2026-08-25',
    })
    expect(
      completedWeekdaysInRange(parseBackfillRange([], now), now),
    ).toEqual({
      dates: [
        '2026-08-17',
        '2026-08-18',
        '2026-08-19',
        '2026-08-20',
        '2026-08-21',
        '2026-08-24',
        '2026-08-25',
      ],
      deferredToday: false,
    })
  })

  it('accepts explicit dates and skips weekends', () => {
    const now = new Date('2026-08-25T21:30:00.000Z')
    const range = parseBackfillRange(
      ['--from=2026-08-20', '--to', '2026-08-24'],
      now,
    )

    expect(completedWeekdaysInRange(range, now).dates).toEqual([
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
    ])
  })

  it('defers today until the official close has settled', () => {
    const beforeClose = new Date('2026-08-25T19:00:00.000Z')
    const range = parseBackfillRange([], beforeClose)

    expect(completedWeekdaysInRange(range, beforeClose)).toEqual({
      dates: [
        '2026-08-17',
        '2026-08-18',
        '2026-08-19',
        '2026-08-20',
        '2026-08-21',
        '2026-08-24',
      ],
      deferredToday: true,
    })
  })

  it('rejects invalid, reversed, and future ranges', () => {
    const now = new Date('2026-08-25T21:30:00.000Z')

    expect(() => parseBackfillRange(['--from=2026-02-30'], now)).toThrow(
      /valid date/i,
    )
    expect(() =>
      parseBackfillRange(['--from=2026-08-25', '--to=2026-08-24'], now),
    ).toThrow(/on or before/i)
    expect(() => parseBackfillRange(['--to=2026-08-26'], now)).toThrow(
      /future/i,
    )
  })
})
