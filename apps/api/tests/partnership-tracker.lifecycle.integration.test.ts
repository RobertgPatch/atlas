import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { PartnershipTrackerError } from '../src/modules/partnership-tracker/partnership-tracker.types.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('Partnership creation lifecycle', () => {
  let fixture: PartnershipTrackerFixture
  const scope = { isAdmin: true, entityIds: [] as string[] }
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('creates an Active typed partnership without an implicit year and rejects normalized duplicates', async () => {
    const created = await partnershipTrackerRepository.createPartnership({ entityId: fixture.entityId, name: '  Redwood Fund  ', partnershipType: 'Real Estate' }, fixture.adminUserId, scope)
    expect(created.nextAction).toBe('ADD_K1_YEAR')
    expect(created.partnership.partnership.status).toBe('ACTIVE')
    expect(created.partnership.earliestK1Year).toBeNull()
    await expect(partnershipTrackerRepository.createPartnership({ entityId: fixture.entityId, name: 'redwood fund', partnershipType: 'Real Estate' }, fixture.adminUserId, scope)).rejects.toMatchObject<Partial<PartnershipTrackerError>>({ code: 'DUPLICATE_PARTNERSHIP_NAME', statusCode: 409 })
  })
  it('updates allowed identity fields with optimistic concurrency', async () => {
    const before = (await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)).summary
    const updated = await partnershipTrackerRepository.updatePartnership(fixture.partnershipId, { name: 'Updated Fund', partnershipType: 'Credit', status: 'PENDING', notes: 'Awaiting close', expectedUpdatedAt: before.partnership.updatedAt }, fixture.adminUserId, scope)
    expect(updated.partnership).toMatchObject({ name: 'Updated Fund', partnershipType: 'Credit', status: 'PENDING', notes: 'Awaiting close' })
    await expect(partnershipTrackerRepository.updatePartnership(fixture.partnershipId, { name: 'Stale update', expectedUpdatedAt: before.partnership.updatedAt }, fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'STALE_PARTNERSHIP_REVISION' })
  })
})
