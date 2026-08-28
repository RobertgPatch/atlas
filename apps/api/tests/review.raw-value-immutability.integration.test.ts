import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'
import { reviewRepository } from '../src/modules/review/review.repository.js'
import { pool } from '../src/infra/db/client.js'
import { createDurableK1ReviewFixture, type DurableK1ReviewFixture } from './helpers/durableK1ReviewFixture.js'
import { config } from '../src/config.js'

// T018a — raw_value / original_value must NEVER be touched by any correction.
// Fuzz ≥200 random corrections across the NEEDS_REVIEW fixture and confirm the
// byte-for-byte immutability invariant holds (SC-003).
describe('Review corrections — raw_value immutability fuzz (SC-003)', () => {
  let f: ReviewFixture
  const originalLocalRate = { ...config.abuseProtection.localRates.authenticatedReadUser }
  const originalExactRates = {
    businessWriteUser: { ...config.abuseProtection.exactRates.businessWriteUser },
    businessWriteSessionRequests: config.abuseProtection.exactRates.businessWriteSessionRequests,
    businessWriteTenantRequests: config.abuseProtection.exactRates.businessWriteTenantRequests,
    businessWriteGlobalRequests: config.abuseProtection.exactRates.businessWriteGlobalRequests,
  }

  beforeEach(async () => {
    Object.assign(config.abuseProtection.localRates.authenticatedReadUser, { requests: 250 })
    Object.assign(config.abuseProtection.exactRates.businessWriteUser, { requests: 250 })
    Object.assign(config.abuseProtection.exactRates, {
      businessWriteSessionRequests: 250,
      businessWriteTenantRequests: 250,
      businessWriteGlobalRequests: 250,
    })
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
    Object.assign(config.abuseProtection.localRates.authenticatedReadUser, originalLocalRate)
    Object.assign(config.abuseProtection.exactRates.businessWriteUser, originalExactRates.businessWriteUser)
    Object.assign(config.abuseProtection.exactRates, {
      businessWriteSessionRequests: originalExactRates.businessWriteSessionRequests,
      businessWriteTenantRequests: originalExactRates.businessWriteTenantRequests,
      businessWriteGlobalRequests: originalExactRates.businessWriteGlobalRequests,
    })
  })

  it('200 random corrections never mutate raw_value or original_value', async () => {
    const editableFieldNames = [
      'partnership_name',
      'partnership_ein',
      'partner_name',
      'box_1_ordinary_income',
      'box_19a_distribution',
    ] as const

    // Capture the pre-state for every field.
    const pre = new Map<string, { raw: string | null; original: string | null }>()
    for (const name of editableFieldNames) {
      const fv = f.fieldByName(f.k1NeedsReview, name)!
      pre.set(fv.id, { raw: fv.rawValue, original: fv.originalValue })
    }

    // Value generators keyed by field: numeric currency for boxes, free string for names/EINs.
    const nextValue = (name: string, i: number): string => {
      if (name.startsWith('box_')) return (1000 + i).toFixed(2)
      if (name === 'partnership_ein') return `00-00000${(i % 10)}`
      return `Fuzz ${name} ${i}`
    }

    for (let i = 0; i < 200; i++) {
      const name = editableFieldNames[i % editableFieldNames.length]!
      const fv = f.fieldByName(f.k1NeedsReview, name)!
      const currentK = (await import('../src/modules/k1/k1.repository.js')).k1Repository.getK1Document(
        f.k1NeedsReview,
      )!
      const value = i % 17 === 0 ? null : nextValue(name, i) // revert-to-null cycles
      const res = await f.app.inject({
        method: 'PUT',
        url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
        headers: { cookie: f.cookie, 'if-match': String(currentK.version) },
        payload: { corrections: [{ fieldId: fv.id, value }] },
      })
      expect(res.statusCode).toBe(200)
    }

    // Post-state: every raw_value + original_value is byte-for-byte equal.
    for (const [fieldId, snap] of pre.entries()) {
      const after = reviewRepository
        .listFieldValuesForK1(f.k1NeedsReview)
        .find((fv) => fv.id === fieldId)!
      expect(after.rawValue).toBe(snap.raw)
      expect(after.originalValue).toBe(snap.original)
    }
  })
})

const durable = pool ? describe : describe.skip

durable('Feature 022 provider evidence immutability', () => {
  let f: DurableK1ReviewFixture
  beforeEach(async () => { f = await createDurableK1ReviewFixture() })
  afterEach(async () => { await f.cleanup() })

  it('keeps provider JSON immutable while appending reviewer corrections', async () => {
    const before = await pool!.query<{ raw_value_json: unknown; normalized_value_json: unknown }>(
      'select raw_value_json, normalized_value_json from k1_field_values where id = $1', [f.moneyFieldId],
    )
    const response = await f.app.inject({
      method: 'PUT', url: `/v1/k1-documents/${f.k1DocumentId}/corrections`,
      headers: { cookie: f.cookie, 'if-match': '3' },
      payload: { corrections: [{ fieldValueId: f.moneyFieldId, value: 9191.25 }] },
    })
    expect(response.statusCode).toBe(200)
    const after = await pool!.query<{ raw_value_json: unknown; normalized_value_json: unknown; reviewer_corrected_value_json: unknown }>(
      'select raw_value_json, normalized_value_json, reviewer_corrected_value_json from k1_field_values where id = $1', [f.moneyFieldId],
    )
    expect(after.rows[0].raw_value_json).toEqual(before.rows[0].raw_value_json)
    expect(after.rows[0].normalized_value_json).toEqual(before.rows[0].normalized_value_json)
    expect(after.rows[0].reviewer_corrected_value_json).toBe(9191.25)
    await expect(pool!.query(`update k1_field_values set raw_value_json = '0'::jsonb where id = $1`, [f.moneyFieldId]))
      .rejects.toMatchObject({ code: '23514' })
  })
})
