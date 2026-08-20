import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool, withTransaction } from '../src/infra/db/client.js'
import { durableK1BatchRepository, durableK1Repository } from '../src/modules/k1/k1.repository.js'
import { k1ExtractionAttemptRepository } from '../src/modules/k1/extraction/k1ExtractionAttempt.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

const durable = pool ? describe : describe.skip

durable('K-1 durable batch queue', () => {
  let fixture: TestFixture
  let scopedEntityId: string
  let hiddenEntityId: string
  const batchIds: string[] = []

  const createBatch = async (entityId: string, status?: 'FAILED' | 'NEEDS_REVIEW' | 'APPLIED') => {
    const batchId = randomUUID()
    const itemId = randomUUID()
    batchIds.push(batchId)
    await durableK1BatchRepository.create({
      id: batchId, createdByUserId: fixture.admin.id, entityScopeId: entityId,
      items: [{ id: itemId, fileName: `${batchId}.pdf`, sizeBytes: 100, sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'), objectKey: `queue-tests/${batchId}/${itemId}.pdf` }],
    })
    if (status) {
      await withTransaction(async (client) => {
        await durableK1BatchRepository.transitionItem(client, itemId, { from: ['PENDING_UPLOAD'], to: status })
      })
    }
    return { batchId, itemId }
  }

  beforeEach(async () => {
    fixture = await createTestFixture()
    scopedEntityId = randomUUID()
    hiddenEntityId = randomUUID()
    await pool!.query(
      `insert into entities (id, name, entity_type, status) values
        ($1, $3, 'TRUST', 'ACTIVE'), ($2, $4, 'TRUST', 'ACTIVE')`,
      [scopedEntityId, hiddenEntityId, `Queue scoped ${scopedEntityId}`, `Queue hidden ${hiddenEntityId}`],
    )
    await pool!.query(
      `insert into entity_memberships (id, entity_id, user_id, created_by)
       values ($1, $2, $3, $4)`,
      [randomUUID(), scopedEntityId, fixture.user.id, fixture.admin.id],
    )
  })

  afterEach(async () => {
    await fixture.app.close()
    const rows = await pool!.query<{ document_id: string | null; k1_document_id: string | null }>(
      'select document_id, k1_document_id from k1_ingestion_items where batch_id = any($1::uuid[])', [batchIds],
    )
    const documentIds = rows.rows.flatMap((row) => row.document_id ? [row.document_id] : [])
    const k1DocumentIds = rows.rows.flatMap((row) => row.k1_document_id ? [row.k1_document_id] : [])
    if (k1DocumentIds.length) {
      await pool!.query(`delete from k1_local_queue_messages where payload->>'k1DocumentId' = any($1::text[])`, [k1DocumentIds])
      await pool!.query('delete from k1_extraction_attempts where k1_document_id = any($1::uuid[])', [k1DocumentIds])
    }
    await pool!.query('delete from k1_ingestion_items where batch_id = any($1::uuid[])', [batchIds])
    if (k1DocumentIds.length) await pool!.query('delete from k1_documents where id = any($1::uuid[])', [k1DocumentIds])
    if (documentIds.length) await pool!.query('delete from documents where id = any($1::uuid[])', [documentIds])
    await pool!.query('delete from k1_ingestion_batches where id = any($1::uuid[])', [batchIds])
    await pool!.query('delete from entity_memberships where entity_id = any($1::uuid[])', [[scopedEntityId, hiddenEntityId]])
    await pool!.query('delete from entities where id = any($1::uuid[])', [[scopedEntityId, hiddenEntityId]])
    batchIds.length = 0
  })

  it('filters and paginates within entity scope and preserves state across API restart', async () => {
    await createBatch(scopedEntityId)
    await createBatch(scopedEntityId, 'FAILED')
    await createBatch(hiddenEntityId, 'NEEDS_REVIEW')

    const first = await fixture.app.inject({
      method: 'GET', url: `/v1/k1-ingestion-batches?limit=1&entity_id=${scopedEntityId}`, headers: { cookie: fixture.userCookie },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ counts: { total: 2, active: 1, attentionRequired: 1 } })
    expect(first.json().items).toHaveLength(1)
    expect(first.json().nextCursor).toBeTruthy()
    const second = await fixture.app.inject({
      method: 'GET', url: `/v1/k1-ingestion-batches?limit=1&entity_id=${scopedEntityId}&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie: fixture.userCookie },
    })
    expect(second.statusCode).toBe(200)
    expect(second.json().items).toHaveLength(1)
    expect(second.json().items[0].id).not.toBe(first.json().items[0].id)

    const attention = await fixture.app.inject({
      method: 'GET', url: `/v1/k1-ingestion-batches?attention_only=true&entity_id=${scopedEntityId}`, headers: { cookie: fixture.userCookie },
    })
    expect(attention.json().items).toHaveLength(1)
    expect(attention.json().items[0].status).toBe('PARTIAL_FAILURE')

    await fixture.app.close()
    fixture = await createTestFixture()
    const afterRestart = await fixture.app.inject({
      method: 'GET', url: `/v1/k1-ingestion-batches?entity_id=${scopedEntityId}`, headers: { cookie: fixture.userCookie },
    })
    expect(afterRestart.json().counts.total).toBe(2)
  })

  it('returns PII-safe immutable attempt history and retry eligibility', async () => {
    const seeded = await createBatch(scopedEntityId, 'FAILED')
    const documentId = randomUUID()
    const k1DocumentId = randomUUID()
    await durableK1Repository.createAccepted({
      documentId, k1DocumentId, ingestionItemId: seeded.itemId, fileName: 'retry.pdf', storagePath: 'queue-tests/retry.pdf',
      storageBucket: null, storageVersionId: null, mimeType: 'application/pdf', sizeBytes: 100,
      sha256: 'f'.repeat(64), pageCount: 2, uploadedBy: fixture.admin.id,
    })
    const attempt = await k1ExtractionAttemptRepository.createOrGet({
      k1DocumentId, requestedAttemptNumber: 1, provider: 'AWS_BDA', mappingSchemaVersion: 'v1',
    })
    await k1ExtractionAttemptRepository.markFailed({
      attemptId: attempt.id, errorCode: 'THROTTLED', errorSummary: 'TIN 123-45-6789 at 1 Main Street',
    })

    const response = await fixture.app.inject({
      method: 'GET', url: `/v1/k1-ingestion-items/${seeded.itemId}/attempts`, headers: { cookie: fixture.userCookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).not.toContain('123-45-6789')
    expect(response.body).not.toContain('Main Street')
    expect(response.json().attempts[0]).toMatchObject({
      attemptNumber: 1, provider: 'AWS_BDA', status: 'FAILED', active: false,
      error: { code: 'EXTRACTION_FAILED', retryable: true },
    })
    const batch = await fixture.app.inject({
      method: 'GET', url: `/v1/k1-ingestion-batches/${seeded.batchId}`, headers: { cookie: fixture.userCookie },
    })
    expect(batch.json().items[0]).toMatchObject({ canRetry: true, canDelete: true, documentVersion: 0 })
  })

  it('cancels eligible items atomically, recomputes the batch, and protects terminal items', async () => {
    const cancellable = await createBatch(scopedEntityId)
    const cancelled = await fixture.app.inject({
      method: 'POST', url: `/v1/k1-ingestion-items/${cancellable.itemId}/cancel`, headers: { cookie: fixture.userCookie },
    })
    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.json()).toMatchObject({ status: 'CANCELLED', canCancel: false, canDelete: true })
    const batch = await durableK1BatchRepository.getById(cancellable.batchId)
    expect(batch).toMatchObject({ status: 'CANCELLED', counts: { active: 0 } })
    const repeated = await fixture.app.inject({
      method: 'POST', url: `/v1/k1-ingestion-items/${cancellable.itemId}/cancel`, headers: { cookie: fixture.userCookie },
    })
    expect(repeated.statusCode).toBe(409)

    const deleted = await fixture.app.inject({
      method: 'DELETE', url: `/v1/k1-ingestion-items/${cancellable.itemId}`, headers: { cookie: fixture.userCookie },
    })
    expect(deleted.statusCode).toBe(204)
    expect(await durableK1BatchRepository.getById(cancellable.batchId)).toBeNull()

    const applied = await createBatch(scopedEntityId, 'APPLIED')
    const protectedResponse = await fixture.app.inject({
      method: 'POST', url: `/v1/k1-ingestion-items/${applied.itemId}/cancel`, headers: { cookie: fixture.userCookie },
    })
    expect(protectedResponse.statusCode).toBe(409)
    const protectedDelete = await fixture.app.inject({
      method: 'DELETE', url: `/v1/k1-ingestion-items/${applied.itemId}`, headers: { cookie: fixture.userCookie },
    })
    expect(protectedDelete.statusCode).toBe(409)
    expect((await durableK1BatchRepository.getById(applied.batchId))?.items[0]?.status).toBe('APPLIED')
  })
})
