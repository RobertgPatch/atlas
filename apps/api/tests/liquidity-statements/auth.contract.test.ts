import { afterEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'
import { randomUUID } from 'node:crypto'
let fixture: TestFixture
afterEach(async () => { await fixture?.app.close() })
describe('CSV evidence authorization', () => {
  it('denies anonymous and non-admin access to every import mutation and original', async () => {
    fixture = await createTestFixture()
    const id = randomUUID()
    const routes = [['GET', ''], ['GET', `/${id}`], ['POST', '/upload-capability'], ['POST', `/${id}/complete`], ['POST', `/${id}/source-download`], ['GET', `/${id}/content`], ['PATCH', `/${id}/review`], ['POST', `/${id}/application-preview`], ['POST', `/${id}/apply`], ['PUT', `/${id}/mapping`], ['DELETE', `/${id}?expectedVersion=1`]] as const
    for (const [method, path] of routes) {
      const url = `/v1/liquidity-statements${path}`
      expect((await fixture.app.inject({ method, url })).statusCode).toBe(401)
      expect((await fixture.app.inject({ method, url, headers: { cookie: fixture.userCookie } })).statusCode).toBe(403)
    }
  })
})
