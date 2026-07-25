import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { renderPrivateInvestmentPdf, buildPrivateInvestmentPdfReportModel } from '../src/modules/partnership-tracker/private-investment-tracker.pdf.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import type { PrivateInvestmentQuery } from '../src/modules/partnership-tracker/partnership-tracker.contracts.js'
import { createPrivateInvestmentTrackerFixture } from './helpers/privateInvestmentTrackerFixture.js'

const durable = pool ? describe : describe.skip
const query: PrivateInvestmentQuery = {
  assetClasses: [],
  entityIds: [],
  partnershipIds: [],
  dateFrom: null,
  dateTo: null,
  amountMin: null,
  amountMax: null,
  page: 1,
  pageSize: 100,
}

durable('Private Investment Tracker scale', () => {
  let fixture: Awaited<ReturnType<typeof createPrivateInvestmentTrackerFixture>>
  beforeEach(async () => { fixture = await createPrivateInvestmentTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })

  it('reads 500 positions and 10,000 ledger rows set-wise and renders a complete PDF', async () => {
    const partnershipIds = [fixture.partnershipId]
    for (let index = 1; index < 500; index += 1) {
      partnershipIds.push(await fixture.createPartnership({
        entityId: fixture.entityId,
        name: `Scale Fund ${String(index).padStart(3, '0')}`,
      }))
    }
    await pool!.query(
      `insert into capital_activity_events
        (id, entity_id, partnership_id, activity_date, event_type, amount, source_type)
       select gen_random_uuid(), $1, ($2::uuid[])[(value % 500) + 1],
         date '2020-01-01' + (value % 2000), 'funded_contribution', 100.00, 'manual'
       from generate_series(0, 9999) value`,
      [fixture.entityId, partnershipIds],
    )

    const querySpy = vi.spyOn(pool!, 'query')
    const started = performance.now()
    const response = await partnershipTrackerRepository.getPrivateInvestments(
      { isAdmin: false, entityIds: [fixture.entityId] },
      query,
    )
    const elapsed = performance.now() - started
    const queryCalls = querySpy.mock.calls as unknown as Array<[string | { text: string }, unknown[]?]>
    const readSql = queryCalls
      .map(([sql]) => typeof sql === 'string' ? sql : sql.text)
      .filter((sql) => /from partnerships|union all/i.test(sql))
    expect(readSql).toHaveLength(2)
    expect(response.positions).toHaveLength(500)
    expect(response.pageInfo.totalItems).toBe(10_000)
    expect(elapsed).toBeLessThan(2_000)

    const activityQueryCall = queryCalls.find(([sql]) =>
      /union all/i.test(typeof sql === 'string' ? sql : sql.text))
    expect(activityQueryCall).toBeDefined()
    const activitySql = activityQueryCall![0]
    const plan = await pool!.query(
      `explain (analyze, buffers, format json) ${typeof activitySql === 'string' ? activitySql : activitySql.text}`,
      activityQueryCall![1],
    )
    expect(plan.rows[0]?.['QUERY PLAN']).toBeTruthy()
    querySpy.mockRestore()

    const report = await partnershipTrackerRepository.getPrivateInvestmentReport(
      { isAdmin: false, entityIds: [fixture.entityId] },
      query,
    )
    const pdf = await renderPrivateInvestmentPdf(buildPrivateInvestmentPdfReportModel(report, {
      filters: {
        assetClasses: [],
        entityIds: [],
        partnershipIds: [],
        dateFrom: null,
        dateTo: null,
        amountMin: null,
        amountMax: null,
      },
      summaryColumns: ['entity', 'fund', 'totalInvested'],
      detailColumns: ['date', 'fund', 'amount'],
    }))
    expect(report.allMatchingActivities).toHaveLength(10_000)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 60_000)
})
