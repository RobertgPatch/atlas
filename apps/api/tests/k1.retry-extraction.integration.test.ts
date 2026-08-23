import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { config } from '../src/config.js'
import { pool, withTransaction } from '../src/infra/db/client.js'
import {
  k1ExtractionAttemptRepository,
} from '../src/modules/k1/extraction/k1ExtractionAttempt.repository.js'
import { retryK1Extraction } from '../src/modules/k1/extraction/k1Retry.service.js'
import { durableK1BatchRepository, durableK1Repository } from '../src/modules/k1/k1.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

const durable = pool ? describe : describe.skip

durable('K-1 extraction retry', () => {
  let fixture: TestFixture
  let entityId: string
  let batchId: string
  let itemId: string
  let documentId: string
  let k1DocumentId: string

  beforeEach(async () => {
    fixture = await createTestFixture()
    entityId = randomUUID()
    batchId = randomUUID()
    itemId = randomUUID()
    documentId = randomUUID()
    k1DocumentId = randomUUID()
    await pool!.query(
      `insert into entities (id, name, entity_type, status) values ($1, $2, 'TRUST', 'ACTIVE')`,
      [entityId, `Retry Entity ${entityId}`],
    )
    await durableK1BatchRepository.create({
      id: batchId,
      createdByUserId: fixture.admin.id,
      entityScopeId: entityId,
      items: [{
        id: itemId, fileName: 'retry.pdf', sizeBytes: 200,
        sha256: 'b'.repeat(64), objectKey: `originals/${k1DocumentId}.pdf`,
      }],
    })
    await durableK1Repository.createAccepted({
      documentId, k1DocumentId, ingestionItemId: itemId,
      storagePath: `originals/${k1DocumentId}.pdf`, storageBucket: 'atlas-test-private',
      storageVersionId: 'immutable-version-1', fileName: 'retry.pdf', mimeType: 'application/pdf',
      sizeBytes: 200, sha256: 'b'.repeat(64), pageCount: 2, uploadedBy: fixture.admin.id,
    })
    const attempt = await k1ExtractionAttemptRepository.createOrGet({
      k1DocumentId,
      requestedAttemptNumber: 1,
      provider: 'AWS_BDA',
      mappingSchemaVersion: config.k1Ingestion.bda.mappingSchemaVersion,
    })
    await k1ExtractionAttemptRepository.markFailed({
      attemptId: attempt.id,
      errorCode: 'ServiceError',
      errorSummary: 'Synthetic transient provider failure.',
    })
    await withTransaction(async (client) => {
      await durableK1BatchRepository.transitionItem(client, itemId, {
        from: ['PENDING_UPLOAD'], to: 'FAILED', errorCode: 'EXTRACTION_FAILED',
        errorSummary: 'The provider was temporarily unavailable.',
      })
    })
  })

  afterEach(async () => {
    await pool!.query(`delete from k1_local_queue_messages where payload->>'k1DocumentId' = $1`, [k1DocumentId])
    await pool!.query('delete from k1_issues where k1_document_id = $1', [k1DocumentId])
    await pool!.query('delete from k1_field_values where k1_document_id = $1', [k1DocumentId])
    await pool!.query('update k1_documents set active_extraction_attempt_id = null where id = $1', [k1DocumentId])
    await pool!.query('delete from k1_extraction_attempts where k1_document_id = $1', [k1DocumentId])
    await pool!.query('delete from k1_ingestion_items where batch_id = $1', [batchId])
    await pool!.query('delete from k1_documents where id = $1', [k1DocumentId])
    await pool!.query('delete from documents where id = $1', [documentId])
    await pool!.query('delete from k1_ingestion_batches where id = $1', [batchId])
    await pool!.query('delete from entity_memberships where entity_id = $1', [entityId])
    await pool!.query('delete from entities where id = $1', [entityId])
    await fixture.app.close()
  })

  it('creates an immutable successor attempt and reuses the original object version', async () => {
    const beforeDocument = await durableK1Repository.getById(k1DocumentId)
    const beforeAttempt = (await k1ExtractionAttemptRepository.listForDocument(k1DocumentId))[0]
    const beforeAttemptSnapshot = {
      id: beforeAttempt.id,
      status: beforeAttempt.status,
      errorCode: beforeAttempt.errorCode,
      errorSummary: beforeAttempt.errorSummary,
      completedAt: beforeAttempt.completedAt?.toISOString(),
    }
    const result = await retryK1Extraction({
      k1DocumentId,
      expectedDocumentVersion: beforeDocument!.version,
      actorUserId: fixture.admin.id,
    })
    expect(result).toMatchObject({ k1DocumentId, attemptNumber: 2, status: 'QUEUED' })

    const attempts = await k1ExtractionAttemptRepository.listForDocument(k1DocumentId)
    expect(attempts).toHaveLength(2)
    expect({
      id: attempts[0].id,
      status: attempts[0].status,
      errorCode: attempts[0].errorCode,
      errorSummary: attempts[0].errorSummary,
      completedAt: attempts[0].completedAt?.toISOString(),
    }).toEqual(beforeAttemptSnapshot)
    expect(attempts[1]).toMatchObject({ status: 'CREATED', attemptNumber: 2 })
    expect((await durableK1BatchRepository.getItemById(itemId))?.status).toBe('QUEUED')

    const afterDocument = await durableK1Repository.getById(k1DocumentId)
    expect(afterDocument).toMatchObject({
      storagePath: beforeDocument!.storagePath,
      storageVersionId: beforeDocument!.storageVersionId,
      activeExtractionAttemptId: null,
      processingStatus: 'PROCESSING',
    })
    const queued = await pool!.query<{ payload: Record<string, unknown> }>(
      `select payload from k1_local_queue_messages where payload->>'k1DocumentId' = $1`,
      [k1DocumentId],
    )
    expect(queued.rows).toHaveLength(1)
    expect(queued.rows[0].payload).toMatchObject({
      requestedAttemptNumber: 2,
      object: { key: beforeDocument!.storagePath, versionId: 'immutable-version-1' },
    })
  })

  it('rejects a stale retry without creating another attempt or queue message', async () => {
    const document = await durableK1Repository.getById(k1DocumentId)
    await expect(retryK1Extraction({
      k1DocumentId,
      expectedDocumentVersion: document!.version + 1,
      actorUserId: fixture.admin.id,
    })).rejects.toMatchObject({ code: 'STALE_K1_VERSION' })
    expect(await k1ExtractionAttemptRepository.listForDocument(k1DocumentId)).toHaveLength(1)
    const queued = await pool!.query<{ count: string }>(
      `select count(*)::text as count from k1_local_queue_messages where payload->>'k1DocumentId' = $1`,
      [k1DocumentId],
    )
    expect(Number(queued.rows[0].count)).toBe(0)
  })

  it('appends a new attempt when a reviewer re-runs a successful unapplied extraction', async () => {
    const originalDocument = await durableK1Repository.getById(k1DocumentId)
    const firstRetry = await retryK1Extraction({
      k1DocumentId,
      expectedDocumentVersion: originalDocument!.version,
      actorUserId: fixture.admin.id,
    })
    await withTransaction(async (client) => {
      await k1ExtractionAttemptRepository.promoteSucceeded(client, {
        attemptId: firstRetry.attemptId,
        rawResultKey: 'results/reprocessed/job_metadata.json',
        rawResultSha256: 'c'.repeat(64),
        customOutputStatus: 'MATCH',
        nextDocumentStatus: 'NEEDS_REVIEW',
      })
      await durableK1BatchRepository.transitionItem(client, itemId, {
        from: ['QUEUED'], to: 'NEEDS_REVIEW', errorCode: null, errorSummary: null,
      })
    })

    const succeededDocument = await durableK1Repository.getById(k1DocumentId)
    const rerun = await retryK1Extraction({
      k1DocumentId,
      expectedDocumentVersion: succeededDocument!.version,
      actorUserId: fixture.admin.id,
    })

    expect(rerun).toMatchObject({ attemptNumber: 3, status: 'QUEUED' })
    const attempts = await k1ExtractionAttemptRepository.listForDocument(k1DocumentId)
    expect(attempts.map((attempt) => attempt.status)).toEqual(['FAILED', 'SUCCEEDED', 'CREATED'])
    expect((await durableK1BatchRepository.getItemById(itemId))?.status).toBe('QUEUED')
  })
})
