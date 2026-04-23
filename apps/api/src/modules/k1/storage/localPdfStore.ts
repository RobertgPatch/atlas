import { promises as fs, createReadStream } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { config } from '../../../config.js'

export interface PdfStore {
  put(documentId: string, taxYear: number, buffer: Buffer): Promise<string>
  get(storagePath: string): Readable
  delete(storagePath: string): Promise<void>
}

const yearFolder = (taxYear: number) => String(taxYear)
const storageRoot = path.resolve(config.storageRoot)
const storageRootPrefix = `${storageRoot}${path.sep}`

const resolveStoragePath = (storagePath: string) => {
  const resolvedPath = path.resolve(storageRoot, storagePath)
  if (!resolvedPath.startsWith(storageRootPrefix)) {
    throw new Error('Invalid storage path')
  }
  return resolvedPath
}

export const localPdfStore: PdfStore = {
  async put(documentId, taxYear, buffer) {
    const dir = path.resolve(storageRoot, 'k1', yearFolder(taxYear))
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${documentId}.pdf`)
    await fs.writeFile(filePath, buffer)
    // Return a relative-ish path that is stable for audit.
    return path.relative(storageRoot, filePath).replaceAll('\\', '/')
  },

  get(storagePath) {
    const abs = resolveStoragePath(storagePath)
    return createReadStream(abs)
  },

  async delete(storagePath) {
    const abs = resolveStoragePath(storagePath)
    await fs.unlink(abs).catch(() => undefined)
  },
}
