import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { config } from '../src/config.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { pool } from '../src/infra/db/client.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { partnershipTrackerRepository } from '../src/modules/partnership-tracker/partnership-tracker.repository.js'
import { createPartnershipTrackerFixture, type PartnershipTrackerFixture } from './helpers/partnershipTrackerFixture.js'

describe('K1 Tracker route contracts without a configured database', () => {
  let fixture: TestFixture
  beforeEach(async () => { fixture = await createTestFixture() })
  afterEach(async () => { await fixture.app.close() })
  it('requires authentication before a tracker list is reached', async () => {
    const response = await fixture.app.inject({ method: 'GET', url: '/v1/k1-tracker/partnerships' })
    expect(response.statusCode).toBe(401)
  })
  const noDatabase = pool ? it.skip : it
  noDatabase('does not fall back to process memory for authenticated tracker reads', async () => {
    const response = await fixture.app.inject({ method: 'GET', url: '/v1/k1-tracker/partnerships', headers: { cookie: fixture.cookie } })
    expect(response.statusCode).toBe(503)
    expect(response.json().error).toBe('DATABASE_REQUIRED')
  })
})

const durable = pool ? describe : describe.skip
durable('K1 Tracker additive year-summary contract with PostgreSQL', () => {
  let fixture: PartnershipTrackerFixture
  let app: FastifyInstance
  let cookie: string
  const scope = { isAdmin: true, entityIds: [] as string[] }

  beforeEach(async () => {
    fixture = await createPartnershipTrackerFixture()
    cookie = `${config.sessionCookieName}=${authRepository.createSession(fixture.adminUserId).token}`
    app = buildApp()
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
    await fixture.cleanup()
  })

  it('serializes canonical/fallback contributions, absolute distributions, and null versus zero', async () => {
    const legacyYear = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2023, fixture.adminUserId, scope)
    await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2023, legacyYear.revision, [
      { fieldKey: 'section_l_capital_contributed', amount: '100.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'box_19_distributions', amount: '-10.00', sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)
    const canonicalYear = await partnershipTrackerRepository.createYear(fixture.partnershipId, 2024, fixture.adminUserId, scope)
    await partnershipTrackerRepository.updateYear(fixture.partnershipId, 2024, canonicalYear.revision, [
      { fieldKey: 'section_l_capital_contributed', amount: '250.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'capital_contributions', amount: '0.00', sourceType: 'MANUAL_ENTRY' },
      { fieldKey: 'box_19_distributions', amount: null, sourceType: 'MANUAL_ENTRY' },
    ], fixture.adminUserId, scope)

    const response = await app.inject({
      method: 'GET',
      url: `/v1/k1-tracker/partnerships/${fixture.partnershipId}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    const years = response.json().years as Array<{ taxYear: number; capitalContributed: string | null; distributions: string | null }>
    expect(years.find((year) => year.taxYear === 2023)).toMatchObject({ capitalContributed: '100.00', distributions: '10.00' })
    expect(years.find((year) => year.taxYear === 2024)).toMatchObject({ capitalContributed: '0.00', distributions: null })
  })
})
