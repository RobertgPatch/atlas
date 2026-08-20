import { withTransaction } from '../../../infra/db/client.js'
import { auditRepository } from '../../audit/audit.repository.js'
import { k1ExtractionAttemptRepository } from '../extraction/k1ExtractionAttempt.repository.js'
import { durableK1BatchRepository, durableK1Repository } from '../k1.repository.js'
import type { K1IngestionItem } from '../k1.types.js'
import { getK1ObjectStore } from '../storage/index.js'
import { toPublicItem } from './k1Batch.service.js'
import { transitionK1IngestionItem } from './k1BatchStatus.service.js'

const CANCELLABLE = [
  'PENDING_UPLOAD', 'UPLOADED', 'VALIDATING', 'QUEUED', 'FAILED',
  'NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY',
] as const

export const cancelK1IngestionItem = async (args: {
  itemId: string
  actorUserId: string
}): Promise<K1IngestionItem> => {
  const result = await withTransaction(async (client) => {
    const item = await durableK1BatchRepository.getItemById(args.itemId, client, true)
    if (!item) throw Object.assign(new Error('ITEM_NOT_FOUND'), { code: 'ITEM_NOT_FOUND' })
    if (!CANCELLABLE.includes(item.status as typeof CANCELLABLE[number])) {
      throw Object.assign(new Error('ITEM_NOT_CANCELLABLE'), { code: 'ITEM_NOT_CANCELLABLE', currentStatus: item.status })
    }
    const document = item.k1DocumentId ? await durableK1Repository.lockById(client, item.k1DocumentId) : null
    if (document?.appliedAt || item.status === 'APPLIED') {
      throw Object.assign(new Error('APPLIED_DOCUMENT_RETAINED'), { code: 'APPLIED_DOCUMENT_RETAINED' })
    }
    if (item.k1DocumentId) {
      const attempts = await k1ExtractionAttemptRepository.listForDocument(item.k1DocumentId, client)
      const latest = attempts.at(-1)
      if (latest?.status === 'CREATED') await k1ExtractionAttemptRepository.markSuperseded(latest.id, client)
    }
    // Local durable messages can be removed directly. SQS deliveries are made
    // harmless by the worker's locked status check before provider submission.
    await client.query(
      `delete from k1_local_queue_messages
        where payload ->> 'ingestionItemId' = $1`,
      [item.id],
    )
    const cancelled = await transitionK1IngestionItem(client, item.id, {
      from: [...CANCELLABLE], to: 'CANCELLED', errorCode: null, errorSummary: null,
    })
    if (!cancelled) throw Object.assign(new Error('ITEM_NOT_FOUND'), { code: 'ITEM_NOT_FOUND' })
    await auditRepository.record({
      actorUserId: args.actorUserId, eventName: 'k1.ingestion_item.cancelled',
      objectType: 'k1_ingestion_item', objectId: item.id,
      after: { batchId: item.batchId, itemId: item.id, k1DocumentId: item.k1DocumentId, status: 'CANCELLED' },
    }, client)
    return { item: cancelled, deleteQuarantine: !item.documentId && !item.k1DocumentId }
  })
  if (result.deleteQuarantine) {
    try {
      await getK1ObjectStore().delete({ key: result.item.objectKey, versionId: result.item.objectVersionId })
    } catch {
      // The cancellation is durable; lifecycle retention remains the recovery
      // path if best-effort quarantine cleanup is temporarily unavailable.
    }
  }
  return toPublicItem(result.item, false)
}
