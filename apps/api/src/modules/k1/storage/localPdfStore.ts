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

export const localPdfStore: PdfStore = {
  async put(documentId, taxYear, buffer) {
    const dir = path.resolve(config.storageRoot, 'k1', yearFolder(taxYear))
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${documentId}.pdf`)
    await fs.writeFile(filePath, buffer)
    // Return a relative-ish path that is stable for audit.
    return path.relative(path.resolve(config.storageRoot), filePath).replaceAll('\\', '/')
  },

  get(storagePath) {
    const abs = path.resolve(config.storageRoot, storagePath)
    return createReadStream(abs)
  },

  async delete(storagePath) {
    const abs = path.resolve(config.storageRoot, storagePath)
    await fs.unlink(abs).catch(() => undefined)
  },
}
