import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { buildMultipart, fakePdfBytes } from './helpers/multipart.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'
import { reviewRepository } from '../src/modules/review/review.repository.js'
import { setExtractorForTests } from '../src/modules/k1/extraction/index.js'
import { stubExtractor } from '../src/modules/k1/extraction/stubExtractor.js'

// T036 — Integration: duplicate detection during async parse
// After a duplicate upload resolves to the same (entity, partnership, taxYear):
// - upload is still accepted
// - parser opens a DUPLICATE_K1 issue on the later document
describe('async duplicate detection during parse', () => {
  let f: TestFixture

  beforeEach(async () => {
    setExtractorForTests(stubExtractor)
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
    setExtractorForTests(undefined)
  })

  it('creates a duplicate issue on the later document instead of rejecting upload', async () => {
    const entity = f.entities.find((e) => e.name === 'Whitfield Holdings LLC')!

    const first = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [{ name: 'file', filename: 'orig.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const a = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': first.contentType },
      payload: first.body,
    })
    expect(a.statusCode).toBe(201)
    const originalK1Id: string = a.json().k1DocumentId

    const second = buildMultipart(
      [{ name: 'entityId', value: entity.id }],
      [{ name: 'file', filename: 'replacement.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const b = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': second.contentType },
      payload: second.body,
    })
    expect(b.statusCode).toBe(201)
    const duplicateK1Id: string = b.json().k1DocumentId

    await new Promise((r) => setTimeout(r, 900))

    const original = k1Repository.getK1Document(originalK1Id)
    const duplicate = k1Repository.getK1Document(duplicateK1Id)
    expect(original?.supersededByDocumentId).toBeNull()
    expect(duplicate?.processingStatus).toBe('NEEDS_REVIEW')

    const duplicateIssue = k1Repository
      .listIssuesForK1(duplicateK1Id)
      .find((issue) => issue.issueType === 'DUPLICATE_K1')
    expect(duplicateIssue).toBeDefined()

    const parseCompleted = auditRepository
      .getInMemoryEvents()
      .find((event) => event.eventName === 'k1.parse_completed' && event.objectId === duplicateK1Id)
    expect(parseCompleted).toBeDefined()

    expect(reviewRepository.getReportedDistribution(duplicateK1Id)).toBeDefined()
  })
})
