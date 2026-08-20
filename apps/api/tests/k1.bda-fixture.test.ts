import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import {
  assertK1BdaFixtureCoverage,
  buildSyntheticK1Pdf,
  loadK1BdaFixtureManifest,
  supportedFixtureCanonicalPaths,
} from './helpers/k1BdaFixture.js'

describe('sanitized BDA fixture set', () => {
  it('covers the required revisions, operational exceptions, and all 79 destinations', async () => {
    const manifest = await loadK1BdaFixtureManifest()
    expect(() => assertK1BdaFixtureCoverage(manifest)).not.toThrow()
    expect(manifest.fixtures.some((fixture) =>
      fixture.revisionYear !== null && fixture.revisionYear < 2024,
    )).toBe(true)
    expect(supportedFixtureCanonicalPaths()).toHaveLength(79)
    expect(new Set(supportedFixtureCanonicalPaths()).size).toBe(79)
  })

  it('generates a multi-page synthetic K-1 with no production identifiers', async () => {
    const manifest = await loadK1BdaFixtureManifest()
    const entry = manifest.fixtures.find((fixture) => fixture.id === 'complete-digital-2025')!
    const bytes = await buildSyntheticK1Pdf(entry)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(1)
    expect(pdf.getTitle()).toContain('Synthetic K-1 fixture')
  })
})
