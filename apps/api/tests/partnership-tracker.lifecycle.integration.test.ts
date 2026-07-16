import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { PartnershipTrackerError } from '../src/modules/partnership-tracker/partnership-tracker.types.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

const durable = pool ? describe : describe.skip
durable('Partnership creation lifecycle', () => {
  let fixture: PartnershipTrackerFixture
  let documentIds: string[]
  const scope = { isAdmin: true, entityIds: [] as string[] }
  beforeEach(async () => {
    fixture = await createPartnershipTrackerFixture()
    documentIds = []
  })
  afterEach(async () => {
    await fixture.cleanup()
    if (documentIds.length > 0) await pool!.query('delete from documents where id = any($1::uuid[])', [documentIds])
  })

  const seedOwnerScopedRecords = async () => {
    const originalDocumentId = randomUUID()
    const supersedingDocumentId = randomUUID()
    const k1DocumentId = randomUUID()
    const trackerYearId = randomUUID()
    documentIds.push(originalDocumentId, supersedingDocumentId)
    await pool!.query(
      `insert into documents (id, file_name, storage_path) values
       ($1, 'original.pdf', '/test/original.pdf'), ($2, 'superseding.pdf', '/test/superseding.pdf')`,
      [originalDocumentId, supersedingDocumentId],
    )
    await pool!.query(
      `insert into k1_documents (id, document_id, partnership_id, tax_year, processing_status)
       values ($1, $2, $3, 2024, 'FINALIZED')`,
      [k1DocumentId, originalDocumentId, fixture.partnershipId],
    )

    const ids = {
      document_versions: randomUUID(),
      k1_reported_distributions: randomUUID(),
      partnership_commitments: randomUUID(),
      capital_activity_events: randomUUID(),
      partnership_annual_activity: randomUUID(),
      k1_tracker_years: trackerYearId,
      k1_tracker_import_batches: randomUUID(),
    }
    await pool!.query(
      `insert into document_versions
        (id, original_document_id, superseded_by_id, partnership_id, entity_id, tax_year)
       values ($1, $2, $3, $4, $5, 2024)`,
      [ids.document_versions, originalDocumentId, supersedingDocumentId, fixture.partnershipId, fixture.entityId],
    )
    await pool!.query(
      `insert into k1_reported_distributions
        (id, k1_document_id, entity_id, partnership_id, tax_year, reported_distribution_amount)
       values ($1, $2, $3, $4, 2024, 100.00)`,
      [ids.k1_reported_distributions, k1DocumentId, fixture.entityId, fixture.partnershipId],
    )
    await pool!.query(
      `insert into partnership_commitments
        (id, entity_id, partnership_id, commitment_amount, commitment_date)
       values ($1, $2, $3, 1000.00, '2024-01-01')`,
      [ids.partnership_commitments, fixture.entityId, fixture.partnershipId],
    )
    await pool!.query(
      `insert into capital_activity_events
        (id, entity_id, partnership_id, activity_date, event_type, amount)
       values ($1, $2, $3, '2024-02-01', 'funded_contribution', 250.00)`,
      [ids.capital_activity_events, fixture.entityId, fixture.partnershipId],
    )
    await pool!.query(
      `insert into partnership_annual_activity (id, entity_id, partnership_id, tax_year)
       values ($1, $2, $3, 2024)`,
      [ids.partnership_annual_activity, fixture.entityId, fixture.partnershipId],
    )
    await pool!.query(
      `insert into k1_tracker_years
        (id, entity_id, partnership_id, tax_year, workflow_status, revision)
       values ($1, $2, $3, 2024, 'RECONCILED', 2)`,
      [trackerYearId, fixture.entityId, fixture.partnershipId],
    )
    await pool!.query(
      `insert into k1_tracker_signoffs
        (id, tracker_year_id, year_revision, signoff_type, signed_by_user_id)
       values ($1, $2, 2, 'REVIEWED', $3)`,
      [randomUUID(), trackerYearId, fixture.adminUserId],
    )
    await pool!.query(
      `insert into k1_tracker_import_batches
        (id, entity_id, target_partnership_id, original_file_name, workbook_sha256, status, expires_at)
       values ($1, $2, $3, 'owner-test.xlsx', $4, 'PREVIEWED', now() + interval '1 day')`,
      [ids.k1_tracker_import_batches, fixture.entityId, fixture.partnershipId, 'a'.repeat(64)],
    )
    return ids
  }
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

  it('atomically reassigns every owner-scoped record, invalidates sign-off, and audits child counts', async () => {
    const ids = await seedOwnerScopedRecords()
    const before = (await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)).summary
    const updated = await partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      entityId: fixture.targetEntityId,
      expectedUpdatedAt: before.partnership.updatedAt,
    }, fixture.adminUserId, scope)

    expect(updated.partnership.entity.id).toBe(fixture.targetEntityId)
    for (const [table, id] of Object.entries(ids)) {
      const row = (await pool!.query<{ id: string; entity_id: string; revision?: number; workflow_status?: string }>(
        `select * from ${table} where id = $1`,
        [id],
      )).rows[0]!
      expect(row.id).toBe(id)
      expect(row.entity_id).toBe(fixture.targetEntityId)
      if (table === 'k1_tracker_years') {
        expect(row.revision).toBe(3)
        expect(row.workflow_status).toBe('NEEDS_REVIEW')
      }
    }

    const invalidation = (await pool!.query<{ year_revision: number; reason: string }>(
      `select year_revision, reason from k1_tracker_signoffs
       where tracker_year_id = $1 and signoff_type = 'INVALIDATED'`,
      [ids.k1_tracker_years],
    )).rows[0]
    expect(invalidation).toEqual({ year_revision: 3, reason: 'Partnership owner changed' })

    const audit = (await pool!.query<{ before_json: { entity_id: string }; after_json: { ownerReassignment: { sourceEntityId: string; targetEntityId: string; childRowCounts: Record<string, number> } } }>(
      `select before_json, after_json from audit_events
       where object_id = $1 and event_name = 'partnership_tracker.partnership.updated'
       order by created_at desc limit 1`,
      [fixture.partnershipId],
    )).rows[0]!
    expect(audit.before_json.entity_id).toBe(fixture.entityId)
    expect(audit.after_json.ownerReassignment).toEqual({
      sourceEntityId: fixture.entityId,
      targetEntityId: fixture.targetEntityId,
      childRowCounts: {
        document_versions: 1,
        k1_reported_distributions: 1,
        partnership_commitments: 1,
        capital_activity_events: 1,
        partnership_annual_activity: 1,
        k1_tracker_import_batches: 1,
        k1_tracker_years: 1,
      },
    })
  })

  it('does not invalidate tracker years when the selected owner is unchanged', async () => {
    const ids = await seedOwnerScopedRecords()
    const before = (await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)).summary
    await partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      entityId: fixture.entityId,
      expectedUpdatedAt: before.partnership.updatedAt,
    }, fixture.adminUserId, scope)
    const invalidations = await pool!.query(
      `select 1 from k1_tracker_signoffs where tracker_year_id = $1 and signoff_type = 'INVALIDATED'`,
      [ids.k1_tracker_years],
    )
    expect(invalidations.rowCount).toBe(0)
  })

  it('rolls back owner reassignment on duplicate, stale, scope, and injected child failures', async () => {
    const before = (await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)).summary
    await fixture.createPartnership({ entityId: fixture.targetEntityId, name: before.partnership.name })
    await expect(partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      entityId: fixture.targetEntityId,
      expectedUpdatedAt: before.partnership.updatedAt,
    }, fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'DUPLICATE_PARTNERSHIP_NAME' })

    const renamed = await partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      name: 'Owner move source',
      expectedUpdatedAt: before.partnership.updatedAt,
    }, fixture.adminUserId, scope)
    await expect(partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      entityId: fixture.targetEntityId,
      expectedUpdatedAt: before.partnership.updatedAt,
    }, fixture.adminUserId, scope)).rejects.toMatchObject({ code: 'STALE_PARTNERSHIP_REVISION' })
    await expect(partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      entityId: fixture.targetEntityId,
      expectedUpdatedAt: renamed.partnership.updatedAt,
    }, fixture.adminUserId, { isAdmin: false, entityIds: [fixture.entityId] })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const ids = await seedOwnerScopedRecords()
    const triggerSuffix = randomUUID().replaceAll('-', '')
    const triggerName = `fail_owner_move_${triggerSuffix}`
    const functionName = `fail_owner_move_fn_${triggerSuffix}`
    await pool!.query(`create function ${functionName}() returns trigger language plpgsql as $$ begin raise exception 'injected owner move failure'; end $$`)
    await pool!.query(`create trigger ${triggerName} before update on capital_activity_events for each row execute function ${functionName}()`)
    try {
      const current = (await partnershipTrackerRepository.getPartnership(fixture.partnershipId, scope)).summary
      await expect(partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
        entityId: fixture.targetEntityId,
        expectedUpdatedAt: current.partnership.updatedAt,
      }, fixture.adminUserId, scope)).rejects.toThrow('injected owner move failure')
    } finally {
      await pool!.query(`drop trigger if exists ${triggerName} on capital_activity_events`)
      await pool!.query(`drop function if exists ${functionName}()`)
    }

    const parent = (await pool!.query<{ entity_id: string }>('select entity_id from partnerships where id = $1', [fixture.partnershipId])).rows[0]!
    expect(parent.entity_id).toBe(fixture.entityId)
    for (const [table, id] of Object.entries(ids)) {
      const child = (await pool!.query<{ entity_id: string }>(`select entity_id from ${table} where id = $1`, [id])).rows[0]!
      expect(child.entity_id).toBe(fixture.entityId)
    }
  })
})
