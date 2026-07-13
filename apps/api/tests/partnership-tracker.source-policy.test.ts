import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Partnership Tracker v1 source policy', () => {
  it('registers manual year operations without import, upload, OCR, or source-sync routes', async () => {
    const routes = await readFile(new URL('../src/modules/partnership-tracker/partnership-tracker.routes.ts', import.meta.url), 'utf8')
    expect(routes).toContain('/years')
    expect(routes).not.toMatch(/imports|upload|ocr|source-sync/i)
  })
  it('reads retained tracker data with finalized-source synchronization disabled', async () => {
    const repository = await readFile(new URL('../src/modules/partnership-tracker/partnership-tracker.repository.ts', import.meta.url), 'utf8')
    expect(repository.match(/syncSources:\s*false/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
