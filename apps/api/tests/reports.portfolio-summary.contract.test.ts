import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  createCommitmentViaApi,
  findSinglePartnershipEntity,
} from './helpers/reportsTestHelpers.js'

describe('GET /v1/reports/portfolio-summary contract', () => {
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
      url: '/v1/reports/portfolio-summary',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns rows, kpis, totals, and page metadata for authenticated callers', async () => {
    const { partnershipId } = findSinglePartnershipEntity(fixture)

    const createRes = await createCommitmentViaApi(fixture, partnershipId, 2_000_000)
    expect(createRes.statusCode).toBe(201)

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/portfolio-summary?page=1&pageSize=25',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)

    const body = response.json()
    expect(body).toHaveProperty('kpis')
    expect(body).toHaveProperty('rows')
    expect(body).toHaveProperty('totals')
    expect(body).toHaveProperty('page')

    expect(Array.isArray(body.rows)).toBe(true)
    expect(body.page).toMatchObject({
      size: 25,
      offset: 0,
    })

    const editableRow = body.rows.find(
      (row: { editability: { originalCommitmentEditable: boolean } }) =>
        row.editability.originalCommitmentEditable,
    )

    expect(editableRow).toBeTruthy()
    expect(editableRow.editability.commitmentTarget).toHaveProperty('commitmentId')
    expect(editableRow.editability.commitmentTarget).toHaveProperty('partnershipId')
    expect(editableRow.editability.commitmentTarget).toHaveProperty('updatedAt')
  })

  it('returns a scoped response for non-admin users', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/portfolio-summary',
      headers: { cookie: fixture.userCookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toHaveProperty('rows')
  })
})
