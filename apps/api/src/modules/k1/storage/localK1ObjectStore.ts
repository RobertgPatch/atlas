import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

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

const storageRoot = path.resolve(config.storageRoot)
const storageRootPrefix = `${storageRoot}${path.sep}`

export const resolveLocalK1ObjectPath = (key: string): string => {
  const safeKey = assertSafeObjectKey(key)
  const resolved = path.resolve(storageRoot, ...safeKey.split('/'))
  if (resolved !== storageRoot && !resolved.startsWith(storageRootPrefix)) {
    throw Object.assign(new Error('INVALID_OBJECT_KEY'), { code: 'INVALID_OBJECT_KEY' })
  }
  return resolved
}

const asReadable = (body: PutK1ObjectInput['body']): Readable =>
  body instanceof Readable ? body : Readable.from([body])

const checksumHex = (checksum: string | null | undefined): string | null => {
  if (!checksum) return null
  return checksum.toLowerCase().replace(/^sha256:/, '')
}

export class LocalK1ObjectStore implements K1ObjectStore {
  readonly kind = 'local' as const

  async put(input: PutK1ObjectInput): Promise<K1ObjectMetadata> {
    const key = assertSafeObjectKey(input.key)
    const absolutePath = resolveLocalK1ObjectPath(key)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.uploading`
    const hash = createHash('sha256')
    let written = 0
    const verifier = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        written += chunk.byteLength
        hash.update(chunk)
        callback(null, chunk)
      },
    })
    try {
      await pipeline(asReadable(input.body), verifier, createWriteStream(temporaryPath, { flags: 'wx' }))
      const actualHash = hash.digest('hex')
      const expectedHash = checksumHex(input.checksumSha256)
      if (written !== input.sizeBytes) {
        throw Object.assign(new Error('OBJECT_SIZE_MISMATCH'), { code: 'OBJECT_SIZE_MISMATCH' })
      }
      if (expectedHash && actualHash !== expectedHash) {
        throw Object.assign(new Error('OBJECT_CHECKSUM_MISMATCH'), { code: 'OBJECT_CHECKSUM_MISMATCH' })
      }
      await rename(temporaryPath, absolutePath)
      const details = await stat(absolutePath)
      return {
        key,
        bucket: null,
        versionId: null,
        contentType: input.contentType,
        sizeBytes: details.size,
        checksumSha256: actualHash,
        etag: null,
        lastModified: details.mtime,
        serverSideEncryption: null,
        kmsKeyId: null,
      }
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  async head(identity: K1ObjectIdentity): Promise<K1ObjectMetadata | null> {
    const key = assertSafeObjectKey(identity.key)
    try {
      const details = await stat(resolveLocalK1ObjectPath(key))
      return {
        key,
        bucket: null,
        versionId: null,
        contentType: key.endsWith('.json') ? 'application/json' : 'application/pdf',
        sizeBytes: details.size,
        checksumSha256: null,
        etag: null,
        lastModified: details.mtime,
        serverSideEncryption: null,
        kmsKeyId: null,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async read(identity: K1ObjectIdentity, range?: K1ObjectRange): Promise<K1ObjectRead> {
    const metadata = await this.head(identity)
    if (!metadata) throw Object.assign(new Error('OBJECT_NOT_FOUND'), { code: 'OBJECT_NOT_FOUND' })
    const start = range?.start ?? 0
    const end = range?.end ?? metadata.sizeBytes - 1
    if (start < 0 || end < start || start >= metadata.sizeBytes) {
      throw Object.assign(new Error('INVALID_OBJECT_RANGE'), { code: 'INVALID_OBJECT_RANGE' })
    }
    return {
      body: createReadStream(resolveLocalK1ObjectPath(identity.key), { start, end }),
      metadata,
      contentRange: range ? `bytes ${start}-${end}/${metadata.sizeBytes}` : null,
    }
  }

  async delete(identity: K1ObjectIdentity): Promise<void> {
    await unlink(resolveLocalK1ObjectPath(identity.key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }

  putRawResult(input: PutK1ObjectInput): Promise<K1ObjectMetadata> {
    return this.put(input)
  }

  readRawResult(identity: K1ObjectIdentity): Promise<K1ObjectRead> {
    return this.read(identity)
  }
}

export const localK1ObjectStore = new LocalK1ObjectStore()
