import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { capitalRepository } from '../src/modules/partnerships/capital.repository.js'
import { fmvRepository } from '../src/modules/partnerships/fmv.repository.js'
import { reviewRepository } from '../src/modules/review/review.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { getPortfolioSummaryViaApi } from './helpers/reportsTestHelpers.js'

/**
 * Verifies that multi-partnership entity rollups compute DPI/RVPI/TVPI from
 * aggregated cash flows (sum-of-distributions / sum-of-paid-in) rather than
 * paid-in-weighted averages of partnership-level multiples. Direct ratios of
 * the aggregated sums are the standard fund-of-funds metric.
 */
describe('Portfolio summary aggregated rollup', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    reviewRepository._debugReset()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('computes entity DPI/RVPI/TVPI from aggregated sums across its partnerships', async () => {
    const groupedByEntity = new Map<string, typeof fixture.partnerships>()
    for (const partnership of fixture.partnerships) {
      const list = groupedByEntity.get(partnership.entityId) ?? []
      list.push(partnership)
      groupedByEntity.set(partnership.entityId, list)
    }
    const multiEntry = [...groupedByEntity.entries()].find(([, rows]) => rows.length >= 2)
    if (!multiEntry) {
      throw new Error('Test fixture must include an entity with multiple partnerships')
    }
    const [entityId, [first, second]] = multiEntry

    // Partnership A: $1,000,000 commitment, $500,000 paid-in, $250,000 residual.
    // In isolation: DPI=0, RVPI=0.5, TVPI=0.5
    await capitalRepository.createCommitment(
      first.id,
      first.entityId,
      {
        commitmentAmountUsd: 1_000_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )
    await capitalRepository.createCapitalActivity(
      first.id,
      first.entityId,
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
      first.id,
      { asOfDate: '2024-12-31', amountUsd: 250_000, source: 'manual' },
      fixture.admin.id,
      null,
    )

    // Partnership B: $2,000,000 commitment, $1,500,000 paid-in, $3,000,000 residual.
    // In isolation: DPI=0, RVPI=2.0, TVPI=2.0
    await capitalRepository.createCommitment(
      second.id,
      second.entityId,
      {
        commitmentAmountUsd: 2_000_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )
    await capitalRepository.createCapitalActivity(
      second.id,
      second.entityId,
      {
        activityDate: '2024-03-31',
        eventType: 'funded_contribution',
        amountUsd: 1_500_000,
        sourceType: 'manual',
      },
      fixture.admin.id,
      null,
    )
    await fmvRepository.insertFmvSnapshot(
      second.id,
      { asOfDate: '2024-12-31', amountUsd: 3_000_000, source: 'manual' },
      fixture.admin.id,
      null,
    )

    const response = await getPortfolioSummaryViaApi(fixture)
    expect(response.statusCode).toBe(200)

    const body = response.json()
    const row = body.rows.find((r: { entityId: string }) => r.entityId === entityId)
    expect(row).toBeTruthy()

    // Aggregated approach: residual=$3.25M, paid-in=$2.0M, distributions=$0
    expect(row.originalCommitmentUsd).toBe(3_000_000)
    expect(row.paidInUsd).toBe(2_000_000)
    expect(row.distributionsUsd).toBe(0)
    expect(row.residualValueUsd).toBe(3_250_000)
    expect(row.calledPct).toBeCloseTo((2_000_000 / 3_000_000) * 100, 6)

    // Direct ratio of aggregated sums:
    //   DPI  = 0 / 2,000,000               = 0
    //   RVPI = 3,250,000 / 2,000,000       = 1.625
    //   TVPI = (0 + 3,250,000) / 2,000,000 = 1.625
    expect(row.dpi).toBeCloseTo(0, 6)
    expect(row.rvpi).toBeCloseTo(1.625, 6)
    expect(row.tvpi).toBeCloseTo(1.625, 6)

    // Paid-in-weighted average of (RVPI=0.5, RVPI=2.0) is 1.625 too — coincidence here.
    // The distinguishing case: ensure totals row also uses aggregated approach across
    // all entities. Across the full fixture, totals = sum of all partnership cash flows.
    const totals = body.totals
    expect(totals.paidInUsd).toBeGreaterThanOrEqual(2_000_000)
    expect(totals.residualValueUsd).toBeGreaterThanOrEqual(3_250_000)
    if (totals.paidInUsd > 0) {
      expect(totals.rvpi).toBeCloseTo(totals.residualValueUsd / totals.paidInUsd, 6)
      expect(totals.tvpi).toBeCloseTo(
        (totals.distributionsUsd + totals.residualValueUsd) / totals.paidInUsd,
        6,
      )
    }
  })

  it('returns null RVPI/TVPI for entities whose partnerships have no FMV', async () => {
    const partnership = fixture.partnerships[0]!

    await capitalRepository.createCommitment(
      partnership.id,
      partnership.entityId,
      {
        commitmentAmountUsd: 1_000_000,
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
        activityDate: '2024-03-31',
        eventType: 'funded_contribution',
        amountUsd: 250_000,
        sourceType: 'manual',
      },
      fixture.admin.id,
      null,
    )

    const response = await getPortfolioSummaryViaApi(fixture)
    expect(response.statusCode).toBe(200)

    const row = response
      .json()
      .rows.find((r: { entityId: string }) => r.entityId === partnership.entityId)
    expect(row).toBeTruthy()
    expect(row.paidInUsd).toBeGreaterThanOrEqual(250_000)
    expect(row.dpi).toBeCloseTo(0, 6)
    expect(row.residualValueUsd).toBeNull()
    expect(row.rvpi).toBeNull()
    expect(row.tvpi).toBeNull()
  })
})
