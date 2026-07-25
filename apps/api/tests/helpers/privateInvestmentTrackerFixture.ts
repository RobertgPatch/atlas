import { randomUUID } from 'node:crypto'
import { pool } from '../../src/infra/db/client.js'
import { createPartnershipTrackerFixture } from './partnershipTrackerFixture.js'

export async function createPrivateInvestmentTrackerFixture() {
  const base = await createPartnershipTrackerFixture()
  if (!pool) throw new Error('ATLAS_TEST_DATABASE_URL is required for durable Private Investment Tracker tests')
  const createActivity = async (
    partnershipId: string,
    kind: 'funded_contribution' | 'distribution' | 'recallable_distribution',
    amount: string,
    activityDate: string,
    entityId = base.entityId,
  ) => {
    const id = randomUUID()
    await pool.query(`insert into capital_activity_events
      (id, entity_id, partnership_id, activity_date, event_type, amount, source_type, notes)
      values ($1,$2,$3,$4,$5,$6,'manual','Private investment tracker fixture')`,
    [id, entityId, partnershipId, activityDate, kind, amount])
    return id
  }
  const createMismatchedK1Year = async (partnershipId: string, taxYear = 2024) => {
    const yearId = randomUUID()
    await pool.query(`insert into k1_tracker_years
      (id, partnership_id, entity_id, tax_year, workflow_status, revision, ending_outside_basis, warning_count, created_at, updated_at)
      values ($1,$2,$3,$4,'IN_PROGRESS',1,'999999.00',0,now(),now())`,
    [yearId, partnershipId, base.entityId, taxYear])
    for (const [fieldKey, amount] of [['capital_contributions', '888888.00'], ['box_19_distributions', '777777.00']] as const) {
      await pool.query(`insert into k1_tracker_value_revisions
        (id, tracker_year_id, field_key, amount, source_type, is_active, created_at)
        values ($1,$2,$3,$4,'MANUAL_ENTRY',true,now())`,
      [randomUUID(), yearId, fieldKey, amount])
    }
    return yearId
  }
  return { ...base, createActivity, createMismatchedK1Year }
}
