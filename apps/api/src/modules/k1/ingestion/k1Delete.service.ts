import { withTransaction } from '../../../infra/db/client.js'
import { auditRepository } from '../../audit/audit.repository.js'
import { durableK1BatchRepository, durableK1Repository } from '../k1.repository.js'
import { getK1ObjectStore } from '../storage/index.js'

const DELETABLE = ['FAILED', 'CANCELLED'] as const

export interface DeletedK1IngestionItem {
  itemId: string
  batchId: string
  k1DocumentId: string | null
  batchDeleted: boolean
}

/**
 * Permanently removes a failed or cancelled ingestion item and any un-applied
 * document artifacts that would otherwise block uploading the same PDF again.
 */
export const deleteK1IngestionItem = async (args: {
  itemId: string
  actorUserId: string
}): Promise<DeletedK1IngestionItem> => {
  const deleted = await withTransaction(async (client) => {
    const reference = await durableK1BatchRepository.getItemById(args.itemId, client)
    if (!reference) throw Object.assign(new Error('ITEM_NOT_FOUND'), { code: 'ITEM_NOT_FOUND' })

    // Follow the state-machine lock order: parent batch, then item/document.
    await client.query('select id from k1_ingestion_batches where id = $1 for update', [reference.batchId])
    const item = await durableK1BatchRepository.getItemById(args.itemId, client, true)
    if (!item) throw Object.assign(new Error('ITEM_NOT_FOUND'), { code: 'ITEM_NOT_FOUND' })
    if (!DELETABLE.includes(item.status as typeof DELETABLE[number])) {
      throw Object.assign(new Error('ITEM_NOT_DELETABLE'), {
        code: 'ITEM_NOT_DELETABLE',
        currentStatus: item.status,
      })
    }

    const document = item.k1DocumentId
      ? await durableK1Repository.lockById(client, item.k1DocumentId)
      : null

    if (item.k1DocumentId && !document) {
      throw Object.assign(new Error('ITEM_DOCUMENT_NOT_FOUND'), { code: 'ITEM_DOCUMENT_NOT_FOUND' })
    }

    if (document) {
      const retained = await client.query<{ retained: boolean }>(
        `select (
            $1::boolean
            or exists (
              select 1 from k1_document_applications
               where k1_document_id = $2 and status = 'APPLIED'
            )
            or exists (
              select 1 from k1_tracker_value_revisions
               where source_k1_document_id = $2
            )
            or exists (
              select 1 from k1_tracker_official_value_revisions
               where source_k1_document_id = $2
            )
            or exists (
              select 1 from partnership_annual_activity
               where finalized_from_k1_document_id = $2
            )
            or exists (
              select 1 from k1_documents
               where superseded_by_document_id = $2
            )
            or exists (
              select 1 from document_versions
               where original_document_id = $3 or superseded_by_id = $3
            )
          ) as retained`,
        [Boolean(document.appliedAt || document.processingStatus === 'FINALIZED'), document.id, document.documentId],
      )
      if (retained.rows[0]?.retained) {
        throw Object.assign(new Error('APPLIED_DOCUMENT_RETAINED'), { code: 'APPLIED_DOCUMENT_RETAINED' })
      }
    }

    await client.query(
      `delete from k1_local_queue_messages
        where payload ->> 'ingestionItemId' = $1
           or ($2::uuid is not null and payload ->> 'k1DocumentId' = $2::text)`,
      [item.id, item.k1DocumentId],
    )

    if (item.k1DocumentId) {
      // Delete immutable review/extraction children explicitly because their
      // foreign keys intentionally do not cascade for ordinary document edits.
      await client.query('delete from k1_document_applications where k1_document_id = $1', [item.k1DocumentId])
      await client.query('delete from k1_field_value_corrections where k1_document_id = $1', [item.k1DocumentId])
      await client.query('delete from k1_match_candidates where k1_document_id = $1', [item.k1DocumentId])
      await client.query('delete from k1_issues where k1_document_id = $1', [item.k1DocumentId])
      await client.query('delete from k1_reported_distributions where k1_document_id = $1', [item.k1DocumentId])
      await client.query('delete from k1_field_values where k1_document_id = $1', [item.k1DocumentId])
      await client.query('update k1_documents set active_extraction_attempt_id = null where id = $1', [item.k1DocumentId])
      await client.query('delete from k1_extraction_attempts where k1_document_id = $1', [item.k1DocumentId])
    }

    await auditRepository.record({
      actorUserId: args.actorUserId,
      eventName: 'k1.ingestion_item.deleted',
      objectType: 'k1_ingestion_item',
      objectId: item.id,
      before: {
        batchId: item.batchId,
        itemId: item.id,
        k1DocumentId: item.k1DocumentId,
        status: item.status,
      },
      after: null,
    }, client)

    await client.query('delete from k1_ingestion_items where id = $1', [item.id])
    if (item.k1DocumentId) {
      await client.query('delete from k1_documents where id = $1', [item.k1DocumentId])
    }
    if (item.documentId) {
      await client.query('delete from documents where id = $1', [item.documentId])
    }

    const remaining = await client.query<{ count: number }>(
      'select count(*)::int as count from k1_ingestion_items where batch_id = $1',
      [item.batchId],
    )
    const batchDeleted = (remaining.rows[0]?.count ?? 0) === 0
    if (batchDeleted) {
      await client.query('delete from k1_ingestion_batches where id = $1', [item.batchId])
    } else {
      await client.query(
        'update k1_ingestion_batches set file_count = $2 where id = $1',
        [item.batchId, remaining.rows[0]!.count],
      )
      await durableK1BatchRepository.recomputeBatch(client, item.batchId)
    }

    return {
      itemId: item.id,
      batchId: item.batchId,
      k1DocumentId: item.k1DocumentId,
      batchDeleted,
      object: {
        key: document?.storagePath ?? item.objectKey,
        bucket: document?.storageBucket ?? null,
        versionId: document?.storageVersionId ?? item.objectVersionId,
      },
    }
  })

  try {
    await getK1ObjectStore().delete(deleted.object)
  } catch {
    // The database deletion is authoritative. Object-store lifecycle cleanup
    // remains a recovery path if this best-effort delete is unavailable.
  }

  return {
    itemId: deleted.itemId,
    batchId: deleted.batchId,
    k1DocumentId: deleted.k1DocumentId,
    batchDeleted: deleted.batchDeleted,
  }
}
