import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('Partnership Tracker bounded list performance', () => {
  let fixture: PartnershipTrackerFixture
  beforeEach(async () => { fixture = await createPartnershipTrackerFixture() })
  afterEach(async () => { await fixture.cleanup() })
  it('loads a 100-partnership page with set-based summaries in under two seconds', async () => {
    for (let index = 0; index < 99; index += 1) await fixture.createPartnership({ name: `Performance ${String(index).padStart(3, '0')}` })
    const started = performance.now()
    const result = await partnershipTrackerRepository.listPartnerships({ isAdmin: true, entityIds: [] }, { limit: 100 })
    expect(result.items).toHaveLength(100)
    expect(performance.now() - started).toBeLessThan(2000)
  })
  it('loads 50 years, 50 commitments, and 200 NAV points as bounded detail reads', async () => {
    await pool!.query(`insert into k1_tracker_years (id, entity_id, partnership_id, tax_year, workflow_status)
      select gen_random_uuid(), $1, $2, 1950 + value, 'NOT_STARTED' from generate_series(0, 49) value`, [fixture.entityId, fixture.partnershipId])
    await pool!.query(`insert into partnership_commitments (id, entity_id, partnership_id, commitment_amount, commitment_date, status, source_type)
      select gen_random_uuid(), $1, $2, 1000000 + value * 1000, current_date - value, 'INACTIVE', 'manual' from generate_series(0, 49) value`, [fixture.entityId, fixture.partnershipId])
    await pool!.query(`insert into partnership_fmv_snapshots (id, partnership_id, valuation_date, fmv_amount, source_type)
      select gen_random_uuid(), $1, date '2020-01-01' + value, 800000 + value * 1000, 'manager_statement' from generate_series(0, 199) value`, [fixture.partnershipId])
    const started = performance.now()
    const detail = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, { isAdmin: true, entityIds: [] })
    expect(detail.years).toHaveLength(50)
    expect(detail.commitments).toHaveLength(50)
    expect(detail.navEntries).toHaveLength(200)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
