import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import {
  partnershipTrackerDateSchema,
  partnershipTrackerMoneySchema,
  partnershipTrackerNonnegativeMoneySchema,
  partnershipTrackerTypeSchema,
} from '../src/modules/partnership-tracker/partnership-tracker.zod.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Partnership Tracker foundation', () => {
  it('accepts controlled partnership types and exact decimal strings', () => {
    expect(partnershipTrackerTypeSchema.parse('Real Estate')).toBe('Real Estate')
    expect(partnershipTrackerMoneySchema.parse('-12.30')).toBe('-12.30')
    expect(partnershipTrackerNonnegativeMoneySchema.parse('0.00')).toBe('0.00')
    expect(() => partnershipTrackerMoneySchema.parse('12.3')).toThrow()
    expect(() => partnershipTrackerNonnegativeMoneySchema.parse('-1.00')).toThrow()
    expect(partnershipTrackerDateSchema.parse('2025-02-28')).toBe('2025-02-28')
    expect(() => partnershipTrackerDateSchema.parse('2025-02-30')).toThrow()
  })

  it('uses a compatibility migration that adds IN_PROGRESS without deleting imports', async () => {
    const migration = await readFile(new URL('../src/infra/db/migrations/019_partnership_tracker.sql', import.meta.url), 'utf8')
    expect(migration).toContain("'IN_PROGRESS'")
    expect(migration).toContain("'IMPORTED'")
    expect(migration.toLowerCase()).not.toMatch(/delete\s+from\s+k1_tracker_(?:import|value)/)
  })
})

describe('Partnership Tracker route boundary', () => {
  let fixture: TestFixture
  beforeEach(async () => { fixture = await createTestFixture() })
  afterEach(async () => { await fixture.app.close() })

  it('requires authentication', async () => {
    const response = await fixture.app.inject({ method: 'GET', url: '/v1/partnership-tracker/partnerships' })
    expect(response.statusCode).toBe(401)
  })

  it('does not expose import or upload routes on the new prefix', async () => {
    const response = await fixture.app.inject({ method: 'POST', url: '/v1/partnership-tracker/imports/preview', headers: { cookie: fixture.cookie } })
    expect(response.statusCode).toBe(404)
  })

  const withoutDatabase = pool ? it.skip : it
  withoutDatabase('uses no in-memory fallback', async () => {
    const response = await fixture.app.inject({ method: 'GET', url: '/v1/partnership-tracker/partnerships', headers: { cookie: fixture.cookie } })
    expect(response.statusCode).toBe(503)
    expect(response.json().error).toBe('DATABASE_UNAVAILABLE')
  })
})
