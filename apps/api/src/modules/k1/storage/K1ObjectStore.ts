import type { Readable } from 'node:stream'

export interface K1ObjectIdentity {
  key: string
  bucket?: string | null
  versionId?: string | null
}

export interface K1ObjectMetadata extends K1ObjectIdentity {
  contentType: string | null
  sizeBytes: number
  checksumSha256: string | null
  etag: string | null
  lastModified: Date | null
  serverSideEncryption: string | null
  kmsKeyId: string | null
}

export interface K1ObjectRange {
  start: number
  end?: number
}

export interface K1ObjectRead {
  body: Readable
  metadata: K1ObjectMetadata
  contentRange: string | null
}

export interface PutK1ObjectInput {
  key: string
  body: Readable | Buffer | Uint8Array
  contentType: string
  sizeBytes: number
  checksumSha256?: string | null
  metadata?: Record<string, string>
}

export interface K1ObjectStore {
  readonly kind: 'local' | 's3'
  put(input: PutK1ObjectInput): Promise<K1ObjectMetadata>
  head(identity: K1ObjectIdentity): Promise<K1ObjectMetadata | null>
  read(identity: K1ObjectIdentity, range?: K1ObjectRange): Promise<K1ObjectRead>
  delete(identity: K1ObjectIdentity): Promise<void>
  promoteAccepted?(
    source: K1ObjectIdentity,
    acceptedKey: string,
  ): Promise<K1ObjectMetadata>
  putRawResult(input: PutK1ObjectInput): Promise<K1ObjectMetadata>
  readRawResult(identity: K1ObjectIdentity): Promise<K1ObjectRead>
}

export const assertSafeObjectKey = (key: string): string => {
  const normalized = key.replaceAll('\\', '/')
  if (
    normalized.length === 0
    || normalized.startsWith('/')
    || normalized.includes('\0')
    || normalized.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw Object.assign(new Error('INVALID_OBJECT_KEY'), { code: 'INVALID_OBJECT_KEY' })
  }
  return normalized
}

export const readObjectToBuffer = async (
  store: K1ObjectStore,
  identity: K1ObjectIdentity,
  maxBytes?: number,
): Promise<Buffer> => {
  const object = await store.read(identity)
  if (maxBytes != null && object.metadata.sizeBytes > maxBytes) {
    throw Object.assign(new Error('OBJECT_TOO_LARGE'), { code: 'OBJECT_TOO_LARGE' })
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of object.body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    total += buffer.byteLength
    if (maxBytes != null && total > maxBytes) {
      object.body.destroy()
      throw Object.assign(new Error('OBJECT_TOO_LARGE'), { code: 'OBJECT_TOO_LARGE' })
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, total)
}
