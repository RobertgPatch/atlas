import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { buildMultipart, fakePdfBytes } from './helpers/multipart.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'

// T036 — Integration: replace-upload supersession transaction
// After a duplicate upload with replaceDocumentId:
// - prior row's supersededByDocumentId is set
// - document_versions row is inserted
// - k1.superseded audit event is written
describe('replace-upload supersession (FR-021, Data-Model §3.4)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('all four effects commit together on Replace', async () => {
    const partnership = f.partnerships.find((p) => p.name === 'Sequoia Heritage Fund')!
    const entity = f.entities.find((e) => e.id === partnership.entityId)!
    const taxYear = 2023

    // First upload
    const first = buildMultipart(
      [
        { name: 'partnershipId', value: partnership.id },
        { name: 'entityId', value: entity.id },
        { name: 'taxYear', value: String(taxYear) },
      ],
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
    const originalDocumentId: string = a.json().documentId

    // Replace
    const second = buildMultipart(
      [
        { name: 'partnershipId', value: partnership.id },
        { name: 'entityId', value: entity.id },
        { name: 'taxYear', value: String(taxYear) },
        { name: 'replaceDocumentId', value: originalDocumentId },
      ],
      [{ name: 'file', filename: 'replacement.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const b = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': second.contentType },
      payload: second.body,
    })
    expect(b.statusCode).toBe(201)
    const replacementDocumentId: string = b.json().documentId

    // Effect 1: prior k1_documents.supersededByDocumentId is set
    const original = k1Repository.getK1Document(originalK1Id)
    expect(original?.supersededByDocumentId).toBe(replacementDocumentId)

    // Effect 2: document_versions row inserted pointing orig → replacement
    const versions = k1Repository._debugListDocumentVersions()
    const match = versions.find(
      (v) =>
        v.originalDocumentId === originalDocumentId &&
        v.supersededById === replacementDocumentId,
    )
    expect(match).toBeDefined()
    expect(match!.partnershipId).toBe(partnership.id)
    expect(match!.entityId).toBe(entity.id)
    expect(match!.taxYear).toBe(taxYear)
    expect(match!.supersededByUserId).toBe(f.admin.id)

    // Effect 3: k1.superseded audit event written against the original k1 id
    const superseded = auditRepository
      .getInMemoryEvents()
      .find((e) => e.eventName === 'k1.superseded' && e.objectId === originalK1Id)
    expect(superseded).toBeDefined()
    expect(superseded!.actorUserId).toBe(f.admin.id)

    // Effect 4: default listing hides the superseded row
    const list = await f.app.inject({
      method: 'GET',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie },
    })
    const ids: string[] = (list.json().items as Array<{ id: string }>).map((i) => i.id)
    expect(ids).not.toContain(originalK1Id)
  })

  it('rejects replaceDocumentId that does not match the duplicate', async () => {
    const partnership = f.partnerships.find((p) => p.name === 'Sequoia Heritage Fund')!
    const entity = f.entities.find((e) => e.id === partnership.entityId)!
    const taxYear = 2023

    // Plant an initial upload
    const first = buildMultipart(
      [
        { name: 'partnershipId', value: partnership.id },
        { name: 'entityId', value: entity.id },
        { name: 'taxYear', value: String(taxYear) },
      ],
      [{ name: 'file', filename: 'a.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': first.contentType },
      payload: first.body,
    })

    // Attempt replace with a wrong documentId
    const { body, contentType } = buildMultipart(
      [
        { name: 'partnershipId', value: partnership.id },
        { name: 'entityId', value: entity.id },
        { name: 'taxYear', value: String(taxYear) },
        { name: 'replaceDocumentId', value: '00000000-0000-0000-0000-000000000000' },
      ],
      [{ name: 'file', filename: 'b.pdf', contentType: 'application/pdf', data: fakePdfBytes() }],
    )
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/k1-documents',
      headers: { cookie: f.cookie, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('REPLACE_DOCUMENT_MISMATCH')
  })
})
