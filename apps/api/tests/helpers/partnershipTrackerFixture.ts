import { randomUUID } from 'node:crypto'
import { pool } from '../../src/infra/db/client.js'
import { runMigrations } from '../../src/infra/db/migrate.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'

export interface PartnershipTrackerFixture {
  entityId: string
  partnershipId: string
  adminUserId: string
  userId: string | null
  createPartnership: (overrides?: { name?: string; assetClass?: string }) => Promise<string>
  cleanup: () => Promise<void>
}

export async function createPartnershipTrackerFixture(): Promise<PartnershipTrackerFixture> {
  if (!pool) throw new Error('ATLAS_TEST_DATABASE_URL is required for durable Partnership Tracker tests')
  await runMigrations()
  await authRepository.bootstrapFromDatabase()
  const users = authRepository.listUsers()
  const adminUserId = users.find((user) => user.role === 'Admin')!.id
  const userId = users.find((user) => user.role !== 'Admin')?.id ?? null
  const entityId = randomUUID()
  const partnershipIds: string[] = []
  await pool.query(`insert into entities (id, name, entity_type) values ($1, $2, 'TRUST')`, [entityId, `Partnership Tracker ${entityId.slice(0, 8)}`])

  const createPartnership = async (overrides: { name?: string; assetClass?: string } = {}) => {
    const partnershipId = randomUUID()
    partnershipIds.push(partnershipId)
    await pool!.query(
      `insert into partnerships (id, entity_id, name, asset_class) values ($1, $2, $3, $4)`,
      [partnershipId, entityId, overrides.name ?? `Tracked Partnership ${partnershipId.slice(0, 8)}`, overrides.assetClass ?? 'Private Equity'],
    )
    return partnershipId
  }

  const partnershipId = await createPartnership()
  return {
    entityId,
    partnershipId,
    adminUserId,
    userId,
    createPartnership,
    cleanup: async () => {
      await pool!.query('delete from audit_events where object_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from partnership_fmv_snapshots where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from partnership_commitments where entity_id = $1', [entityId])
      await pool!.query('delete from partnership_annual_activity where entity_id = $1', [entityId])
      await pool!.query('delete from k1_tracker_import_batches where entity_id = $1', [entityId])
      await pool!.query('delete from k1_tracker_years where entity_id = $1', [entityId])
      await pool!.query('delete from k1_field_values where k1_document_id in (select id from k1_documents where partnership_id = any($1::uuid[]))', [partnershipIds])
      await pool!.query('delete from k1_reported_distributions where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from k1_documents where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from entity_memberships where entity_id = $1', [entityId])
      await pool!.query('delete from partnerships where entity_id = $1', [entityId])
      await pool!.query('delete from entities where id = $1', [entityId])
    },
  }
}
