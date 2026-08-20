import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { config } from '../../../config.js'
import type { DurableK1IngestionItemRecord } from '../k1.repository.js'
import type { K1UploadSlot } from '../k1.types.js'

export interface K1UploadSlotService {
  readonly kind: 'local' | 's3'
  createSlot(item: DurableK1IngestionItemRecord): Promise<K1UploadSlot>
}

const checksumBase64 = (sha256: string) => Buffer.from(sha256, 'hex').toString('base64')

export class S3K1UploadSlotService implements K1UploadSlotService {
  readonly kind = 's3' as const
  private readonly client: S3Client

  constructor(client = new S3Client({ region: config.aws.region })) {
    this.client = client
  }

  async createSlot(item: DurableK1IngestionItemRecord): Promise<K1UploadSlot> {
    if (!config.k1Ingestion.s3.bucket || !config.k1Ingestion.s3.kmsKeyArn) {
      throw new Error('K1_S3_UPLOAD_CONFIGURATION_REQUIRED')
    }
    const checksum = checksumBase64(item.sha256)
    const expiresIn = config.k1Ingestion.uploadUrlTtlSeconds
    const command = new PutObjectCommand({
      Bucket: config.k1Ingestion.s3.bucket,
      Key: item.objectKey,
      ContentType: 'application/pdf',
      ContentLength: item.sizeBytes,
      ChecksumSHA256: checksum,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: config.k1Ingestion.s3.kmsKeyArn,
      BucketKeyEnabled: true,
      Metadata: { ingestionItemId: item.id },
    })
    return {
      method: 'PUT',
      url: await getSignedUrl(this.client, command, { expiresIn }),
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(item.sizeBytes),
        // The AWS presigner hoists ChecksumSHA256 into the signed query string.
        // Sending it again as a header makes S3 reject the request because that
        // duplicate header is not part of SignedHeaders.
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': config.k1Ingestion.s3.kmsKeyArn,
        'x-amz-server-side-encryption-bucket-key-enabled': 'true',
      },
      expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
    }
  }
}

let s3Service: S3K1UploadSlotService | undefined
export const getS3K1UploadSlotService = (): S3K1UploadSlotService =>
  (s3Service ??= new S3K1UploadSlotService())
