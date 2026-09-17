import { config } from '../../../config.js'
import { withTransaction } from '../../../infra/db/client.js'
import { cloudWatchAbuseObservability } from '../../abuse-protection/abuseObservability.js'
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
    if (!config.abuseProtection.killSwitches.k1UploadsEnabled) {
      cloudWatchAbuseObservability.record({
        decision: 'disabled',
        policyKey: 'k1.upload_capability',
        routeClass: 'K1_UPLOAD_ADMISSION',
        scopeKind: 'document',
        workloadKey: 'k1_upload',
        reasonCode: 'K1_UPLOADS_DISABLED',
        environment: config.nodeEnv,
      })
      throw new Error('K1_UPLOADS_DISABLED')
    }
    const slot: K1UploadSlot = {
      method: 'PUT',
      url: `/v1/k1-ingestion-items/${item.id}/local-upload`,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(item.sizeBytes),
        'if-none-match': '*',
        'x-amz-checksum-sha256': item.sha256,
      },
      expiresAt: new Date(
        Date.now() + config.abuseProtection.capabilities.uploadTtlSeconds * 1_000,
      ).toISOString(),
    }
    cloudWatchAbuseObservability.record({
      decision: 'allowed',
      policyKey: 'k1.upload_capability',
      routeClass: 'K1_UPLOAD_ADMISSION',
      scopeKind: 'document',
      workloadKey: 'k1_upload',
      reasonCode: 'CAPABILITY_ISSUED',
      environment: config.nodeEnv,
    })
    return slot
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
    cloudWatchAbuseObservability.record({
      decision: 'blocked',
      policyKey: 'k1.upload_capability',
      routeClass: 'K1_UPLOAD_ADMISSION',
      scopeKind: 'document',
      workloadKey: 'k1_upload',
      reasonCode: 'CAPABILITY_REPLAY',
      environment: config.nodeEnv,
    })
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
    ifNoneMatch: '*',
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
