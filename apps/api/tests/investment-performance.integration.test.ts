import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository as repository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('Investment Performance persistence', () => {
  it('saves, replaces, and removes the final liquidation event with its partnership date', async () => {
    const id = fixture.partnershipId
    await repository.createCapitalActivity(id, { kind: 'CAPITAL_CALL', activityDate: '2021-01-01', amount: '100.00' }, fixture.adminUserId, scope)
    const [first] = await repository.createCapitalActivities(id, [{ kind: 'DISTRIBUTION', activityDate: '2022-01-01', amount: '220.00', isFinalLiquidation: true }], fixture.adminUserId, scope)
    let detail = await repository.getPartnership(id, scope)
    expect(first?.isFinalLiquidation).toBe(true)
    expect(detail.summary.partnership.finalLiquidationDate).toBe('2022-01-01')
    expect(detail.investmentPerformance.holdingPeriodYears).toBe('1.00000000')

    const [replacement] = await repository.createCapitalActivities(id, [{ kind: 'DISTRIBUTION', activityDate: '2022-06-01', amount: '10.00', isFinalLiquidation: true }], fixture.adminUserId, scope)
    detail = await repository.getPartnership(id, scope)
    expect(detail.cashFlowEvents.find((flow) => flow.id === first?.id)?.isFinalLiquidation).toBe(false)
    expect(replacement?.isFinalLiquidation).toBe(true)
    expect(detail.summary.partnership.finalLiquidationDate).toBe('2022-06-01')
    await repository.deleteCapitalActivity(id, replacement!.id, replacement!.updatedAt, fixture.adminUserId, scope)
    detail = await repository.getPartnership(id, scope)
    expect(detail.summary.partnership.finalLiquidationDate).toBeNull()
    expect(detail.investmentPerformance.holdingPeriodYears).toBeNull()
    expect(detail.cashFlowEvents.find((flow) => flow.id === first?.id)?.isFinalLiquidation).toBe(false)
  })

  let fixture: PartnershipTrackerFixture
  const scope = { isAdmin: true, entityIds: [] as string[] }
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture?.cleanup() })

  it('round-trips fees, net cash, and the liquidation date into the detail calculation', async () => {
    const id = fixture.partnershipId
    await repository.createCommitment(id, { amount: '100.00', effectiveDate: '2021-01-01' }, fixture.adminUserId, scope)
    await repository.createCapitalActivities(id, [
      { kind: 'CAPITAL_CALL', amount: '100.00', activityDate: '2021-01-01' },
      { kind: 'DISTRIBUTION', amount: '220.00', feesAndCarry: '29.9995', activityDate: '2022-01-01' },
      { kind: 'CAPITAL_CALL', amount: '500.00', activityDate: '2022-06-01', settlementStatus: 'ANNOUNCED' },
    ], fixture.adminUserId, scope)
    let detail = await repository.getPartnership(id, scope)
    await repository.updatePartnership(id, { finalLiquidationDate: '2022-01-01', expectedUpdatedAt: detail.summary.partnership.updatedAt }, fixture.adminUserId, scope)
    detail = await repository.getPartnership(id, scope)
    expect(detail.summary.partnership.finalLiquidationDate).toBe('2022-01-01')
    expect(detail.cashFlowEvents.find((flow) => flow.kind === 'DISTRIBUTION')).toMatchObject({ amount: '220.00', feesAndCarry: '29.9995' })
    expect(detail.investmentPerformance).toMatchObject({ paidInCapital: '100.0000', grossDistributions: '220.0000',
      feesAndCarry: '-29.9995', netDistributions: '190.0005', netMoicDpi: '1.90000500', residualValue: '0.0000',
      holdingPeriodYears: '1.00000000', grossXirr: '1.20000000', netXirr: '0.90000500', finalLiquidationDate: '2022-01-01' })
    await repository.updatePartnership(id, { finalLiquidationDate: null, expectedUpdatedAt: detail.summary.partnership.updatedAt }, fixture.adminUserId, scope)
    expect((await repository.getPartnership(id, scope)).investmentPerformance.holdingPeriodYears).toBeNull()
  })

  it('persists a final liquidation date on creation and defaults existing fee-free activity to zero', async () => {
    const created = await repository.createPartnership({ entityId: fixture.entityId, name: 'Liquidated investment', partnershipType: 'Private Equity', finalLiquidationDate: '2022-01-01' }, fixture.adminUserId, scope)
    expect(created.partnership.partnership.finalLiquidationDate).toBe('2022-01-01')
    await repository.createCapitalActivity(fixture.partnershipId, { kind: 'CAPITAL_CALL', amount: '100.00', activityDate: '2021-01-01' }, fixture.adminUserId, scope)
    const detail = await repository.getPartnership(fixture.partnershipId, scope)
    expect(detail.cashFlowEvents[0]?.feesAndCarry).toBe('0.0000')
    expect(detail.investmentPerformance.feesAndCarry).toBe('0.0000')
  })
})
