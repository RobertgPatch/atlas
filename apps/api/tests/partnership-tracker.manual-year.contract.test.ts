import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { updateManualYearBodySchema } from '../src/modules/partnership-tracker/partnership-tracker.zod.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('manual K-1 route contract', () => {
  let fixture: TestFixture
  const id = '11111111-1111-4111-8111-111111111111'
  beforeEach(async () => { fixture = await createTestFixture() })
  afterEach(async () => { await fixture.app.close() })
  it('accepts arbitrary supported years and rejects malformed revisions before persistence', async () => {
    const unsupported = await fixture.app.inject({ method: 'POST', url: `/v1/partnership-tracker/partnerships/${id}/years`, headers: { cookie: fixture.cookie }, payload: { taxYear: 2200 } })
    expect(unsupported.statusCode).toBe(400)
    const malformed = await fixture.app.inject({ method: 'PATCH', url: `/v1/partnership-tracker/partnerships/${id}/years/2021`, headers: { cookie: fixture.cookie }, payload: { expectedRevision: 0, changes: [] } })
    expect(malformed.statusCode).toBe(400)
  })
  it('rejects new writes to the deprecated Section L contribution key', async () => {
    const response = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/partnership-tracker/partnerships/${id}/years/2021`,
      headers: { cookie: fixture.cookie },
      payload: {
        expectedRevision: 1,
        changes: [{ fieldKey: 'section_l_capital_contributed', amount: '100.00', sourceType: 'MANUAL_ENTRY' }],
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.body).toContain('capital_contributions')
  })
  it('accepts a typed official-form-only revision and rejects invalid field shapes', () => {
    const parsed = updateManualYearBodySchema.parse({
      expectedRevision: 2,
      officialFormData: {
        k1_status_final: true,
        part_ii_j_profit_ending_pct: '12.500000',
        box_4a_guaranteed_payments_services: '250.00',
        box_20_entries: [{ code: 'V', value: 'SEE STMT' }],
      },
    })
    expect(parsed.changes).toEqual([])
    expect(parsed.officialFormData?.box_20_entries).toEqual([{ code: 'V', value: 'SEE STMT' }])

    expect(() => updateManualYearBodySchema.parse({
      expectedRevision: 2,
      officialFormData: { box_4a_guaranteed_payments_services: true },
    })).toThrow(/Expected text/)
    expect(() => updateManualYearBodySchema.parse({
      expectedRevision: 2,
      officialFormData: { box_20_entries: 'SEE STMT' },
    })).toThrow(/Expected coded rows/)
    expect(() => updateManualYearBodySchema.parse({
      expectedRevision: 2,
      officialFormData: { unknown_k1_field: 'value' },
    })).toThrow()
  })
  it('has no import, upload, or source-sync endpoint under the new prefix', async () => {
    for (const suffix of ['imports/preview', 'upload', 'source-sync']) {
      const response = await fixture.app.inject({ method: 'POST', url: `/v1/partnership-tracker/${suffix}`, headers: { cookie: fixture.cookie } })
      expect(response.statusCode).toBe(404)
    }
  })
})
