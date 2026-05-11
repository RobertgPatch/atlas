import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  getConsolidatedHoldingsViaApi,
  seedConsolidatedHoldingsFixture,
} from './helpers/consolidatedHoldingsTestHelpers.js'
import { plaidRepository } from '../src/modules/plaid/plaid.repository.js'

describe('Plaid holdings sync exceptions', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    seedConsolidatedHoldingsFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('reports partial success when one selected account failed', async () => {
    plaidRepository.markAccountStatus(
      '22222222-2222-4222-8222-222222222222',
      'failed',
    )

    const response = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.sync.status).toBe('partial_success')
    expect(body.sync.warnings[0]).toContain('failed to sync')
  })
})
