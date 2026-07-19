import { randomUUID } from 'node:crypto'
import { pool } from '../../src/infra/db/client.js'
import { runMigrations } from '../../src/infra/db/migrate.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'

export interface K1TrackerFixture {
  entityId: string
  partnershipId: string
  adminUserId: string
  cleanup: () => Promise<void>
}

export const createK1TrackerFixture = async (): Promise<K1TrackerFixture> => {
  if (!pool) throw new Error('ATLAS_TEST_DATABASE_URL is required for durable tracker tests')
  await runMigrations()
  await authRepository.bootstrapFromDatabase()
  const adminUserId = authRepository.listUsers().find((user) => user.role === 'Admin')!.id
  const entityId = randomUUID()
  const partnershipId = randomUUID()
  await pool.query(`insert into entities (id, name, entity_type) values ($1, $2, 'TRUST')`, [entityId, `K1 Tracker Test ${entityId.slice(0, 8)}`])
  await pool.query(`insert into partnerships (id, entity_id, name) values ($1, $2, $3)`, [partnershipId, entityId, `K1 Tracker Partnership ${partnershipId.slice(0, 8)}`])
  return {
    entityId,
    partnershipId,
    adminUserId,
    cleanup: async () => {
      await pool.query('delete from partnership_annual_activity where partnership_id = $1', [partnershipId])
      await pool.query('delete from k1_tracker_years where partnership_id = $1', [partnershipId])
      await pool.query('delete from k1_tracker_import_batches where entity_id = $1', [entityId])
      await pool.query('delete from k1_field_values where k1_document_id in (select id from k1_documents where partnership_id = $1)', [partnershipId])
      await pool.query('delete from k1_reported_distributions where partnership_id = $1', [partnershipId])
      await pool.query('delete from k1_documents where partnership_id = $1', [partnershipId])
      await pool.query('delete from entity_memberships where entity_id = $1', [entityId])
      await pool.query('delete from partnerships where id = $1', [partnershipId])
      await pool.query('delete from entities where id = $1', [entityId])
    },
  }
}
