import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { capitalRepository } from '../src/modules/partnerships/capital.repository.js'
import { fmvRepository } from '../src/modules/partnerships/fmv.repository.js'
import { reviewRepository } from '../src/modules/review/review.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { getAssetClassSummaryViaApi } from './helpers/reportsTestHelpers.js'

describe('Asset Class Summary weighted metrics integration', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    reviewRepository._debugReset()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('returns null weighted metrics when all grouped inputs are undefined', async () => {
    const response = await getAssetClassSummaryViaApi(fixture)
    expect(response.statusCode).toBe(200)

    const body = response.json()
    for (const row of body.rows) {
      expect(row.dpi).toBeNull()
      expect(row.rvpi).toBeNull()
      expect(row.tvpi).toBeNull()
      expect(row.irr).toBeNull()
    }

    expect(body.totals.dpi).toBeNull()
    expect(body.totals.rvpi).toBeNull()
    expect(body.totals.tvpi).toBeNull()
    expect(body.totals.irr).toBeNull()
  })

  it('excludes undefined weighted rows while preserving defined weighted values', async () => {
    const [firstPartnership, secondPartnership] = fixture.partnerships

    await capitalRepository.createCommitment(
      firstPartnership.id,
      firstPartnership.entityId,
      {
        commitmentAmountUsd: 1_000_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )

    await capitalRepository.createCommitment(
      secondPartnership.id,
      secondPartnership.entityId,
      {
        commitmentAmountUsd: 800_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )

    await capitalRepository.createCapitalActivity(
      firstPartnership.id,
      firstPartnership.entityId,
      {
        activityDate: '2024-03-31',
        eventType: 'funded_contribution',
        amountUsd: 500_000,
        sourceType: 'manual',
      },
      fixture.admin.id,
      null,
    )

    await fmvRepository.insertFmvSnapshot(
      firstPartnership.id,
      {
        asOfDate: '2024-12-31',
        amountUsd: 250_000,
        source: 'manual',
      },
      fixture.admin.id,
      null,
    )

    const response = await getAssetClassSummaryViaApi(fixture)
    expect(response.statusCode).toBe(200)

    const body = response.json()

    const groupedRowWithWeightedValue = body.rows.find(
      (row: { rvpi: number | null }) => row.rvpi != null,
    )

    expect(groupedRowWithWeightedValue).toBeTruthy()
    expect(groupedRowWithWeightedValue.rvpi).toBeCloseTo(0.5, 6)
    expect(groupedRowWithWeightedValue.tvpi).toBeCloseTo(0.5, 6)

    expect(body.totals.rvpi).toBeCloseTo(0.5, 6)
    expect(body.totals.tvpi).toBeCloseTo(0.5, 6)
  })
})
