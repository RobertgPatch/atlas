import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  admissionService,
  type AdmissionRequest,
} from '../../src/modules/abuse-protection/admission.service.js'
import { durableK1BatchRepository } from '../../src/modules/k1/k1.repository.js'
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

  beforeEach(async () => {
    admitSpy = vi.spyOn(admissionService, 'admit').mockImplementation(async (request) =>
      allowed(request))
    fixture = await createTestFixture()
  })

  afterEach(async () => {
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
      routeClass: 'report export',
      method: 'GET' as const,
      url: '/v1/reports/export?reportType=portfolio_summary&format=csv',
    },
  ])('rejects unauthenticated $routeClass requests before admission or work', async (request) => {
    const createBatch = vi.spyOn(durableK1BatchRepository, 'create')
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
    const forceRefresh = await fixture.app.inject({
      method: 'POST',
      url: '/v1/reports/consolidated-holdings/refresh',
      headers: { cookie: fixture.userCookie },
      payload: { force: true, reason: 'forced' },
    })

    expect.soft(forceRefresh.statusCode).toBe(403)
    expect.soft(forceRefresh.json()).toMatchObject({ error: 'FORBIDDEN_ROLE' })
    expect.soft(admitSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['PATCH', '/v1/reports/export'],
    ['PUT', `/v1/k1-documents/${randomUUID()}/retry-extraction`],
  ] as const)('rejects invalid method %s before admission', async (method, url) => {
    const response = await fixture.app.inject({
      method,
      url,
      headers: { cookie: fixture.cookie },
    })

    expect.soft(response.statusCode).toBe(404)
    expect.soft(admitSpy).not.toHaveBeenCalled()
  })

  it('rejects malformed K-1 input before admission or persistence', async () => {
    const createBatch = vi.spyOn(durableK1BatchRepository, 'create')
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
    expect.soft(malformedBatch.statusCode).toBe(400)
    expect.soft(malformedBatch.json()).toMatchObject({ error: 'VALIDATION_ERROR' })
    expect.soft(admitSpy).not.toHaveBeenCalled()
    expect.soft(createBatch).not.toHaveBeenCalled()
  })
})
