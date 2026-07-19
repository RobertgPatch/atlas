import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('effective-dated committed-capital history', () => {
  let fixture: PartnershipTrackerFixture
  const scope = { isAdmin: true, entityIds: [] as string[] }
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('preserves backdated and later totals and resolves deterministic as-of values', async () => {
    const latest = await partnershipTrackerRepository.createCommitment(fixture.partnershipId, { amount: '1500000.00', effectiveDate: '2025-01-01' }, fixture.adminUserId, scope)
    const earliest = await partnershipTrackerRepository.createCommitment(fixture.partnershipId, { amount: '1000000.00', effectiveDate: '2023-01-01' }, fixture.adminUserId, scope)
    await partnershipTrackerRepository.createCommitment(fixture.partnershipId, { amount: '1250000.00', effectiveDate: '2024-01-01' }, fixture.adminUserId, scope)
    const asOf = await partnershipTrackerRepository.listCommitments(fixture.partnershipId, scope, '2024-06-30')
    expect(asOf.items.map((item) => item.amount)).toEqual(['1000000.00', '1250000.00', '1500000.00'])
    expect(asOf.effectiveEntry?.amount).toBe('1250000.00')
    await partnershipTrackerRepository.deleteCommitment(fixture.partnershipId, earliest.id, earliest.updatedAt, fixture.adminUserId, scope)
    expect((await partnershipTrackerRepository.listCommitments(fixture.partnershipId, scope)).items.some((item) => item.id === latest.id)).toBe(true)
  })
  it('rejects stale corrections', async () => {
    const entry = await partnershipTrackerRepository.createCommitment(fixture.partnershipId, { amount: '100.00', effectiveDate: '2024-01-01' }, fixture.adminUserId, scope)
    await expect(partnershipTrackerRepository.updateCommitment(fixture.partnershipId, entry.id, { amount: '110.00', expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }, fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'STALE_COMMITMENT_REVISION' })
  })
})
