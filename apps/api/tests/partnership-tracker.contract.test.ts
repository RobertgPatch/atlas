import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { config } from '../src/config.js'
import { pool } from '../src/infra/db/client.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import {
  createTrackedPartnershipBodySchema,
  updateTrackedPartnershipBodySchema,
} from '../src/modules/partnership-tracker/partnership-tracker.zod.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Partnership Tracker HTTP contract', () => {
  let fixture: TestFixture
  beforeEach(async () => { fixture = await createTestFixture() })
  afterEach(async () => { await fixture.app.close() })

  it('rejects malformed filters and controlled partnership types', async () => {
    const badCursor = await fixture.app.inject({ method: 'GET', url: '/v1/partnership-tracker/partnerships?cursor=opaque!', headers: { cookie: fixture.cookie } })
    expect(badCursor.statusCode).toBe(400)
    const badType = await fixture.app.inject({ method: 'POST', url: '/v1/partnership-tracker/partnerships', headers: { cookie: fixture.cookie }, payload: { entityId: fixture.entityIds[0], name: 'Bad type', partnershipType: 'Crypto' } })
    expect(badType.statusCode).toBe(400)
  })

  it('protects the aggregation route and parses it before the partnership id route', async () => {
    const unauthenticated = await fixture.app.inject({
      method: 'GET',
      url: '/v1/partnership-tracker/aggregation',
    })
    expect(unauthenticated.statusCode).toBe(401)

    const authenticated = await fixture.app.inject({
      method: 'GET',
      url: '/v1/partnership-tracker/aggregation?page=invalid&pageSize=999&sort=unknown',
      headers: { cookie: fixture.cookie },
    })
    expect(authenticated.statusCode).toBe(pool ? 200 : 503)
  })

  it('protects and validates private investment reads and PDF exports', async () => {
    const unauthenticated = await fixture.app.inject({
      method: 'GET',
      url: '/v1/partnership-tracker/private-investments',
    })
    expect(unauthenticated.statusCode).toBe(401)
    const reversed = await fixture.app.inject({
      method: 'GET',
      url: '/v1/partnership-tracker/private-investments?dateFrom=2025-02-01&dateTo=2025-01-01',
      headers: { cookie: fixture.cookie },
    })
    expect(reversed.statusCode).toBe(400)
    const invalidPdf = await fixture.app.inject({
      method: 'POST',
      url: '/v1/partnership-tracker/private-investments/pdf',
      headers: { cookie: fixture.cookie },
      payload: {
        filters: {},
        summaryColumns: ['entity', 'unknown'],
        detailColumns: ['entity'],
      },
    })
    expect(invalidPdf.statusCode).toBe(400)
  })

  it('protects and validates partnership-level all-date cash activity routes', async () => {
    const partnershipId = randomUUID()
    const unauthenticated = await fixture.app.inject({
      method: 'POST',
      url: `/v1/partnership-tracker/partnerships/${partnershipId}/cash-flows/batch`,
      payload: { entries: [{ kind: 'CAPITAL_CALL', activityDate: '2020-01-01', amount: '100.00' }] },
    })
    expect(unauthenticated.statusCode).toBe(401)

    const invalid = await fixture.app.inject({
      method: 'POST',
      url: `/v1/partnership-tracker/partnerships/${partnershipId}/cash-flows/batch`,
      headers: { cookie: fixture.cookie },
      payload: { entries: [{ kind: 'CAPITAL_CALL', activityDate: 'not-a-date', amount: '100.00' }] },
    })
    expect(invalid.statusCode).toBe(400)
  })

  it('validates inception dates and unit-ratio management fee configuration', () => {
    expect(createTrackedPartnershipBodySchema.safeParse({
      entityId: fixture.entityIds[0],
      name: 'JSP fund',
      partnershipType: 'JSP',
    }).success).toBe(true)
    const validCreate = createTrackedPartnershipBodySchema.safeParse({
      entityId: fixture.entityIds[0],
      name: 'Configured fund',
      partnershipType: 'Private Equity',
      inceptionDate: '2023-08-03',
      managementFeeRate: '0.02000000',
      capitalCommitment: '1000000.00',
    })
    expect(validCreate.success).toBe(true)
    expect(createTrackedPartnershipBodySchema.safeParse({
      entityId: fixture.entityIds[0],
      name: 'Inherited by the server',
      partnershipType: 'Other',
      existingPartnershipId: '00000000-0000-4000-8000-000000000123',
    }).success).toBe(true)
    const copyCreate = createTrackedPartnershipBodySchema.safeParse({
      entityId: fixture.entityIds[0],
      name: 'Copied history fund',
      partnershipType: 'Private Equity',
      copyK1YearsFrom: {
        partnershipId: '00000000-0000-4000-8000-000000000123',
        taxYears: [2024, 2022, 2024],
      },
    })
    expect(copyCreate.success).toBe(true)
    if (copyCreate.success) expect(copyCreate.data.copyK1YearsFrom?.taxYears).toEqual([2022, 2024])
    expect(createTrackedPartnershipBodySchema.safeParse({
      entityId: fixture.entityIds[0],
      name: 'Missing copy years',
      partnershipType: 'Private Equity',
      copyK1YearsFrom: { partnershipId: '00000000-0000-4000-8000-000000000123', taxYears: [] },
    }).success).toBe(false)

    const validClear = updateTrackedPartnershipBodySchema.safeParse({
      inceptionDate: null,
      managementFeeRate: null,
      expectedUpdatedAt: '2026-07-14T12:00:00.000Z',
    })
    expect(validClear.success).toBe(true)

    expect(updateTrackedPartnershipBodySchema.safeParse({
      managementFeeRate: '1.00000001',
      expectedUpdatedAt: '2026-07-14T12:00:00.000Z',
    }).success).toBe(false)
    expect(createTrackedPartnershipBodySchema.safeParse({
      entityId: fixture.entityIds[0],
      name: 'Invalid negative commitment',
      partnershipType: 'Private Equity',
      capitalCommitment: '-1.00',
    }).success).toBe(false)
    expect(updateTrackedPartnershipBodySchema.safeParse({
      capitalCommitment: '-1.00',
      expectedUpdatedAt: '2026-07-14T12:00:00.000Z',
    }).success).toBe(false)
    expect(updateTrackedPartnershipBodySchema.safeParse({
      inceptionDate: '2999-01-01',
      expectedUpdatedAt: '2026-07-14T12:00:00.000Z',
    }).success).toBe(false)
  })
})

