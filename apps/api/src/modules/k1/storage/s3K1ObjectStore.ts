import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'

import { config } from '../../../config.js'
import {
  assertSafeObjectKey,
  type K1ObjectIdentity,
  type K1ObjectMetadata,
  type K1ObjectRange,
  type K1ObjectRead,
  type K1ObjectStore,
  type PutK1ObjectInput,
} from './K1ObjectStore.js'

const checksumBase64 = (checksum: string | null | undefined): string | undefined => {
  if (!checksum) return undefined
  const normalized = checksum.toLowerCase().replace(/^sha256:/, '')
  return Buffer.from(normalized, 'hex').toString('base64')
}

const checksumHex = (checksum: string | undefined): string | null =>
  checksum ? Buffer.from(checksum, 'base64').toString('hex') : null

const bodyAsReadable = (body: unknown): Readable => {
  if (body instanceof Readable) return body
  if (body && Symbol.asyncIterator in Object(body)) {
    return Readable.from(body as AsyncIterable<Uint8Array>)
  }
  throw new Error('S3_RESPONSE_BODY_NOT_STREAMABLE')
}

export class S3K1ObjectStore implements K1ObjectStore {
  readonly kind = 's3' as const
  private readonly client: S3Client
  private readonly bucket: string
  private readonly kmsKeyArn: string

  constructor(args?: { client?: S3Client; bucket?: string; kmsKeyArn?: string }) {
    this.client = args?.client ?? new S3Client({ region: config.aws.region })
    this.bucket = args?.bucket ?? config.k1Ingestion.s3.bucket
    this.kmsKeyArn = args?.kmsKeyArn ?? config.k1Ingestion.s3.kmsKeyArn
    if (!this.bucket) throw new Error('K1_S3_BUCKET_REQUIRED')
    if (!this.kmsKeyArn) throw new Error('K1_S3_KMS_KEY_REQUIRED')
  }

  async put(input: PutK1ObjectInput): Promise<K1ObjectMetadata> {
    const key = assertSafeObjectKey(input.key)
    const response = await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: input.body,
      ContentLength: input.sizeBytes,
      ContentType: input.contentType,
      ChecksumSHA256: checksumBase64(input.checksumSha256),
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: this.kmsKeyArn,
      BucketKeyEnabled: true,
      Metadata: input.metadata,
    }))
    return {
      key,
      bucket: this.bucket,
      versionId: response.VersionId ?? null,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256?.replace(/^sha256:/, '') ?? null,
      etag: response.ETag ?? null,
      lastModified: new Date(),
      serverSideEncryption: 'aws:kms',
      kmsKeyId: this.kmsKeyArn,
    }
  }

  async head(identity: K1ObjectIdentity): Promise<K1ObjectMetadata | null> {
    const key = assertSafeObjectKey(identity.key)
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: identity.bucket ?? this.bucket,
        Key: key,
        VersionId: identity.versionId ?? undefined,
      }))
      return {
        key,
        bucket: identity.bucket ?? this.bucket,
        versionId: response.VersionId ?? identity.versionId ?? null,
        contentType: response.ContentType ?? null,
        sizeBytes: response.ContentLength ?? 0,
        checksumSha256: checksumHex(response.ChecksumSHA256),
        etag: response.ETag ?? null,
        lastModified: response.LastModified ?? null,
        serverSideEncryption: response.ServerSideEncryption ?? null,
        kmsKeyId: response.SSEKMSKeyId ?? null,
      }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404) return null
      throw error
    }
  }

  async read(identity: K1ObjectIdentity, range?: K1ObjectRange): Promise<K1ObjectRead> {
    const key = assertSafeObjectKey(identity.key)
    const response = await this.client.send(new GetObjectCommand({
      Bucket: identity.bucket ?? this.bucket,
      Key: key,
      VersionId: identity.versionId ?? undefined,
      Range: range ? `bytes=${range.start}-${range.end ?? ''}` : undefined,
      ChecksumMode: range ? undefined : 'ENABLED',
    }))
    if (!response.Body) throw new Error('S3_RESPONSE_BODY_MISSING')
    return {
      body: bodyAsReadable(response.Body),
      metadata: {
        key,
        bucket: identity.bucket ?? this.bucket,
        versionId: response.VersionId ?? identity.versionId ?? null,
        contentType: response.ContentType ?? null,
        sizeBytes: response.ContentLength ?? 0,
        checksumSha256: checksumHex(response.ChecksumSHA256),
        etag: response.ETag ?? null,
        lastModified: response.LastModified ?? null,
        serverSideEncryption: response.ServerSideEncryption ?? null,
        kmsKeyId: response.SSEKMSKeyId ?? null,
      },
      contentRange: response.ContentRange ?? null,
    }
  }

  async delete(identity: K1ObjectIdentity): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: identity.bucket ?? this.bucket,
      Key: assertSafeObjectKey(identity.key),
      VersionId: identity.versionId ?? undefined,
    }))
  }

  putRawResult(input: PutK1ObjectInput): Promise<K1ObjectMetadata> {
    return this.put(input)
  }

  readRawResult(identity: K1ObjectIdentity): Promise<K1ObjectRead> {
    return this.read(identity)
  }
}
