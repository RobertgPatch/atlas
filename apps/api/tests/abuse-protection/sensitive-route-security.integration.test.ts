import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '../../src/config.js'
import {
  admissionService,
  type AdmissionRequest,
} from '../../src/modules/abuse-protection/admission.service.js'
import { durableK1BatchRepository } from '../../src/modules/k1/k1.repository.js'
import { plaidApi } from '../../src/modules/plaid/plaid.client.js'
import { plaidHoldingsSync } from '../../src/modules/plaid/plaid.holdings-sync.js'
import { reportsExport } from '../../src/modules/reports/reports.export.js'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'

const allowed = (request: AdmissionRequest) => ({
  decision: 'allowed' as const,
  policyKey: request.policy.policyKey,
  requestId: request.requestId,
  reservations: [],
})

describe('sensitive and expensive route security', () => {
  let fixture: TestFixture
  let admitSpy: ReturnType<typeof vi.spyOn>
  let originalPlaidClientId: string
  let originalPlaidSecret: string

  beforeEach(async () => {
    originalPlaidClientId = config.plaid.clientId
    originalPlaidSecret = config.plaid.secret
    admitSpy = vi.spyOn(admissionService, 'admit').mockImplementation(async (request) =>
      allowed(request))
    fixture = await createTestFixture()
  })

  afterEach(async () => {
    Object.assign(config.plaid, {
      clientId: originalPlaidClientId,
      secret: originalPlaidSecret,
    })
    await fixture.app.close()
    vi.restoreAllMocks()
  })

  it.each([
    {
      routeClass: 'K1 upload',
      method: 'POST' as const,
      url: '/v1/k1-ingestion-batches',
      payload: {
        files: [{
          fileName: 'schedule-k1.pdf',
          sizeBytes: 1_024,
          sha256: 'a'.repeat(64),
        }],
      },
    },
    {
      routeClass: 'workbook import',
      method: 'POST' as const,
      url: '/v1/k1-tracker/imports/preview',
      payload: {},
    },
    {
      routeClass: 'external provider',
      method: 'POST' as const,
      url: '/v1/plaid/link-token',
      payload: { mode: 'create' },
    },
    {
      routeClass: 'report export',
      method: 'GET' as const,
      url: '/v1/reports/export?reportType=portfolio_summary&format=csv',
    },
  ])('rejects unauthenticated $routeClass requests before admission or work', async (request) => {
    const createBatch = vi.spyOn(durableK1BatchRepository, 'create')
    const plaidProvider = vi.spyOn(plaidApi, 'linkTokenCreate')
    const exportReport = vi.spyOn(reportsExport, 'generateReportExport')

    const response = await fixture.app.inject({
      method: request.method,
      url: request.url,
      ...(request.payload ? { payload: request.payload } : {}),
    })

    expect.soft(response.statusCode).toBe(401)
    expect.soft(response.json()).toMatchObject({ error: expect.any(String) })
    expect.soft(admitSpy).not.toHaveBeenCalled()
    expect.soft(createBatch).not.toHaveBeenCalled()
    expect.soft(plaidProvider).not.toHaveBeenCalled()
    expect.soft(exportReport).not.toHaveBeenCalled()
  })

  it('rejects wrong-role Admin and forced-provider requests before business work', async () => {
    const listControls = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/protection-controls',
      headers: { cookie: fixture.userCookie },
    })
    expect.soft(listControls.statusCode).toBe(403)
    expect.soft(listControls.json()).toMatchObject({ error: 'FORBIDDEN' })

    admitSpy.mockClear()
    const refresh = vi.spyOn(plaidHoldingsSync, 'syncSelectedHoldings')
    const forceRefresh = await fixture.app.inject({
      method: 'POST',
      url: '/v1/reports/consolidated-holdings/refresh',
      headers: { cookie: fixture.userCookie },
      payload: { force: true, reason: 'forced' },
    })

    expect.soft(forceRefresh.statusCode).toBe(403)
    expect.soft(forceRefresh.json()).toMatchObject({ error: 'FORBIDDEN_ROLE' })
    expect.soft(admitSpy).not.toHaveBeenCalled()
    expect.soft(refresh).not.toHaveBeenCalled()
  })

  it.each([
    ['DELETE', '/v1/plaid/link-token'],
    ['PATCH', '/v1/reports/export'],
    ['PUT', `/v1/k1-documents/${randomUUID()}/retry-extraction`],
  ] as const)('rejects invalid method %s before admission', async (method, url) => {
    const plaidProvider = vi.spyOn(plaidApi, 'linkTokenCreate')
    const response = await fixture.app.inject({
      method,
      url,
      headers: { cookie: fixture.cookie },
    })

    expect.soft(response.statusCode).toBe(404)
    expect.soft(admitSpy).not.toHaveBeenCalled()
    expect.soft(plaidProvider).not.toHaveBeenCalled()
  })

  it('rejects malformed K-1 and provider inputs before admission or persistence', async () => {
    const createBatch = vi.spyOn(durableK1BatchRepository, 'create')
    const exchange = vi.spyOn(plaidApi, 'itemPublicTokenExchange')
    const malformedBatch = await fixture.app.inject({
      method: 'POST',
      url: '/v1/k1-ingestion-batches',
      headers: { cookie: fixture.cookie },
      payload: {
        files: [{
          fileName: '../private.pdf',
          sizeBytes: -1,
          sha256: 'not-a-sha256',
          unexpected: true,
        }],
      },
    })
    const malformedExchange = await fixture.app.inject({
      method: 'POST',
      url: '/v1/plaid/exchange-public-token',
      headers: { cookie: fixture.cookie },
      payload: { publicToken: '', extra: 'attacker-controlled' },
    })

    expect.soft(malformedBatch.statusCode).toBe(400)
    expect.soft(malformedBatch.json()).toMatchObject({ error: 'VALIDATION_ERROR' })
    expect.soft(malformedExchange.statusCode).toBe(400)
    expect.soft(malformedExchange.json()).toMatchObject({ error: 'VALIDATION_ERROR' })
    expect.soft(admitSpy).not.toHaveBeenCalled()
    expect.soft(createBatch).not.toHaveBeenCalled()
    expect.soft(exchange).not.toHaveBeenCalled()
  })

  it('reuses a duplicate provider submission without a second provider call', async () => {
    Object.assign(config.plaid, {
      clientId: 'test-client-id',
      secret: 'test-secret',
    })
    const operationId = '00000000-0000-4000-8000-000000000074'
    admitSpy.mockReset()
    admitSpy
      .mockImplementationOnce(async (request: AdmissionRequest) => allowed(request))
      .mockImplementationOnce(async (request: AdmissionRequest) => ({
        decision: 'deduplicated',
        policyKey: request.policy.policyKey,
        requestId: request.requestId,
        operationId,
        operationState: 'succeeded',
        resultReference: 'plaid://link-token/existing',
      }))
    const provider = vi.spyOn(plaidApi, 'linkTokenCreate').mockResolvedValue({
      data: {
        link_token: 'link-test-token',
        expiration: '2026-08-25T12:30:00.000Z',
      },
    } as never)
    const request = {
      method: 'POST' as const,
      url: '/v1/plaid/link-token',
      headers: {
        cookie: fixture.cookie,
        'idempotency-key': 'same-client-key-000000000074',
      },
      payload: { mode: 'create' },
    }

    const first = await fixture.app.inject(request)
    const duplicate = await fixture.app.inject(request)

    expect.soft(first.statusCode).toBe(200)
    expect.soft(first.json()).toMatchObject({ linkToken: 'link-test-token' })
    expect.soft(duplicate.statusCode).toBe(200)
    expect.soft(duplicate.json()).toEqual({
      reused: true,
      operationId,
      operationState: 'succeeded',
      resultReference: 'plaid://link-token/existing',
    })
    expect.soft(provider).toHaveBeenCalledTimes(1)
    expect.soft(admitSpy).toHaveBeenCalledTimes(2)
    expect.soft(admitSpy.mock.calls.map(([call]) => call.policy.routeClass))
      .toEqual(['EXTERNAL_PROVIDER', 'EXTERNAL_PROVIDER'])
    expect.soft(admitSpy.mock.calls.map(([call]) => call.policy.killSwitch))
      .toEqual(['plaid_refresh', 'plaid_refresh'])
    expect.soft(
      admitSpy.mock.calls[0]?.[0].workload?.idempotency.canonicalRequest,
    ).toEqual(
      admitSpy.mock.calls[1]?.[0].workload?.idempotency.canonicalRequest,
    )
  })
})
