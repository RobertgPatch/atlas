import { pool } from '../../src/infra/db/client.js'
import { config } from '../../src/config.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'
import { partnershipTrackerRepository } from '../../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './partnershipTrackerFixture.js'

const adminScope = { isAdmin: true, entityIds: [] as string[] }

export interface PartnershipAggregationFixture {
  base: PartnershipTrackerFixture
  partnershipIds: {
    alpha: string
    beacon: string
    cedar: string
    delta: string
    external: string
  }
  ownerIds: { alder: string; beacon: string; outside: string }
  adminCookie: string
  userCookie: string | null
  createBulkPartnerships: (count: number) => Promise<string[]>
  cleanup: () => Promise<void>
}

async function seedYear(
  partnershipId: string,
  taxYear: number,
  contributions: string,
  distributions: string,
  actorUserId: string,
  warningCount = 0,
) {
  const year = await partnershipTrackerRepository.createYear(partnershipId, taxYear, actorUserId, adminScope)
  await partnershipTrackerRepository.updateYear(partnershipId, taxYear, year.revision, [
    { fieldKey: 'capital_contributions', amount: contributions, sourceType: 'MANUAL_ENTRY' },
    { fieldKey: 'box_19_distributions', amount: distributions, sourceType: 'MANUAL_ENTRY' },
  ], actorUserId, adminScope)
  if (warningCount > 0) {
    await pool!.query('update k1_tracker_years set warning_count = $2 where partnership_id = $1 and tax_year = $3', [partnershipId, warningCount, taxYear])
  }
}

export async function createPartnershipAggregationFixture(): Promise<PartnershipAggregationFixture> {
  if (!pool) throw new Error('ATLAS_TEST_DATABASE_URL is required for partnership aggregation integration tests')
  const base = await createPartnershipTrackerFixture()
  const alder = base.entityId
  const beaconOwner = base.targetEntityId
  const outside = await base.createOwner('Outside Owner')

  await pool.query(`update entities set name = case id when $1 then 'Alder Family' when $2 then 'Beacon Holdings' else name end where id = any($3::uuid[])`, [alder, beaconOwner, [alder, beaconOwner]])
  await pool.query(`update partnerships set name = 'Alpha Growth I', asset_class = 'Private Equity', inception_date = '2021-01-01' where id = $1`, [base.partnershipId])
  const alpha = base.partnershipId
  const beacon = await base.createPartnership({ entityId: beaconOwner, name: 'Beacon Credit', assetClass: 'Credit', inceptionDate: '2022-01-01' })
  const cedar = await base.createPartnership({ entityId: alder, name: 'Cedar Legacy', assetClass: 'Real Estate' })
  const delta = await base.createPartnership({ entityId: beaconOwner, name: 'Delta Warning', assetClass: 'Infrastructure', inceptionDate: '2023-01-01' })
  const external = await base.createPartnership({ entityId: outside, name: 'External Fund', assetClass: 'Credit', inceptionDate: '2020-01-01' })
  await pool.query(`update partnerships set status = 'CLOSED' where id = $1`, [cedar])
  await pool.query(`update partnerships set status = 'PENDING' where id = $1`, [delta])

  await base.createCommitment(alpha, { entityId: alder, amount: '100000.00', effectiveDate: '2021-01-01' })
  await base.createNav(alpha, { amount: '75000.00', valuationDate: '2025-12-31' })
  await seedYear(alpha, 2025, '60000.00', '-15000.00', base.adminUserId)
  await pool.query(`update k1_tracker_years set workflow_status = 'RECONCILED' where partnership_id = $1 and tax_year = 2025`, [alpha])

  await base.createCommitment(beacon, { entityId: beaconOwner, amount: '200000.00', effectiveDate: '2022-01-01' })
  await base.createNav(beacon, { amount: '150000.00', valuationDate: '2026-03-31' })
  await seedYear(beacon, 2025, '120000.00', '-30000.00', base.adminUserId)

  await base.createCommitment(delta, { entityId: beaconOwner, amount: '50000.00', effectiveDate: '2023-01-01' })
  await base.createNav(delta, { amount: '45000.00', valuationDate: '2024-12-31' })
  await seedYear(delta, 2024, '55000.00', '-5000.00', base.adminUserId, 2)

  await base.createCommitment(external, { entityId: outside, amount: '900000.00', effectiveDate: '2020-01-01' })
  await base.createNav(external, { amount: '1000000.00', valuationDate: '2026-06-30' })
  await seedYear(external, 2025, '800000.00', '-200000.00', base.adminUserId)
  await pool.query(`update k1_tracker_years set workflow_status = 'RECONCILED' where partnership_id = $1 and tax_year = 2025`, [external])

  if (base.userId) {
    await pool.query(`insert into entity_memberships (id, user_id, entity_id, created_by)
      values (gen_random_uuid(), $1, $2, $1), (gen_random_uuid(), $1, $3, $1)
      on conflict (user_id, entity_id) do nothing`, [base.userId, alder, beaconOwner])
  }

  const createBulkPartnerships = async (count: number) => {
    const ids: string[] = []
    for (let index = 0; index < count; index += 1) {
      ids.push(await base.createPartnership({
        entityId: index % 2 === 0 ? alder : beaconOwner,
        name: `Aggregation Bulk ${String(index).padStart(4, '0')}`,
        assetClass: index % 3 === 0 ? 'Credit' : 'Private Equity',
      }))
    }
    return ids
  }

  const cookie = (userId: string) => `${config.sessionCookieName}=${authRepository.createSession(userId).token}`
  return {
    base,
    partnershipIds: { alpha, beacon, cedar, delta, external },
    ownerIds: { alder, beacon: beaconOwner, outside },
    adminCookie: cookie(base.adminUserId),
    userCookie: base.userId ? cookie(base.userId) : null,
    createBulkPartnerships,
    cleanup: base.cleanup,
  }
}
