import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  it('has no import, upload, or source-sync endpoint under the new prefix', async () => {
    for (const suffix of ['imports/preview', 'upload', 'source-sync']) {
      const response = await fixture.app.inject({ method: 'POST', url: `/v1/partnership-tracker/${suffix}`, headers: { cookie: fixture.cookie } })
      expect(response.statusCode).toBe(404)
    }
  })
})
