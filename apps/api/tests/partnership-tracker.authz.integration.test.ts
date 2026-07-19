import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Partnership Tracker authorization boundary', () => {
  let fixture: TestFixture
  beforeEach(async () => { fixture = await createTestFixture() })
  afterEach(async () => { await fixture.app.close() })
  it('allows authenticated reads to reach persistence but rejects non-Admin mutations first', async () => {
    const read = await fixture.app.inject({ method: 'GET', url: '/v1/partnership-tracker/partnerships', headers: { cookie: fixture.userCookie } })
    expect([200, 503]).toContain(read.statusCode)
    const create = await fixture.app.inject({ method: 'POST', url: '/v1/partnership-tracker/partnerships', headers: { cookie: fixture.userCookie }, payload: { entityId: fixture.entityIds[0], name: 'Denied', partnershipType: 'Other' } })
    expect(create.statusCode).toBe(403)
    expect(create.json().error).toBe('FORBIDDEN')
  })
})
