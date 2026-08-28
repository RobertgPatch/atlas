import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TestFixture } from '../helpers/testApp.js'

const CONTROL_KEYS = [
  'k1_uploads',
  'k1_extraction',
  'k1_bedrock_checkbox',
  'plaid_refresh',
  'market_data_refresh',
  'report_exports',
  'backfills',
] as const

const ENABLED_ENVIRONMENT = {
  K1_UPLOADS_ENABLED: 'true',
  K1_EXTRACTION_ENABLED: 'true',
  K1_BEDROCK_CHECKBOX_ENABLED: 'true',
  PLAID_REFRESH_ENABLED: 'true',
  MARKET_DATA_REFRESH_ENABLED: 'true',
  REPORT_EXPORTS_ENABLED: 'true',
  BACKFILLS_ENABLED: 'true',
} as const

describe('Admin protection-control contract', () => {
  let fixture: TestFixture | undefined
  let auditEvents: () => Array<{
    actorUserId?: string
    eventName: string
    objectType: string
    objectId?: string
    after?: unknown
  }>

  beforeEach(async () => {
    for (const [name, value] of Object.entries(ENABLED_ENVIRONMENT)) {
      vi.stubEnv(name, value)
    }
    vi.resetModules()

    const [
      { createTestFixture },
      { auditRepository },
      { protectionOverrideRepository },
      { admissionService },
    ] = await Promise.all([
      import('../helpers/testApp.js'),
      import('../../src/modules/audit/audit.repository.js'),
      import('../../src/modules/abuse-protection/protectionOverride.repository.js'),
      import('../../src/modules/abuse-protection/admission.service.js'),
    ])

    let sequence = 0
    const overrides: Array<{
      overrideId: string
      controlKey: string
      scopeKind: 'workload'
      scopeHash: Buffer
      mode: 'disable' | 'lower_limit' | 'temporary_allow'
      value: Readonly<Record<string, string | number | boolean>>
      reason: string
      ticketReference: string | null
      createdByUserId: string
      createdAt: Date
      expiresAt: Date | null
      revokedAt: Date | null
      revokedByUserId: string | null
    }> = []
    vi.spyOn(protectionOverrideRepository, 'list').mockImplementation(async (now) =>
      overrides
        .filter((record) =>
          record.revokedAt === null
          && (record.expiresAt === null || record.expiresAt > now))
        .sort((left, right) =>
          left.controlKey.localeCompare(right.controlKey)
          || right.createdAt.getTime() - left.createdAt.getTime()))
    vi.spyOn(protectionOverrideRepository, 'replace').mockImplementation(async (input) => {
      const now = input.now ?? new Date()
      for (const record of overrides) {
        if (record.controlKey === input.controlKey && record.revokedAt === null) {
          record.revokedAt = now
          record.revokedByUserId = input.createdByUserId
        }
      }
      sequence += 1
      const record = {
        overrideId: `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`,
        controlKey: input.controlKey,
        scopeKind: 'workload' as const,
        scopeHash: Buffer.from(input.scopeHash ?? []),
        mode: input.mode,
        value: input.value,
        reason: input.reason,
        ticketReference: input.ticketReference ?? null,
        createdByUserId: input.createdByUserId,
        createdAt: now,
        expiresAt: input.expiresAt ?? null,
        revokedAt: null,
        revokedByUserId: null,
      }
      overrides.push(record)
      return record
    })
    vi.spyOn(protectionOverrideRepository, 'revoke').mockImplementation(
      async (controlKey, revokedByUserId, now = new Date()) => {
        const record = [...overrides].reverse().find((candidate) =>
          candidate.controlKey === controlKey
          && candidate.revokedAt === null
          && (candidate.expiresAt === null || candidate.expiresAt > now))
        if (!record) return null
        record.revokedAt = now
        record.revokedByUserId = revokedByUserId
        return record
      },
    )
    vi.spyOn(admissionService, 'admit').mockImplementation(async (request) => ({
      decision: 'allowed',
      policyKey: request.policy.policyKey,
      requestId: request.requestId,
      reservations: [],
    }))
    vi.spyOn(auditRepository, 'record').mockImplementation(async (input) => {
      auditRepository.getInMemoryEvents().push({ ...input, createdAt: new Date() })
    })

    fixture = await createTestFixture()
    auditEvents = () => auditRepository.getInMemoryEvents()
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    await fixture?.app.close()
    vi.restoreAllMocks()
  })

  it('requires an Admin session to list every independent workload control', async () => {
    const unauthenticated = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/protection-controls',
    })
    const ordinaryUser = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/protection-controls',
      headers: { cookie: fixture.userCookie },
    })
    const admin = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/protection-controls',
      headers: { cookie: fixture.cookie },
    })

    expect.soft(unauthenticated.statusCode).toBe(401)
    expect.soft(ordinaryUser.statusCode).toBe(403)
    expect.soft(admin.statusCode).toBe(200)
    expect.soft(admin.json().controls).toEqual(
      expect.arrayContaining(
        CONTROL_KEYS.map((controlKey) => expect.objectContaining({
          controlKey,
          enabled: expect.any(Boolean),
          source: expect.stringMatching(
            /^(environment_hard_disable|configured_default|runtime_override)$/,
          ),
          effectiveAt: expect.any(String),
        })),
      ),
    )
  })

  it.each(['PUT', 'DELETE'] as const)(
    'requires an Admin session to %s a protection control',
    async (method) => {
      const request = {
        method,
        url: '/v1/admin/protection-controls/report_exports',
        payload: method === 'PUT'
          ? { mode: 'disable', reason: 'Contain report export cost during incident.' }
          : undefined,
      }
      const unauthenticated = await fixture.app.inject(request)
      const ordinaryUser = await fixture.app.inject({
        ...request,
        headers: { cookie: fixture.userCookie },
      })

      expect.soft(unauthenticated.statusCode).toBe(401)
      expect.soft(ordinaryUser.statusCode).toBe(403)
      expect.soft(auditEvents()).toHaveLength(0)
    },
  )

  it('sets and revokes an override with immutable actor/reason audit evidence', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString()
    const setResponse = await fixture.app.inject({
      method: 'PUT',
      url: '/v1/admin/protection-controls/report_exports',
      headers: { cookie: fixture.cookie },
      payload: {
        mode: 'disable',
        reason: 'Contain report export cost during incident 027.',
        ticketReference: 'INC-027',
        expiresAt,
      },
    })

    expect.soft(setResponse.statusCode).toBe(200)
    expect.soft(setResponse.json()).toMatchObject({
      controlKey: 'report_exports',
      enabled: false,
      source: 'runtime_override',
      mode: 'disable',
      reason: 'Contain report export cost during incident 027.',
      actorUserId: fixture.admin.id,
      expiresAt,
    })
    const setAudit = auditEvents().find((event) =>
      event.actorUserId === fixture.admin.id
      && event.objectType === 'protection_control'
      && event.objectId === 'report_exports'
      && /override.*(set|creat)/i.test(event.eventName))
    expect.soft(setAudit).toBeDefined()
    expect.soft(setAudit?.after).toMatchObject({
      mode: 'disable',
      reason: 'Contain report export cost during incident 027.',
    })

    const revokeResponse = await fixture.app.inject({
      method: 'DELETE',
      url: '/v1/admin/protection-controls/report_exports',
      headers: { cookie: fixture.cookie },
    })

    expect.soft(revokeResponse.statusCode).toBe(204)
    expect.soft(revokeResponse.body).toBe('')
    expect.soft(auditEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorUserId: fixture.admin.id,
        objectType: 'protection_control',
        objectId: 'report_exports',
        eventName: expect.stringMatching(/override.*revok/i),
      }),
    ]))
  })

  it('expires an override at read time even before retention cleanup', async () => {
    const expiresAt = new Date(Date.now() + 2_000).toISOString()

    const setResponse = await fixture.app.inject({
      method: 'PUT',
      url: '/v1/admin/protection-controls/market_data_refresh',
      headers: { cookie: fixture.cookie },
      payload: {
        mode: 'disable',
        reason: 'Pause market refresh until the incident window closes.',
        expiresAt,
      },
    })
    expect.soft(setResponse.statusCode).toBe(200)
    expect.soft(setResponse.json()).toMatchObject({
      enabled: false,
      source: 'runtime_override',
    })

    await new Promise((resolve) => setTimeout(resolve, 2_100))
    const listResponse = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/protection-controls',
      headers: { cookie: fixture.cookie },
    })
    const control = listResponse.json().controls?.find(
      (candidate: { controlKey?: string }) =>
        candidate.controlKey === 'market_data_refresh',
    )

    expect.soft(listResponse.statusCode).toBe(200)
    expect.soft(control).toMatchObject({
      controlKey: 'market_data_refresh',
      enabled: true,
      source: 'configured_default',
    })
    expect.soft(control).not.toHaveProperty('expiresAt')
  })

  it('rejects invalid or unbounded overrides without creating audit growth', async () => {
    const noExpiry = await fixture.app.inject({
      method: 'PUT',
      url: '/v1/admin/protection-controls/plaid_refresh',
      headers: { cookie: fixture.cookie },
      payload: {
        mode: 'temporary_allow',
        reason: 'Temporarily restore a reviewed Plaid refresh window.',
      },
    })
    const shortReason = await fixture.app.inject({
      method: 'PUT',
      url: '/v1/admin/protection-controls/plaid_refresh',
      headers: { cookie: fixture.cookie },
      payload: { mode: 'disable', reason: 'too short' },
    })

    expect.soft(noExpiry.statusCode).toBe(409)
    expect.soft(shortReason.statusCode).toBe(400)
    expect.soft(auditEvents()).toHaveLength(0)
  })

  it('returns an override conflict when a temporary allow exceeds the emergency ceiling', async () => {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1_000).toISOString()
    const response = await fixture.app.inject({
      method: 'PUT',
      url: '/v1/admin/protection-controls/plaid_refresh',
      headers: { cookie: fixture.cookie },
      payload: {
        mode: 'temporary_allow',
        value: { globalDailyLimit: Number.MAX_SAFE_INTEGER },
        reason: 'Attempt to exceed the reviewed emergency ceiling.',
        ticketReference: 'BREAKGLASS-INC-027',
        expiresAt,
      },
    })

    expect.soft(response.statusCode).toBe(409)
    expect.soft(response.json()).toMatchObject({ error: 'OVERRIDE_CONFLICT' })
    expect.soft(auditEvents()).toHaveLength(0)
  })
})
