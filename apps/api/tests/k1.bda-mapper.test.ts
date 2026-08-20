import { describe, expect, it } from 'vitest'

import {
  K1_TRACKER_DEPRECATED_WRITE_FIELD_KEYS,
  K1_TRACKER_FIELD_KEYS,
  K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS,
} from '../src/modules/k1-tracker/k1-tracker.contracts.js'
import {
  classifyK1CanonicalPath,
  K1_CALCULATION_DESTINATIONS,
  K1_OFFICIAL_DESTINATIONS,
  K1_WORKPAPER_EXCLUDED_KEYS,
} from '../src/modules/k1/extraction/k1DestinationInventory.js'

describe('K-1 destination inventory', () => {
  it('accounts for every official field exactly once', () => {
    expect(K1_OFFICIAL_DESTINATIONS).toHaveLength(48)
    expect(new Set(K1_OFFICIAL_DESTINATIONS.map((entry) => entry.key)).size).toBe(48)
    expect(K1_OFFICIAL_DESTINATIONS.map((entry) => entry.key).sort()).toEqual(
      [...K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS].sort(),
    )
  })

  it('classifies every writable calculation key once and excludes only workpaper fields', () => {
    const writable = K1_TRACKER_FIELD_KEYS.filter(
      (key) => !(K1_TRACKER_DEPRECATED_WRITE_FIELD_KEYS as readonly string[]).includes(key),
    )
    expect(K1_CALCULATION_DESTINATIONS).toHaveLength(42)
    expect(new Set(K1_CALCULATION_DESTINATIONS.map((entry) => entry.key)).size).toBe(42)
    expect(K1_CALCULATION_DESTINATIONS.map((entry) => entry.key).sort()).toEqual([...writable].sort())
    expect(K1_CALCULATION_DESTINATIONS.filter((entry) => entry.policy === 'WORKPAPER_EXCLUDED').map((entry) => entry.key).sort())
      .toEqual([...K1_WORKPAPER_EXCLUDED_KEYS].sort())
    expect(K1_CALCULATION_DESTINATIONS.filter((entry) => entry.canonicalPath !== null)).toHaveLength(31)
  })

  it('never emits deprecated combined destinations and makes Line 13/18 review policies explicit', () => {
    const destinationKeys = K1_CALCULATION_DESTINATIONS.map((entry) => entry.key)
    expect(destinationKeys).not.toContain('section_l_capital_contributed')
    expect(destinationKeys).not.toContain('box_13_other_deductions')
    expect(K1_CALCULATION_DESTINATIONS.filter((entry) => entry.key.startsWith('box_13_')))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'box_13_other_portfolio_deductions', policy: 'REVIEWED_DERIVATION' }),
        expect.objectContaining({ key: 'box_13_management_fees', policy: 'REVIEWED_DERIVATION' }),
      ]))
    expect(K1_CALCULATION_DESTINATIONS.filter((entry) => entry.key.startsWith('box_18')))
      .toHaveLength(3)
    expect(K1_CALCULATION_DESTINATIONS.filter((entry) => entry.key.startsWith('box_18'))
      .every((entry) => entry.policy === 'REVIEWED_DERIVATION')).toBe(true)
  })

  it('routes match signals and unknown fields without silently writing them', () => {
    expect(classifyK1CanonicalPath('match.partner_tin')).toEqual({ kind: 'MATCH_SIGNAL', key: 'partner_tin' })
    expect(classifyK1CanonicalPath('provider.future_field')).toEqual({ kind: 'EVIDENCE_ONLY', key: null })
  })
})