const durable = pool ? describe : describe.skip
durable('Partnership Tracker list/detail contract with PostgreSQL', () => {
  let fixture: PartnershipTrackerFixture
  let app: FastifyInstance
  let cookie: string
  let userCookie: string | null
  beforeEach(async () => {
    fixture = await createPartnershipTrackerFixture()
    cookie = `${config.sessionCookieName}=${authRepository.createSession(fixture.adminUserId).token}`
    userCookie = fixture.userId == null ? null : `${config.sessionCookieName}=${authRepository.createSession(fixture.userId).token}`
    app = buildApp()
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
    await fixture.cleanup()
  })
  it('returns deterministic summaries, exact money strings, and pagination metadata', async () => {
    await partnershipTrackerRepository.createCommitment(fixture.partnershipId, { amount: '1000000.00', effectiveDate: '2024-01-01' }, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    await partnershipTrackerRepository.createNav(fixture.partnershipId, { amount: '900000.00', valuationDate: '2024-12-31' }, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    const result = await partnershipTrackerRepository.listPartnerships({ isAdmin: true, entityIds: [] }, { entityId: fixture.entityId, limit: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.items[0]!.currentCommittedCapital?.amount).toBe('1000000.00')
    expect(result.items[0]!.latestNav?.amount).toBe('900000.00')
    expect(result.items[0]).toMatchObject({
      latestSectionLCapital: null,
      totalCapitalContributions: '0.00',
      totalDistributions: '0.00',
      totalRecallableDistributions: '0.00',
      dpi: null,
      tvpi: null,
      irr: null,
      performanceStatus: { dpi: 'MISSING_CONTRIBUTIONS', tvpi: 'MISSING_CONTRIBUTIONS', irr: 'MISSING_CONTRIBUTIONS' },
    })
  })

  it('creates a new owner record in the selected partnership aggregation group', async () => {
    const source = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, { isAdmin: true, entityIds: [] })
    const created = await partnershipTrackerRepository.createPartnership({
      entityId: fixture.targetEntityId,
      name: 'This value is intentionally ignored',
      partnershipType: 'Other',
      existingPartnershipId: fixture.partnershipId,
      capitalCommitment: '1000000.00',
    }, fixture.adminUserId, { isAdmin: true, entityIds: [] })

    expect(created.partnership.partnership).toMatchObject({
      aggregationGroupId: source.summary.partnership.aggregationGroupId,
      name: source.summary.partnership.name,
      partnershipType: source.summary.partnership.partnershipType,
      entity: { id: fixture.targetEntityId },
    })
    expect(created.partnership.partnership.id).not.toBe(fixture.partnershipId)
    expect(created.partnership.currentCommittedCapital?.amount).toBe('1000000.00')

    const aggregation = await partnershipTrackerRepository.getAggregation({ isAdmin: true, entityIds: [] }, {
      ownerIds: [], partnershipTypes: [], statuses: [], workflowStatuses: [], dataQuality: [],
      search: source.summary.partnership.name, sort: 'partnership', direction: 'asc', page: 1, pageSize: 25,
    })
    expect(aggregation.items).toHaveLength(1)
    expect(aggregation.items[0]).toMatchObject({ ownerCount: 2 })
    expect(aggregation.items[0]?.members).toHaveLength(2)

    const workspace = await partnershipTrackerRepository.listPartnerships({ isAdmin: true, entityIds: [] }, { search: source.summary.partnership.name, limit: 25 })
    expect(workspace.items).toHaveLength(2)
  })

  it('copies selected K-1 values and dated cash activity without copying sign-offs', async () => {
    const scope = { isAdmin: true, entityIds: [] as string[] }
    let destinationId: string | undefined
    await partnershipTrackerRepository.createYear(fixture.partnershipId, 2023, fixture.adminUserId, scope)
    let sourceYear = await partnershipTrackerRepository.getYear(fixture.partnershipId, 2023, scope)
    await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2023, sourceYear.revision, [{
      fieldKey: 'box_1_ordinary_income_loss', amount: '12345.67', sourceType: 'MANUAL_ENTRY',
    }], fixture.adminUserId, scope)
    await partnershipTrackerRepository.createCashFlow(fixture.partnershipId, 2023, {
      kind: 'CAPITAL_CALL', activityDate: '2023-04-15', amount: '25000.00', note: 'Shared owner call',
    }, fixture.adminUserId, scope)
    sourceYear = await partnershipTrackerRepository.getYear(fixture.partnershipId, 2023, scope)
    await partnershipTrackerRepository.signoff(fixture.partnershipId, 2023, sourceYear.revision, 'PREPARE', null, fixture.adminUserId, scope)
    await partnershipTrackerRepository.createYear(fixture.partnershipId, 2024, fixture.adminUserId, scope)

    try {
      const created = await partnershipTrackerRepository.createPartnership({
        entityId: fixture.targetEntityId,
        name: `Copied K-1 Fund ${Date.now()}`,
        partnershipType: 'Private Equity',
        copyK1YearsFrom: { partnershipId: fixture.partnershipId, taxYears: [2023] },
      }, fixture.adminUserId, scope)
      destinationId = created.partnership.partnership.id

      const destination = await partnershipTrackerRepository.getPartnership(destinationId, scope)
      expect(destination.years.map((year) => year.taxYear)).toEqual([2023])
      const copiedYear = await partnershipTrackerRepository.getYear(destinationId, 2023, scope)
      expect(copiedYear.values.find((value) => value.fieldKey === 'box_1_ordinary_income_loss')).toMatchObject({
        amount: '12345.67', sourceType: 'MANUAL_ENTRY', sourceK1DocumentId: null, importBatchId: null,
      })
      expect(copiedYear.cashFlowEvents).toHaveLength(1)
      expect(copiedYear.cashFlowEvents[0]).toMatchObject({
        activityDate: '2023-04-15', amount: '25000.00', note: 'Shared owner call', kind: 'CAPITAL_CALL',
      })
      expect(copiedYear.signoff).toMatchObject({ preparedAt: null, reviewedAt: null, history: [] })
      expect((await partnershipTrackerRepository.getYear(fixture.partnershipId, 2023, scope)).signoff.preparedAt).not.toBeNull()
    } finally {
      if (destinationId) {
        const childIds = (await pool!.query<{ id: string }>(`
          select id from k1_tracker_years where partnership_id = $1
          union all select id from capital_activity_events where partnership_id = $1
        `, [destinationId])).rows.map((row) => row.id)
        await pool!.query('delete from audit_events where object_id = any($1::uuid[])', [[destinationId, ...childIds]])
        await pool!.query('delete from capital_activity_events where partnership_id = $1', [destinationId])
        await pool!.query('delete from k1_tracker_years where partnership_id = $1', [destinationId])
        await pool!.query('delete from partnership_annual_activity where partnership_id = $1', [destinationId])
        await pool!.query('delete from partnerships where id = $1', [destinationId])
      }
    }
  })

  it('returns a scoped, derived-only management-fee schedule with validated as-of dates', async () => {
    const current = await partnershipTrackerRepository.getPartnership(fixture.partnershipId, { isAdmin: true, entityIds: [] })
    await partnershipTrackerRepository.updatePartnership(fixture.partnershipId, {
      inceptionDate: '2024-07-01',
      managementFeeRate: '0.02000000',
      expectedUpdatedAt: current.summary.partnership.updatedAt,
    }, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    await fixture.createCommitment(fixture.partnershipId, { amount: '1000000.00', effectiveDate: '2024-07-01' })
    const revisionsBefore = await pool!.query('select count(*)::int as count from k1_tracker_value_revisions')

    const response = await app.inject({
      method: 'GET',
      url: `/v1/partnership-tracker/partnerships/${fixture.partnershipId}/management-fees?asOfDate=2024-12-31`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      partnershipId: fixture.partnershipId,
      status: 'AVAILABLE',
      annualRate: '0.02000000',
      asOfDate: '2024-12-31',
      annualRows: [{ calendarYear: 2024, activeDays: 184, daysInYear: 366 }],
    })
    const revisionsAfter = await pool!.query('select count(*)::int as count from k1_tracker_value_revisions')
    expect(revisionsAfter.rows[0]!.count).toBe(revisionsBefore.rows[0]!.count)

    const invalidDate = await app.inject({
      method: 'GET',
      url: `/v1/partnership-tracker/partnerships/${fixture.partnershipId}/management-fees?asOfDate=2024-06-30`,
      headers: { cookie },
    })
    expect(invalidDate.statusCode).toBe(400)
    expect(invalidDate.json().error).toBe('VALIDATION_ERROR')

    if (userCookie) {
      const forbidden = await app.inject({
        method: 'GET',
        url: `/v1/partnership-tracker/partnerships/${fixture.partnershipId}/management-fees?asOfDate=2024-12-31`,
        headers: { cookie: userCookie },
      })
      expect(forbidden.statusCode).toBe(403)
    }
  })

  it('allows only an Admin to delete a partnership and cascades its complete child tree', async () => {
    const documentId = randomUUID()
    const k1DocumentId = randomUUID()
    await partnershipTrackerRepository.createYear(fixture.partnershipId, 2024, fixture.adminUserId, { isAdmin: true, entityIds: [] })
    await fixture.createCommitment(fixture.partnershipId)
    await fixture.createNav(fixture.partnershipId)
    await pool!.query(`insert into capital_activity_events
      (id, entity_id, partnership_id, activity_date, event_type, amount, source_type)
      values (gen_random_uuid(), $1, $2, '2024-06-01', 'funded_contribution', 1000, 'manual')`, [fixture.entityId, fixture.partnershipId])
    await pool!.query(`insert into partnership_assets (id, partnership_id, name, asset_type)
      values (gen_random_uuid(), $1, 'Cascade asset', 'partnership')`, [fixture.partnershipId])
    await pool!.query(`insert into documents (id, file_name, storage_path, mime_type)
      values ($1, 'cascade.pdf', 'tests/cascade.pdf', 'application/pdf')`, [documentId])
    await pool!.query(`insert into k1_documents (id, document_id, partnership_id, tax_year)
      values ($1, $2, $3, 2024)`, [k1DocumentId, documentId, fixture.partnershipId])
    await pool!.query(`insert into k1_field_values (id, k1_document_id, field_name, raw_value)
      values (gen_random_uuid(), $1, 'box_1', '100')`, [k1DocumentId])
    await pool!.query(`insert into k1_issues (id, k1_document_id, issue_type, message)
      values (gen_random_uuid(), $1, 'TEST', 'Cascade child')`, [k1DocumentId])
    await pool!.query(`insert into k1_reported_distributions
      (id, k1_document_id, entity_id, partnership_id, tax_year, reported_distribution_amount)
      values (gen_random_uuid(), $1, $2, $3, 2024, 100)`, [k1DocumentId, fixture.entityId, fixture.partnershipId])
    await pool!.query(`insert into k1_tracker_import_batches
      (id, entity_id, target_partnership_id, original_file_name, workbook_sha256, status, expires_at)
      values (gen_random_uuid(), $1, $2, 'cascade.xlsx', repeat('a', 64), 'PREVIEWED', now() + interval '1 hour')`, [fixture.entityId, fixture.partnershipId])

    if (userCookie) {
      const forbidden = await app.inject({
        method: 'DELETE',
        url: `/v1/partnership-tracker/partnerships/${fixture.partnershipId}`,
        headers: { cookie: userCookie },
      })
      expect(forbidden.statusCode).toBe(403)
    }

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/partnership-tracker/partnerships/${fixture.partnershipId}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(204)

    const remaining = await pool!.query<{ count: number }>(`select (
      (select count(*) from partnerships where id = $1) +
      (select count(*) from k1_documents where partnership_id = $1) +
      (select count(*) from k1_tracker_years where partnership_id = $1) +
      (select count(*) from k1_tracker_import_batches where target_partnership_id = $1) +
      (select count(*) from partnership_commitments where partnership_id = $1) +
      (select count(*) from capital_activity_events where partnership_id = $1) +
      (select count(*) from partnership_fmv_snapshots where partnership_id = $1) +
      (select count(*) from partnership_assets where partnership_id = $1)
    )::int as count`, [fixture.partnershipId])
    expect(remaining.rows[0]!.count).toBe(0)
    expect((await pool!.query('select 1 from documents where id = $1', [documentId])).rowCount).toBe(0)
    expect((await pool!.query(`select 1 from audit_events where object_id = $1 and event_name = 'partnership_tracker.partnership.deleted'`, [fixture.partnershipId])).rowCount).toBe(1)
  })
})
