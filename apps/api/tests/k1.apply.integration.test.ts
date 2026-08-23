import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pool } from '../src/infra/db/client.js'
import { applyReviewedK1, k1ApplyFaultInjection } from '../src/modules/k1/application/k1Apply.service.js'
import { k1TrackerRepository } from '../src/modules/k1-tracker/k1-tracker.repository.js'
import { createDurableK1ReviewFixture, type DurableK1ReviewFixture } from './helpers/durableK1ReviewFixture.js'

const durable = pool ? describe : describe.skip

durable('revision-bound atomic K-1 application', () => {
  let f: DurableK1ReviewFixture

  beforeEach(async () => { f = await createDurableK1ReviewFixture() })
  afterEach(async () => { k1ApplyFaultInjection.step = null; await f.cleanup() })

  const finalizeReview = async (): Promise<number> => {
    const correction = await f.app.inject({
      method: 'PUT', url: `/v1/k1-documents/${f.k1DocumentId}/corrections`,
      headers: { cookie: f.cookie, 'if-match': '3' },
      payload: { corrections: [{ fieldValueId: f.moneyFieldId, value: 1500.25 }] },
    })
    expect(correction.statusCode).toBe(200)
    const finalized = await f.app.inject({
      method: 'POST', url: `/v1/k1-documents/${f.k1DocumentId}/finalize`,
      headers: { cookie: f.cookie, 'if-match': String(correction.json().version) },
    })
    expect(finalized.statusCode).toBe(200)
    expect(finalized.json().readyToApply).toBe(true)
    return finalized.json().version as number
  }

  const preview = async (version: number) => {
    const response = await f.app.inject({
      method: 'POST', url: `/v1/k1-documents/${f.k1DocumentId}/apply-preview`,
      headers: { cookie: f.cookie }, payload: { expectedDocumentVersion: version },
    })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  const apply = async (application: ReturnType<typeof JSON.parse>, overrides: Record<string, unknown> = {}) => f.app.inject({
    method: 'POST', url: `/v1/k1-documents/${f.k1DocumentId}/apply`, headers: { cookie: f.cookie },
    payload: {
      applicationId: application.applicationId,
      expectedDocumentVersion: application.expectedDocumentVersion,
      expectedTrackerRevision: application.expectedTrackerRevision,
      decisions: application.decisions.map((decision: { id: string; defaultDecision: string }) => ({ decisionId: decision.id, decision: decision.defaultDecision })),
      ...overrides,
    },
  })

  it('applies calculation and official values to an empty year with complete provenance and idempotent replay', async () => {
    const version = await finalizeReview()
    const application = await preview(version)
    expect(application.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ destinationKind: 'CALCULATION', destinationKey: 'box_1_ordinary_income_loss', defaultDecision: 'USE_EXTRACTED' }),
      expect.objectContaining({ destinationKind: 'OFFICIAL', destinationKey: 'box_13_entries', defaultDecision: 'USE_EXTRACTED' }),
    ]))
    const response = await apply(application)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'APPLIED', trackerYearId: application.trackerYearId })
    const calculation = await pool!.query<{
      amount: string; source_type: string; source_k1_document_id: string; source_k1_field_value_id: string
    }>(`select amount, source_type, source_k1_document_id, source_k1_field_value_id
          from k1_tracker_value_revisions where tracker_year_id = $1 and field_key = 'box_1_ordinary_income_loss' and is_active`, [application.trackerYearId])
    expect(calculation.rows[0]).toMatchObject({ amount: '1500.25', source_type: 'FINALIZED_K1', source_k1_document_id: f.k1DocumentId, source_k1_field_value_id: f.moneyFieldId })
    const year = await pool!.query<{ official_form_data: Record<string, unknown>; revision: number }>('select official_form_data, revision from k1_tracker_years where id = $1', [application.trackerYearId])
    expect(year.rows[0].official_form_data.box_13_entries).toEqual([{ code: 'W', value: '45.00' }])
    expect(year.rows[0].revision).toBeGreaterThan(application.expectedTrackerRevision)
    const official = await pool!.query<{ source_k1_field_value_ids: string[] }>(
      `select source_k1_field_value_ids from k1_tracker_official_value_revisions
        where tracker_year_id = $1 and field_key = 'box_13_entries' and is_active`, [application.trackerYearId],
    )
    expect(official.rows[0].source_k1_field_value_ids).toEqual([f.codeRowFieldId])
    const replay = await apply(application)
    expect(replay.statusCode).toBe(200)
    expect(replay.json().applicationId).toBe(application.applicationId)
    expect((await pool!.query<{ count: string }>('select count(*)::text as count from k1_tracker_value_revisions where source_k1_document_id = $1 and is_active', [f.k1DocumentId])).rows[0].count).toBe('1')
  })

  it('deletes an applied tax year while retaining the reviewed PDF for a clean restart', async () => {
    const version = await finalizeReview()
    const application = await preview(version)
    expect((await apply(application)).statusCode).toBe(200)
    const year = await pool!.query<{ revision: number }>('select revision from k1_tracker_years where id = $1', [application.trackerYearId])

    await k1TrackerRepository.deleteYear(
      f.partnershipId,
      2025,
      year.rows[0]!.revision,
      f.admin.id,
      { isAdmin: true, entityIds: [] },
    )

    expect((await pool!.query<{ count: string }>('select count(*)::text as count from k1_tracker_years where id = $1', [application.trackerYearId])).rows[0]!.count).toBe('0')
    expect((await pool!.query<{ count: string }>('select count(*)::text as count from k1_document_applications where tracker_year_id = $1', [application.trackerYearId])).rows[0]!.count).toBe('0')
    expect((await pool!.query<{ processing_status: string; applied_tracker_year_id: string | null; applied_at: Date | null }>(
      'select processing_status, applied_tracker_year_id, applied_at from k1_documents where id = $1',
      [f.k1DocumentId],
    )).rows[0]).toMatchObject({ processing_status: 'READY_FOR_APPROVAL', applied_tracker_year_id: null, applied_at: null })
    expect((await pool!.query<{ status: string }>('select status from k1_ingestion_items where k1_document_id = $1', [f.k1DocumentId])).rows[0]!.status).toBe('READY_TO_APPLY')
  })

  it('defaults populated conflicts and dated capital activity to KEEP_EXISTING without silent overwrite', async () => {
    const version = await finalizeReview()
    const trackerYearId = randomUUID()
    await pool!.query(
      `insert into k1_tracker_years (id, entity_id, partnership_id, tax_year, workflow_status, revision, official_form_data)
       values ($1, $2, $3, 2025, 'IN_PROGRESS', 4, '{"box_13_entries":[{"code":"W","value":"10.00"}]}'::jsonb)`,
      [trackerYearId, f.entityId, f.partnershipId],
    )
    await pool!.query(
      `insert into k1_tracker_value_revisions
         (id, tracker_year_id, field_key, amount, source_type, is_active, created_by_user_id)
       values ($1, $2, 'box_1_ordinary_income_loss', '999.00', 'MANUAL_ENTRY', true, $3)`,
      [randomUUID(), trackerYearId, f.admin.id],
    )
    await pool!.query(
      `insert into capital_activity_events
         (id, entity_id, partnership_id, activity_date, event_type, amount, source_type, created_by_user_id)
       values ($1, $2, $3, '2025-06-01', 'distribution', '500.00', 'manual', $4)`,
      [randomUUID(), f.entityId, f.partnershipId, f.admin.id],
    )
    const application = await preview(version)
    expect(application.expectedTrackerRevision).toBe(4)
    expect(application.decisions.find((decision: { destinationKey: string }) => decision.destinationKey === 'box_1_ordinary_income_loss')).toMatchObject({ existingValue: '999.00', defaultDecision: 'KEEP_EXISTING', conflict: true })
    // The fixture does not include Box 19, but the preview target retains the
    // dated activity independently and never synthesizes a PDF overwrite.
    const response = await apply(application)
    expect(response.statusCode).toBe(200)
    const active = await pool!.query<{ amount: string }>(`select amount from k1_tracker_value_revisions where tracker_year_id = $1 and field_key = 'box_1_ordinary_income_loss' and is_active`, [trackerYearId])
    expect(active.rows[0].amount).toBe('999.00')
    const evidence = await pool!.query<{ is_active: boolean }>(`select is_active from k1_tracker_value_revisions where source_k1_document_id = $1 and field_key = 'box_1_ordinary_income_loss'`, [f.k1DocumentId])
    expect(evidence.rows[0].is_active).toBe(false)
  })

  it('rejects stale document/year revisions and expired previews', async () => {
    const version = await finalizeReview()
    const staleDocument = await preview(version)
    await pool!.query('update k1_documents set version = version + 1 where id = $1', [f.k1DocumentId])
    expect((await apply(staleDocument)).json().error).toBe('STALE_K1_VERSION')
    await pool!.query('update k1_documents set version = $2 where id = $1', [f.k1DocumentId, version])
    await pool!.query(`update k1_document_applications set status = 'STALE' where id = $1`, [staleDocument.applicationId])
    const staleYear = await preview(version)
    await pool!.query('update k1_tracker_years set revision = revision + 1 where id = $1', [staleYear.trackerYearId])
    expect((await apply(staleYear)).json().error).toBe('STALE_TRACKER_REVISION')
    await pool!.query(`update k1_document_applications set status = 'STALE' where id = $1`, [staleYear.applicationId])
    const expired = await preview(version)
    await pool!.query(`update k1_document_applications set preview_expires_at = now() - interval '1 minute' where id = $1`, [expired.applicationId])
    expect((await apply(expired)).json().error).toBe('APPLICATION_PREVIEW_EXPIRED')
  })

  it('rolls back every financial write on an injected failure and retains the reviewed draft', async () => {
    const version = await finalizeReview()
    const application = await preview(version)
    k1ApplyFaultInjection.step = 'after_recalculation'
    // Exercise the service seam directly so the test can also vary the
    // authorization snapshot independently of Fastify's admin scope.
    await expect(applyReviewedK1({
      k1DocumentId: f.k1DocumentId, applicationId: application.applicationId,
      expectedDocumentVersion: application.expectedDocumentVersion,
      expectedTrackerRevision: application.expectedTrackerRevision,
      decisions: application.decisions.map((decision: { id: string; defaultDecision: 'USE_EXTRACTED' | 'KEEP_EXISTING' }) => ({ decisionId: decision.id, decision: decision.defaultDecision })),
      actorUserId: f.admin.id, authorizedEntityIds: [f.entityId], isAdmin: true,
    })).rejects.toBeTruthy()
    expect((await pool!.query<{ count: string }>('select count(*)::text as count from k1_tracker_value_revisions where source_k1_document_id = $1', [f.k1DocumentId])).rows[0].count).toBe('0')
    expect((await pool!.query<{ processing_status: string }>('select processing_status from k1_documents where id = $1', [f.k1DocumentId])).rows[0].processing_status).toBe('READY_FOR_APPROVAL')
  })

  it('rechecks authorization inside the transaction', async () => {
    const version = await finalizeReview()
    const application = await preview(version)
    await expect(applyReviewedK1({
      k1DocumentId: f.k1DocumentId, applicationId: application.applicationId,
      expectedDocumentVersion: application.expectedDocumentVersion,
      expectedTrackerRevision: application.expectedTrackerRevision,
      decisions: application.decisions.map((decision: { id: string; defaultDecision: 'USE_EXTRACTED' | 'KEEP_EXISTING' }) => ({ decisionId: decision.id, decision: decision.defaultDecision })),
      actorUserId: f.admin.id, authorizedEntityIds: [], isAdmin: true,
    })).rejects.toMatchObject({ code: 'FORBIDDEN_ENTITY' })
  })
})
