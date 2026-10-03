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

  it('filters mixed batches and counts by partnership before paginating', async () => {
    const firstPartnership = randomUUID()
    const secondPartnership = randomUUID()
    await pool!.query(`insert into partnerships (id, entity_id, name, status) values ($1, $3, 'Queue Alpha', 'ACTIVE'), ($2, $3, 'Queue Beta', 'ACTIVE')`, [firstPartnership, secondPartnership, scopedEntityId])
    try {
      const first = await createBatch(scopedEntityId, 'APPLIED')
      const other = await createBatch(scopedEntityId, 'NEEDS_REVIEW')
      const older = await createBatch(scopedEntityId, 'APPLIED')
      await pool!.query('update k1_ingestion_items set batch_id = $1, sequence_number = 1 where id = $2', [first.batchId, other.itemId])
      await withTransaction((client) => durableK1BatchRepository.recomputeBatch(client, first.batchId))
      for (const [item, partnershipId] of [[first, firstPartnership], [other, secondPartnership], [older, firstPartnership]] as const) {
        await durableK1Repository.createAccepted({ documentId: randomUUID(), k1DocumentId: randomUUID(), ingestionItemId: item.itemId,
          partnershipId, taxYear: 2025, fileName: `${partnershipId}.pdf`, storagePath: `queue-tests/${item.itemId}.pdf`,
          mimeType: 'application/pdf', sizeBytes: 100, sha256: item.itemId.replaceAll('-', '').padEnd(64, '0'), pageCount: 1, uploadedBy: fixture.admin.id })
      }
      const url = `/v1/k1-ingestion-batches?partnership_ids=${firstPartnership}&limit=1&status=COMPLETED`
      const response = await fixture.app.inject({ method: 'GET', url, headers: { cookie: fixture.userCookie } })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().counts).toEqual({ total: 2, active: 0, attentionRequired: 0, completed: 2, cancelled: 0 })
      expect(response.json().nextCursor).toBeTruthy()
      const next = await fixture.app.inject({ method: 'GET', url: `${url}&cursor=${encodeURIComponent(response.json().nextCursor)}`, headers: { cookie: fixture.userCookie } })
      const batches = [...response.json().items, ...next.json().items]
      expect(batches).toHaveLength(2)
      for (const batch of batches) {
        expect(batch.items).toHaveLength(1)
        expect(batch.items[0].partnershipId).toBe(firstPartnership)
        expect(batch.status).toBe('COMPLETED')
        expect(batch.counts).toEqual({ total: 1, active: 0, actionRequired: 0, failed: 0, applied: 1 })
      }
      expect(next.json().nextCursor).toBeNull()
      const attention = await fixture.app.inject({ method: 'GET', url: `/v1/k1-ingestion-batches?partnership_ids=${firstPartnership}&attention_only=true`, headers: { cookie: fixture.userCookie } })
      expect(attention.json()).toMatchObject({ items: [], counts: { total: 0, attentionRequired: 0 } })
      const otherAttention = await fixture.app.inject({ method: 'GET', url: `/v1/k1-ingestion-batches?partnership_ids=${secondPartnership}&attention_only=true`, headers: { cookie: fixture.userCookie } })
      expect(otherAttention.json()).toMatchObject({ items: [{ id: first.batchId, status: 'ACTION_REQUIRED', counts: { total: 1, actionRequired: 1 } }], counts: { total: 1, attentionRequired: 1 } })
      const combined = await fixture.app.inject({ method: 'GET', url: `/v1/k1-ingestion-batches?partnership_ids=${firstPartnership},${secondPartnership}`, headers: { cookie: fixture.userCookie } })
      expect(combined.json().counts).toEqual({ total: 2, active: 0, attentionRequired: 1, completed: 1, cancelled: 0 })
      expect(await durableK1BatchRepository.getById(first.batchId)).toMatchObject({ status: 'ACTION_REQUIRED', counts: { total: 2 } })

      // A processing item outside the selected partnership must not suppress
      // selected failures, review work, or cancellation in filters or totals.
      await withTransaction((client) => durableK1BatchRepository.transitionItem(client, other.itemId, { to: 'PROCESSING' }))
      for (const [itemStatus, batchStatus, active, attentionRequired, cancelled] of [
        ['PENDING_UPLOAD', 'OPEN', 1, 0, 0],
        ['PROCESSING', 'PROCESSING', 1, 0, 0],
        ['NEEDS_MATCH', 'ACTION_REQUIRED', 0, 1, 0],
        ['FAILED', 'PARTIAL_FAILURE', 0, 1, 0],
        ['CANCELLED', 'CANCELLED', 0, 0, 1],
      ] as const) {
        await withTransaction((client) => durableK1BatchRepository.transitionItem(client, first.itemId, { to: itemStatus }))
        const scoped = await fixture.app.inject({
          method: 'GET',
          url: `/v1/k1-ingestion-batches?partnership_ids=${firstPartnership}&status=${batchStatus}&attention_only=${Boolean(attentionRequired)}`,
          headers: { cookie: fixture.userCookie },
        })
        expect(scoped.statusCode, scoped.body).toBe(200)
        expect(scoped.json()).toMatchObject({
          items: [{ id: first.batchId, status: batchStatus, items: [{ id: first.itemId, status: itemStatus }] }],
          counts: { total: 1, active, attentionRequired, completed: 0, cancelled },
          nextCursor: null,
        })
        expect(scoped.json().items).toHaveLength(1)
        expect(scoped.json().items[0].items).toHaveLength(1)
        expect(await durableK1BatchRepository.getById(first.batchId)).toMatchObject({ status: 'PROCESSING', counts: { total: 2 } })
      }
    } finally {
      await pool!.query('update k1_documents set partnership_id = null where partnership_id = any($1::uuid[])', [[firstPartnership, secondPartnership]])
      await pool!.query('delete from partnerships where id = any($1::uuid[])', [[firstPartnership, secondPartnership]])
    }
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
    expect(repeated.statusCode, repeated.body).toBe(409)

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
