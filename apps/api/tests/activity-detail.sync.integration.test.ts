import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Activity detail sync integration', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('syncs annual activity detail and capital overview from commitment, activity, and FMV events', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const commitmentRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/commitments`,
      headers: { cookie: f.cookie },
      payload: {
        commitmentAmountUsd: 2_000_000,
        commitmentDate: '2024-01-10',
      },
    })
    expect(commitmentRes.statusCode).toBe(201)

    const capitalCallRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/capital-activity`,
      headers: { cookie: f.cookie },
      payload: {
        activityDate: '2024-03-15',
        eventType: 'capital_call',
        amountUsd: 500_000,
      },
    })
    expect(capitalCallRes.statusCode).toBe(201)

    const fundedContributionRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/capital-activity`,
      headers: { cookie: f.cookie },
      payload: {
        activityDate: '2024-09-30',
        eventType: 'funded_contribution',
        amountUsd: 500_000,
      },
    })
    expect(fundedContributionRes.statusCode).toBe(201)

    const fmvRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/fmv-snapshots`,
      headers: { cookie: f.cookie },
      payload: {
        asOfDate: '2024-12-31',
        amountUsd: 600_000,
        source: 'manual',
      },
    })
    expect(fmvRes.statusCode).toBe(201)

    const detailRes = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}`,
      headers: { cookie: f.cookie },
    })

    expect(detailRes.statusCode).toBe(200)
    const detail = detailRes.json()

    expect(Array.isArray(detail.commitments)).toBe(true)
    expect(detail.commitments.length).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(detail.capitalActivity)).toBe(true)
    expect(detail.capitalActivity.length).toBeGreaterThanOrEqual(2)

    expect(detail.capitalOverview.originalCommitmentUsd).toBe(2_000_000)
    expect(detail.capitalOverview.paidInUsd).toBe(500_000)
    expect(detail.capitalOverview.unfundedUsd).toBe(1_500_000)
    expect(detail.capitalOverview.reportedDistributionsUsd).toBe(0)
    expect(detail.capitalOverview.residualValueUsd).toBe(600_000)
    expect(detail.capitalOverview.tvpi).toBeCloseTo(1.2, 5)

    const year2024 = detail.activityDetail.find((row: { taxYear: number }) => row.taxYear === 2024)
    expect(year2024).toBeTruthy()
    expect(year2024.paidInUsd).toBe(500_000)
    expect(year2024.reportedDistributionUsd).toBe(0)
    expect(year2024.sourceSignals.hasCapitalActivity).toBe(true)
    expect(year2024.sourceSignals.hasFmv).toBe(true)
    expect(year2024.sourceSignals.hasManualInput).toBe(true)
  })
})
