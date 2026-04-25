import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { buildMultipart, fakePdfBytes } from './helpers/multipart.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'
import { setExtractorForTests } from '../src/modules/k1/extraction/index.js'
import { stubExtractor } from '../src/modules/k1/extraction/stubExtractor.js'

// T037 — Integration: extraction lifecycle
// Upload → status transitions UPLOADED → PROCESSING → NEEDS_REVIEW | READY_FOR_APPROVAL.
// Failure path leaves status PROCESSING with parse_error_code populated and emits k1.parse_failed.
describe('extraction pipeline lifecycle (FR-019, FR-024)', () => {
  let f: TestFixture

  beforeEach(async () => {
    setExtractorForTests(stubExtractor)
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
    setExtractorForTests(undefined)
    vi.restoreAllMocks()
  })

  const uploadOne = async () => {
    const entity = f.entities.find((e) => e.name === 'Whitfield Holdings LLC')!
    const { body, contentType } = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [
        {
          name: 'file',
          filename: 'k.pdf',
          contentType: 'application/pdf',
          data: fakePdfBytes(2048),
        },
      ],
    )
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(201)
    return res.json().k1DocumentId as string
  }

  it('happy path: status lands in NEEDS_REVIEW or READY_FOR_APPROVAL and emits k1.parse_completed', async () => {
    const id = await uploadOne()
    expect(k1Repository.getK1Document(id)?.processingStatus).toBe('UPLOADED')

    // Wait longer than the stub extractor's 400 ms synthetic delay.
    await new Promise((r) => setTimeout(r, 900))

    const after = k1Repository.getK1Document(id)!
    expect(['NEEDS_REVIEW', 'READY_FOR_APPROVAL']).toContain(after.processingStatus)
    expect(after.parseErrorCode).toBeNull()
    expect(after.partnershipId).toBeTruthy()
    expect(after.taxYear).not.toBeNull()

    const completed = auditRepository
      .getInMemoryEvents()
      .find((e) => e.eventName === 'k1.parse_completed' && e.objectId === id)
    expect(completed).toBeDefined()
  })

  it('failure path: status remains PROCESSING with parseErrorCode and emits k1.parse_failed', async () => {
    vi.spyOn(stubExtractor, 'extract').mockResolvedValue({
      outcome: 'FAILURE',
      errorCode: 'PARSE_UNIT_TEST',
      errorMessage: 'Injected failure for unit test.',
    })

    const id = await uploadOne()
    await new Promise((r) => setTimeout(r, 900))

    const after = k1Repository.getK1Document(id)!
    expect(after.processingStatus).toBe('PROCESSING')
    expect(after.parseErrorCode).toBe('PARSE_UNIT_TEST')
    expect(after.parseAttempts).toBeGreaterThanOrEqual(1)

    const failed = auditRepository
      .getInMemoryEvents()
      .find((e) => e.eventName === 'k1.parse_failed' && e.objectId === id)
    expect(failed).toBeDefined()
    expect(failed!.after).toEqual({
      code: 'PARSE_UNIT_TEST',
      message: 'Injected failure for unit test.',
    })
  })
})
