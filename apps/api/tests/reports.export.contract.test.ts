import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { capitalRepository } from '../src/modules/partnerships/capital.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('GET /v1/reports/export contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('returns 401 when session cookie is missing', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/export?reportType=portfolio_summary&format=csv',
    })

    expect(response.statusCode).toBe(401)
  })

  it('exports portfolio summary as CSV', async () => {
    const partnership = fixture.partnerships[0]!

    await capitalRepository.createCommitment(
      partnership.id,
      partnership.entityId,
      {
        commitmentAmountUsd: 1_250_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/export?reportType=portfolio_summary&format=csv',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.headers['content-disposition']).toContain('.csv')
    expect(response.body).toContain('Entity,Entity Type,Partnership Count')
  })

  it('exports activity detail as XLSX', async () => {
    const partnership = fixture.partnerships[0]!

    await capitalRepository.createCommitment(
      partnership.id,
      partnership.entityId,
      {
        commitmentAmountUsd: 750_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )

    await capitalRepository.createCapitalActivity(
      partnership.id,
      partnership.entityId,
      {
        activityDate: '2024-06-30',
        eventType: 'funded_contribution',
        amountUsd: 250_000,
        sourceType: 'manual',
      },
      fixture.admin.id,
      null,
    )

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/export?reportType=activity_detail&format=xlsx',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(response.headers['content-disposition']).toContain('.xlsx')
    expect(response.rawPayload.length).toBeGreaterThan(100)
  })
})
