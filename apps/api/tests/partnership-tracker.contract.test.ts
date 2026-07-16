import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  it('validates inception dates and unit-ratio management fee configuration', () => {
    const validCreate = createTrackedPartnershipBodySchema.safeParse({
      entityId: fixture.entityIds[0],
      name: 'Configured fund',
      partnershipType: 'Private Equity',
      inceptionDate: '2023-08-03',
      managementFeeRate: '0.02000000',
    })
    expect(validCreate.success).toBe(true)

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
      totalCapitalContributions: null,
      totalDistributions: null,
      dpi: null,
      tvpi: null,
      irr: null,
      performanceStatus: { dpi: 'MISSING_CONTRIBUTIONS', tvpi: 'MISSING_CONTRIBUTIONS', irr: 'MISSING_CONTRIBUTIONS' },
    })
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
})
