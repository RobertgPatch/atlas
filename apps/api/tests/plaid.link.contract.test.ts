import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Plaid Link contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('returns 401 when creating a link token without a session', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/plaid/link-token',
      payload: { mode: 'create' },
    })

    expect(response.statusCode).toBe(401)
  })

  it('creates a link token for authenticated users', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/plaid/link-token',
      headers: { cookie: fixture.cookie },
      payload: { mode: 'create' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      linkToken: expect.any(String),
      expiration: expect.any(String),
    })
  })

  it('exchanges a public token and stores investment accounts from metadata', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/plaid/exchange-public-token',
      headers: { cookie: fixture.cookie },
      payload: {
        publicToken: 'public-sandbox-token',
        metadata: {
          institution: {
            institution_id: 'ins_1',
            name: 'Fidelity',
          },
          accounts: [
            {
              id: 'plaid-account-1',
              name: 'Individual Brokerage',
              mask: '4821',
              type: 'investment',
              subtype: 'brokerage',
            },
          ],
        },
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({
      connectionId: expect.any(String),
      institutionName: 'Fidelity',
    })
    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0]).toMatchObject({
      id: 'plaid-account-1',
      custodianName: 'Fidelity',
      selectedForHoldingsReport: true,
      syncStatus: 'never_synced',
    })
  })
})
