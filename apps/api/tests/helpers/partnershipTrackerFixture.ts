import { randomUUID } from 'node:crypto'
import { pool } from '../../src/infra/db/client.js'
import { runMigrations } from '../../src/infra/db/migrate.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'

export interface PartnershipTrackerFixture {
  entityId: string
  targetEntityId: string
  partnershipId: string
  adminUserId: string
  userId: string | null
  createOwner: (name?: string) => Promise<string>
  createPartnership: (overrides?: {
    entityId?: string
    name?: string
    assetClass?: string
    inceptionDate?: string | null
    managementFeeRate?: string | null
  }) => Promise<string>
  createCommitment: (partnershipId: string, overrides?: {
    entityId?: string
    amount?: string
    effectiveDate?: string
    status?: string
  }) => Promise<string>
  createNav: (partnershipId: string, overrides?: { amount?: string; valuationDate?: string }) => Promise<string>
  cleanup: () => Promise<void>
}

export interface AnnualPerformanceFixtureValue {
  taxYear: number
  hasCanonicalContribution: boolean
  capitalContributions: string | null
  legacyCapitalContributions: string | null
  distributions: string | null
}

export const twoYearPerformanceFixture = (): AnnualPerformanceFixtureValue[] => [
  { taxYear: 2021, hasCanonicalContribution: true, capitalContributions: '3000000.00', legacyCapitalContributions: null, distributions: '0.00' },
  { taxYear: 2022, hasCanonicalContribution: true, capitalContributions: '0.00', legacyCapitalContributions: null, distributions: '-190773.00' },
]

export const liabilityOnlyChangeFixture = () => ({
  liability_nonrecourse_beginning: '100.00',
  liability_nonrecourse_ending: '1000.00',
})

export const canonicalOnlyContributionFixture = () => ({
  hasCanonicalContribution: true,
  capitalContributions: '100.00',
  legacyCapitalContributions: null,
})

export const legacyOnlyContributionFixture = () => ({
  hasCanonicalContribution: false,
  capitalContributions: null,
  legacyCapitalContributions: '100.00',
})

export const equalContributionFixture = () => ({
  hasCanonicalContribution: true,
  capitalContributions: '100.00',
  legacyCapitalContributions: '100.00',
})

export const conflictingContributionFixture = () => ({
  hasCanonicalContribution: true,
  capitalContributions: '100.00',
  legacyCapitalContributions: '125.00',
})

export async function createPartnershipTrackerFixture(): Promise<PartnershipTrackerFixture> {
  if (!pool) throw new Error('ATLAS_TEST_DATABASE_URL is required for durable Partnership Tracker tests')
  await runMigrations()
  await authRepository.bootstrapFromDatabase()
  const users = authRepository.listUsers()
  const adminUserId = users.find((user) => user.role === 'Admin')!.id
  const userId = users.find((user) => user.role !== 'Admin')?.id ?? null
  const entityId = randomUUID()
  const entityIds = [entityId]
  const partnershipIds: string[] = []
  await pool.query(`insert into entities (id, name, entity_type) values ($1, $2, 'TRUST')`, [entityId, `Partnership Tracker ${entityId.slice(0, 8)}`])

  const createOwner = async (name?: string) => {
    const id = randomUUID()
    entityIds.push(id)
    await pool!.query(`insert into entities (id, name, entity_type) values ($1, $2, 'TRUST')`, [id, name ?? `Partnership Tracker ${id.slice(0, 8)}`])
    return id
  }

  const createPartnership = async (overrides: {
    entityId?: string
    name?: string
    assetClass?: string
    inceptionDate?: string | null
    managementFeeRate?: string | null
  } = {}) => {
    const partnershipId = randomUUID()
    partnershipIds.push(partnershipId)
    await pool!.query(
      `insert into partnerships (id, entity_id, name, asset_class, inception_date, management_fee_rate)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        partnershipId,
        overrides.entityId ?? entityId,
        overrides.name ?? `Tracked Partnership ${partnershipId.slice(0, 8)}`,
        overrides.assetClass ?? 'Private Equity',
        overrides.inceptionDate ?? null,
        overrides.managementFeeRate ?? null,
      ],
    )
    return partnershipId
  }

  const createCommitment = async (partnershipId: string, overrides: {
    entityId?: string
    amount?: string
    effectiveDate?: string
    status?: string
  } = {}) => {
    const id = randomUUID()
    await pool!.query(
      `insert into partnership_commitments
        (id, entity_id, partnership_id, commitment_amount, commitment_date, status, source_type)
       values ($1, $2, $3, $4, $5, $6, 'manual')`,
      [id, overrides.entityId ?? entityId, partnershipId, overrides.amount ?? '1000000.00', overrides.effectiveDate ?? '2024-01-01', overrides.status ?? 'ACTIVE'],
    )
    return id
  }

  const createNav = async (partnershipId: string, overrides: { amount?: string; valuationDate?: string } = {}) => {
    const id = randomUUID()
    await pool!.query(
      `insert into partnership_fmv_snapshots (id, partnership_id, valuation_date, fmv_amount, source_type)
       values ($1, $2, $3, $4, 'manager_statement')`,
      [id, partnershipId, overrides.valuationDate ?? '2024-12-31', overrides.amount ?? '900000.00'],
    )
    return id
  }

  const partnershipId = await createPartnership()
  const targetEntityId = await createOwner()
  return {
    entityId,
    targetEntityId,
    partnershipId,
    adminUserId,
    userId,
    createOwner,
    createPartnership,
    createCommitment,
    createNav,
    cleanup: async () => {
      await pool!.query('delete from audit_events where object_id = any($1::uuid[])', [[...partnershipIds, ...entityIds]])
      await pool!.query('delete from partnership_fmv_snapshots where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from partnership_commitments where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from capital_activity_events where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from partnership_annual_activity where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from k1_tracker_import_batches where target_partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from k1_tracker_years where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from k1_field_values where k1_document_id in (select id from k1_documents where partnership_id = any($1::uuid[]))', [partnershipIds])
      await pool!.query('delete from k1_reported_distributions where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from document_versions where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from k1_documents where partnership_id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from entity_memberships where entity_id = any($1::uuid[])', [entityIds])
      await pool!.query('delete from partnerships where id = any($1::uuid[])', [partnershipIds])
      await pool!.query('delete from partnerships where entity_id = any($1::uuid[])', [entityIds])
      await pool!.query('delete from entities where id = any($1::uuid[])', [entityIds])
    },
  }
}
