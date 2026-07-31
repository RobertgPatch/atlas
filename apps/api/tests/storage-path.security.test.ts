import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { config } from '../src/config.js'
import { resolvePdfStoragePath } from '../src/modules/k1/storage/localPdfStore.js'

describe('PDF storage path containment', () => {
  it('resolves application-owned PDF paths below the storage root', () => {
    const resolved = resolvePdfStoragePath('k1/2024/document.pdf')
    const expectedRoot = `${path.resolve(config.storageRoot)}${path.sep}`

    expect(resolved.startsWith(expectedRoot)).toBe(true)
  })

  it('rejects paths that escape the configured storage root', () => {
    expect(() => resolvePdfStoragePath('../package.json')).toThrow(
      'Path traversal detected',
    )
    expect(() => resolvePdfStoragePath(path.resolve('package.json'))).toThrow(
      'Path traversal detected',
    )
  })
})
