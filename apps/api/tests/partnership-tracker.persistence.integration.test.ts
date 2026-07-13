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
})
