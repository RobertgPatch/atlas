import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { config } from '../src/config.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('TIC Registry contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without a session', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/tic-registry/properties',
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when a non-Admin attempts a mutation', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/tic-registry/properties',
      headers: { cookie: f.userCookie },
      payload: {
        name: 'Registry Test Property',
        propertyType: 'multifamily',
        status: 'held',
      },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ROLE')
  })

  it.runIf(!config.databaseUrl)(
    'returns DATABASE_REQUIRED instead of using in-memory storage when DB is absent',
    async () => {
      const res = await f.app.inject({
        method: 'GET',
        url: '/v1/tic-registry/properties',
        headers: { cookie: f.cookie },
      })

      expect(res.statusCode).toBe(503)
      expect(res.json().error).toBe('DATABASE_REQUIRED')
    },
  )
})
