import { config } from '../../../config.js'
import { withTransaction } from '../../../infra/db/client.js'
import {
  durableK1BatchRepository,
  type DurableK1IngestionItemRecord,
} from '../k1.repository.js'
import type { K1UploadSlot } from '../k1.types.js'
import { getK1ObjectStore } from '../storage/index.js'
import type { K1UploadSlotService } from './k1UploadSlots.service.js'

export class LocalK1UploadSlotService implements K1UploadSlotService {
  readonly kind = 'local' as const

  async createSlot(item: DurableK1IngestionItemRecord): Promise<K1UploadSlot> {
    return {
      method: 'PUT',
      url: `/v1/k1-ingestion-items/${item.id}/local-upload`,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(item.sizeBytes),
        'x-amz-checksum-sha256': item.sha256,
      },
      expiresAt: new Date(Date.now() + config.k1Ingestion.uploadUrlTtlSeconds * 1_000).toISOString(),
    }
  }
}

export const localK1UploadSlotService = new LocalK1UploadSlotService()

export const acceptLocalK1Upload = async (args: {
  itemId: string
  body: Buffer
  sizeBytes: number
  sha256: string
}): Promise<void> => {
  const item = await durableK1BatchRepository.getItemById(args.itemId)
  if (!item) throw Object.assign(new Error('ITEM_NOT_FOUND'), { code: 'ITEM_NOT_FOUND' })
  if (!['PENDING_UPLOAD', 'FAILED'].includes(item.status)) {
    throw Object.assign(new Error('INVALID_ITEM_STATE'), { code: 'INVALID_ITEM_STATE' })
  }
  if (args.sizeBytes !== item.sizeBytes || args.body.byteLength !== item.sizeBytes) {
    throw Object.assign(new Error('OBJECT_SIZE_MISMATCH'), { code: 'OBJECT_SIZE_MISMATCH' })
  }
  if (args.sha256 !== item.sha256) {
    throw Object.assign(new Error('OBJECT_CHECKSUM_MISMATCH'), { code: 'OBJECT_CHECKSUM_MISMATCH' })
  }
  const stored = await getK1ObjectStore().put({
    key: item.objectKey,
    body: args.body,
    contentType: 'application/pdf',
    sizeBytes: item.sizeBytes,
    checksumSha256: item.sha256,
  })
  await withTransaction(async (client) => {
    await durableK1BatchRepository.transitionItem(client, item.id, {
      from: ['PENDING_UPLOAD', 'FAILED'],
      to: 'UPLOADED',
      objectVersionId: stored.versionId,
      errorCode: null,
      errorSummary: null,
    })
  })
}
