import { PassThrough, type Readable } from 'node:stream'

import { localK1ObjectStore } from './localK1ObjectStore.js'

export interface PdfStore {
  put(documentId: string, taxYearOrFolder: number | string, buffer: Buffer): Promise<string>
  get(storagePath: string): Readable
  delete(storagePath: string): Promise<void>
}

export const localPdfStore: PdfStore = {
  async put(documentId, taxYear, buffer) {
    const key = `k1/${String(taxYear)}/${documentId}.pdf`
    await localK1ObjectStore.put({
      key,
      body: buffer,
      contentType: 'application/pdf',
      sizeBytes: buffer.byteLength,
    })
    return key
  },

  get(storagePath) {
    // Legacy synchronous contract. The local adapter is intentionally the only
    // implementation exposed here; new code uses the async K1ObjectStore API.
    const pending = localK1ObjectStore.read({ key: storagePath })
    const proxy = new PassThrough()
    void pending.then(({ body }) => body.pipe(proxy), (error) => proxy.destroy(error as Error))
    return proxy
  },

  async delete(storagePath) {
    await localK1ObjectStore.delete({ key: storagePath })
  },
}
