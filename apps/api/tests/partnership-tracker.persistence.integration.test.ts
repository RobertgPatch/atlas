import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { runMigrations } from '../src/infra/db/migrate.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('Partnership Tracker persistence compatibility', () => {
  let fixture: PartnershipTrackerFixture
  const scope = { isAdmin: true, entityIds: [] as string[] }
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('is restart-safe and keeps legacy IMPORTED status readable as IN_PROGRESS', async () => {
    await pool!.query(`insert into k1_tracker_years (id, entity_id, partnership_id, tax_year, workflow_status) values (gen_random_uuid(), $1, $2, 2019, 'IMPORTED')`, [fixture.entityId, fixture.partnershipId])
    await runMigrations()
    const first = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)
    const second = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)
    expect(first.years.find((year) => year.taxYear === 2019)?.status).toBe('IN_PROGRESS')
    expect(second.summary.partnership.id).toBe(fixture.partnershipId)
  })

  it('persists and clears inception and management fee configuration', async () => {
    const current = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)
    const updated = await (partnershipTrackerRepository.updatePartnership as any)(fixture.partnershipId, {
      inceptionDate: '2023-08-03',
      managementFeeRate: '0.02000000',
      expectedUpdatedAt: current.summary.partnership.updatedAt,
    }, fixture.adminUserId, scope)
    expect(updated.partnership).toMatchObject({ inceptionDate: '2023-08-03', managementFeeRate: '0.02000000' })

    const cleared = await (partnershipTrackerRepository.updatePartnership as any)(fixture.partnershipId, {
      inceptionDate: null,
      managementFeeRate: null,
      expectedUpdatedAt: updated.partnership.updatedAt,
    }, fixture.adminUserId, scope)
    expect(cleared.partnership).toMatchObject({ inceptionDate: null, managementFeeRate: null })
  })

  it('enforces future-date, exact rate range, and optimistic concurrency boundaries', async () => {
    const current = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)
    await expect(partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      inceptionDate: '2999-01-01',
      expectedUpdatedAt: current.summary.partnership.updatedAt,
    }, fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })

    await expect(pool!.query(
      'update partnerships set management_fee_rate = $2 where id = $1',
      [fixture.partnershipId, '1.00000001'],
    )).rejects.toMatchObject({ code: '23514' })

    const updated = await partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      managementFeeRate: '0.01250000',
      expectedUpdatedAt: current.summary.partnership.updatedAt,
    }, fixture.adminUserId, scope)
    await expect(partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      managementFeeRate: '0.01500000',
      expectedUpdatedAt: current.summary.partnership.updatedAt,
    }, fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'STALE_PARTNERSHIP_REVISION', statusCode: 409 })
    expect(updated.partnership.managementFeeRate).toBe('0.01250000')
  })
})
