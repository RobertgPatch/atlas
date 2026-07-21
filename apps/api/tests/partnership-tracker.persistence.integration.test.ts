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

  it('persists the shared partnership profile and initial valuation at creation', async () => {
    const created = await partnershipTrackerRepository.createPartnership({
      entityId: fixture.entityId,
      name: `Profile Fund ${Date.now()}`,
      partnershipType: 'Real Estate',
      inceptionDate: '2024-01-15',
      ein: '123456789',
      fundManager: 'Jackson Fund Management',
      addressLine1: '100 Market Street',
      addressCity: 'San Francisco',
      addressRegion: 'CA',
      addressPostalCode: '94105',
      addressCountry: 'United States',
      initialValuationAmount: '850000.00',
      initialValuationDate: '2024-01-15',
    }, fixture.adminUserId, scope)
    const id = created.partnership.partnership.id
    try {
      const detail = await partnershipTrackerRepository.getPartnership(id, scope)
      expect(detail.summary.partnership).toMatchObject({ ein: '123456789', fundManager: 'Jackson Fund Management', addressCity: 'San Francisco', addressRegion: 'CA' })
      expect(detail.summary.latestNav).toEqual({ amount: '850000.00', date: '2024-01-15' })
    } finally {
      await pool!.query('delete from audit_events where object_id = $1', [id])
      await pool!.query('delete from partnership_fmv_snapshots where partnership_id = $1', [id])
      await pool!.query('delete from partnerships where id = $1', [id])
    }
  })

  it('rolls exact-dated cash activity into the K-1 year and XIRR inputs', async () => {
    const createdYear = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2024, fixture.adminUserId, scope)
    expect(createdYear.officialFormData).toMatchObject({
      tax_period_beginning: '2024-01-01',
      tax_period_ending: '2024-12-31',
    })
    await fixture.createCommitment(fixture.partnershipId, { amount: '250000.00', effectiveDate: '2024-01-01' })
    await fixture.createNav(fixture.partnershipId, { amount: '110000.00', valuationDate: '2024-12-31' })
    const created = await partnershipTrackerRepository.createCashFlows(fixture.partnershipId, 2024, [
      { kind: 'CAPITAL_CALL', activityDate: '2024-01-15', amount: '100000.00', note: 'Initial call' },
      { kind: 'DISTRIBUTION', activityDate: '2024-07-15', amount: '10000.00' },
      { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2024-10-15', amount: '5000.00' },
      { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2024-11-15', amount: '2500.00' },
    ], fixture.adminUserId, scope)
    const call = created[0]!
    const recallable = created[2]!
    const secondRecallable = created[3]!
    const year = await partnershipTrackerRepository.getYear(fixture.partnershipId, 2024, scope)
    expect(year.cashFlowEvents).toHaveLength(4)
    expect(year.values.find((value) => value.fieldKey === 'capital_contributions')).toMatchObject({ amount: '100000.00', originalSourceText: 'Dated cash activity rollup' })
    expect(year.values.find((value) => value.fieldKey === 'box_19_distributions')).toMatchObject({ amount: '17500.00', originalSourceText: 'Dated cash activity rollup' })
    const summary = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)
    expect(summary.summary).toMatchObject({ totalCapitalContributions: '100000.00', totalDistributions: '17500.00', currentCommittedCapital: { amount: '257500.00', date: '2024-11-15' } })
    expect(summary.commitments.at(-1)).toMatchObject({ amount: '257500.00', sourceCashFlowEventId: secondRecallable.id, isCurrent: true })
    expect(summary.summary.performanceStatus.irr).toBe('AVAILABLE')
    await partnershipTrackerRepository.deleteCashFlow(fixture.partnershipId, 2024, recallable.id, recallable.updatedAt, fixture.adminUserId, scope)
    expect((await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)).summary.currentCommittedCapital?.amount).toBe('252500.00')
    await partnershipTrackerRepository.deleteCashFlow(fixture.partnershipId, 2024, secondRecallable.id, secondRecallable.updatedAt, fixture.adminUserId, scope)
    expect((await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)).summary.currentCommittedCapital?.amount).toBe('250000.00')
    await partnershipTrackerRepository.deleteCashFlow(fixture.partnershipId, 2024, call.id, call.updatedAt, fixture.adminUserId, scope)
    expect((await partnershipTrackerRepository.getYear(fixture.partnershipId, 2024, scope)).cashFlowEvents).toHaveLength(1)
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
