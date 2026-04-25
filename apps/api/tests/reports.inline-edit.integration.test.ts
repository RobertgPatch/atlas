import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  createCommitmentViaApi,
  findSinglePartnershipEntity,
  getPortfolioSummaryViaApi,
} from './helpers/reportsTestHelpers.js'

describe('Portfolio Summary inline edit integration', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('rejects invalid monetary values for commitment edits', async () => {
    const { partnershipId } = findSinglePartnershipEntity(fixture)
    const created = await createCommitmentViaApi(fixture, partnershipId, 1_000_000)
    expect(created.statusCode).toBe(201)

    const commitmentId = created.json().id as string

    const negative = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${partnershipId}/commitments/${commitmentId}`,
      headers: { cookie: fixture.cookie },
      payload: { commitmentAmountUsd: -1 },
    })

    const oversized = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${partnershipId}/commitments/${commitmentId}`,
      headers: { cookie: fixture.cookie },
      payload: { commitmentAmountUsd: 1_000_000_000_000 },
    })

    const nonNumeric = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${partnershipId}/commitments/${commitmentId}`,
      headers: { cookie: fixture.cookie },
      payload: { commitmentAmountUsd: 'abc' },
    })

    expect(negative.statusCode).toBe(400)
    expect(oversized.statusCode).toBe(400)
    expect(nonNumeric.statusCode).toBe(400)
  })

  it('rejects stale commitment updates with HTTP 409', async () => {
    const { partnershipId } = findSinglePartnershipEntity(fixture)
    const created = await createCommitmentViaApi(fixture, partnershipId, 1_000_000)
    expect(created.statusCode).toBe(201)

    const commitment = created.json()

    const firstUpdate = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${partnershipId}/commitments/${commitment.id}`,
      headers: { cookie: fixture.cookie },
      payload: {
        commitmentAmountUsd: 1_150_000,
        expectedUpdatedAt: commitment.updatedAt,
      },
    })

    expect(firstUpdate.statusCode).toBe(200)

    const staleUpdate = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${partnershipId}/commitments/${commitment.id}`,
      headers: { cookie: fixture.cookie },
      payload: {
        commitmentAmountUsd: 1_350_000,
        expectedUpdatedAt: commitment.updatedAt,
      },
    })

    expect(staleUpdate.statusCode).toBe(409)
    expect(staleUpdate.json().error).toBe('STALE_COMMITMENT_UPDATE')
  })

  it('recalculates portfolio totals after a successful inline commitment edit', async () => {
    const { entityId, partnershipId } = findSinglePartnershipEntity(fixture)
    const created = await createCommitmentViaApi(fixture, partnershipId, 1_000_000)
    expect(created.statusCode).toBe(201)

    const summaryBefore = await getPortfolioSummaryViaApi(fixture)
    expect(summaryBefore.statusCode).toBe(200)

    const beforeBody = summaryBefore.json()
    const beforeRow = beforeBody.rows.find(
      (row: { entityId: string }) => row.entityId === entityId,
    )

    expect(beforeRow).toBeTruthy()
    expect(beforeRow.editability.originalCommitmentEditable).toBe(true)

    const updatedAmount = 1_750_000
    const update = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${partnershipId}/commitments/${beforeRow.editability.commitmentTarget.commitmentId}`,
      headers: { cookie: fixture.cookie },
      payload: {
        commitmentAmountUsd: updatedAmount,
        expectedUpdatedAt: beforeRow.editability.commitmentTarget.updatedAt,
      },
    })

    expect(update.statusCode).toBe(200)

    const summaryAfter = await getPortfolioSummaryViaApi(fixture)
    expect(summaryAfter.statusCode).toBe(200)

    const afterBody = summaryAfter.json()
    const afterRow = afterBody.rows.find(
      (row: { entityId: string }) => row.entityId === entityId,
    )

    expect(afterRow.originalCommitmentUsd).toBe(updatedAmount)
    expect(afterBody.totals.originalCommitmentUsd).toBeGreaterThan(beforeBody.totals.originalCommitmentUsd)
  })
})
