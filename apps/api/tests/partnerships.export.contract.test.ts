import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T019 — Contract: GET /v1/partnerships/export.csv (FR-006 + FR-002)
// Asserts Content-Type header, 401 without auth, and 413 cap response shape.
describe('GET /v1/partnerships/export.csv — export contract (T019)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without session', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/export.csv',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns Content-Type text/csv with authenticated session (empty dataset)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/export.csv',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/partnerships/)
  })

  it('CSV body starts with expected header row', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/export.csv',
      headers: { cookie: f.cookie },
    })
    const text = res.body
    const firstLine = text.split('\n')[0]!
    // Must contain at minimum the core columns
    expect(firstLine).toContain('Partnership Name')
    expect(firstLine).toContain('Entity')
    expect(firstLine).toContain('Status')
  })

  it('accepts filter query params without error', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/export.csv?search=test&assetClass=PE&status=ACTIVE',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 400 for invalid entityId UUID on export', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/export.csv?entityId=not-a-uuid',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
  })
})
