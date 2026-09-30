import { afterEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'
import { randomUUID } from 'node:crypto'
let fixture: TestFixture
afterEach(async () => { await fixture?.app.close() })
describe('CSV evidence authorization', () => {
  it('denies anonymous and non-admin access to every import mutation and original', async () => {
    const id = randomUUID()
    const routes = [['GET', ''], ['GET', `/${id}`], ['GET', `/${id}/records`], ['POST', '/upload-capability'], ['POST', `/${id}/complete`], ['POST', `/${id}/source-download`], ['GET', `/${id}/content`], ['PUT', `/${id}/content`], ['POST', `/${id}/retry`], ['POST', `/${id}/archive`], ['PATCH', `/${id}/review`], ['POST', `/${id}/application-preview`], ['POST', `/${id}/apply`], ['POST', `/${id}/reprocess`], ['PUT', `/${id}/mapping`], ['DELETE', `/${id}?expectedVersion=1`]] as const
    for (const [index,[method, path]] of routes.entries()) {
      if(index%8===0){await fixture?.app.close();fixture=await createTestFixture()}
      const url = `/v1/liquidity-statements${path}`
      expect((await fixture.app.inject({ method, url })).statusCode).toBe(401)
      expect((await fixture.app.inject({ method, url, headers: { cookie: fixture.userCookie } })).statusCode).toBe(403)
    }
    await fixture.app.close();fixture=await createTestFixture()
    expect((await fixture.app.inject({method:'DELETE',url:'/v1/liquidity-custodians'})).statusCode).toBe(401)
    expect((await fixture.app.inject({method:'DELETE',url:'/v1/liquidity-custodians',headers:{cookie:fixture.userCookie}})).statusCode).toBe(403)
  })
})
