import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'
import { stubExtractor } from '../src/modules/k1/extraction/stubExtractor.js'

// T038 — Contract: POST /v1/k1-documents/:id/reparse
// - Accepts only failed-parse rows (status PROCESSING with parseErrorCode set)
// - Clears parse_error_*, increments parse_attempts, returns 202
// - Emits k1.reparse_requested audit event
describe('POST /v1/k1-documents/:id/reparse — reparse contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
    vi.restoreAllMocks()
  })

  const findFailed = () => {
    const failed = k1Repository._debugSeedK1
      ? k1Repository._debugSeedK1({
          partnershipName: 'Apollo Investment Fund IX',
          status: 'PROCESSING',
          taxYear: 2022,
          uploaderUserId: f.admin.id,
          parseError: { code: 'PARSE_LOW_CONFIDENCE', message: 'seeded failure' },
        })
      : undefined
    return failed!
  }

  it('202 on a failed-parse row, clears parseError fields and increments parseAttempts', async () => {
    const failed = findFailed()
    const before = failed.parseAttempts

    // Prevent the follow-on pipeline from immediately mutating the state we're asserting on.
    vi.spyOn(stubExtractor, 'extract').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5000))
      return {
        outcome: 'SUCCESS',
        nextStatus: 'NEEDS_REVIEW',
        issues: [],
        fieldValues: [],
      }
    })

    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${failed.id}/reparse`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ k1DocumentId: failed.id, status: 'PROCESSING' })

    const event = auditRepository
      .getInMemoryEvents()
      .find((e) => e.eventName === 'k1.reparse_requested' && e.objectId === failed.id)
    expect(event).toBeDefined()
    expect(event!.actorUserId).toBe(f.admin.id)

    // runParsePipeline.beginParse fires synchronously on setImmediate; yield to the loop.
    await new Promise((r) => setImmediate(r))
    const reloaded = k1Repository.getK1Document(failed.id)!
    expect(reloaded.parseErrorCode).toBeNull()
    expect(reloaded.parseErrorMessage).toBeNull()
    expect(reloaded.parseAttempts).toBeGreaterThan(before)
  })

  it('409 NOT_RETRYABLE on a non-failed row (e.g. NEEDS_REVIEW)', async () => {
    const ok = k1Repository._debugSeedK1({
      partnershipName: 'Apollo Investment Fund IX',
      status: 'NEEDS_REVIEW',
      taxYear: 2022,
      uploaderUserId: f.admin.id,
    })
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${ok.id}/reparse`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('NOT_RETRYABLE')
  })

  it('404 on an unknown id', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${randomUUID()}/reparse`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
  })

  it('403 when the caller has no membership on the target entity', async () => {
    const failed = findFailed()
    k1Repository._debugSetMemberships(
      f.admin.id,
      f.entityIds.filter((id) => id !== failed.entityId),
    )
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${failed.id}/reparse`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ENTITY')
  })
})
