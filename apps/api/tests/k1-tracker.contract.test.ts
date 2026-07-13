import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { pool } from '../src/infra/db/client.js'

describe('K1 Tracker route contracts without a configured database', () => {
  let fixture: TestFixture
  beforeEach(async () => { fixture = await createTestFixture() })
  afterEach(async () => { await fixture.app.close() })
  it('requires authentication before a tracker list is reached', async () => {
    const response = await fixture.app.inject({ method: 'GET', url: '/v1/k1-tracker/partnerships' })
    expect(response.statusCode).toBe(401)
  })
  const noDatabase = pool ? it.skip : it
  noDatabase('does not fall back to process memory for authenticated tracker reads', async () => {
    const response = await fixture.app.inject({ method: 'GET', url: '/v1/k1-tracker/partnerships', headers: { cookie: fixture.cookie } })
    expect(response.statusCode).toBe(503)
    expect(response.json().error).toBe('DATABASE_REQUIRED')
  })
})
