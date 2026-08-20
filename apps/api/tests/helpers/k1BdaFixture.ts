import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PDFDocument, StandardFonts } from 'pdf-lib'

import {
  K1_CALCULATION_DESTINATIONS,
  K1_OFFICIAL_DESTINATIONS,
  K1_MAPPING_RULE_VERSION,
} from '../../src/modules/k1/extraction/k1DestinationInventory.js'

export interface K1BdaFixtureManifestEntry {
  id: string
  revisionYear: number | null
  mode: 'digital' | 'scanned' | 'encrypted' | 'corrupt' | 'duplicate'
  features: string[]
  expectedIssues?: string[]
}

export interface K1BdaFixtureManifest {
  schemaVersion: string
  containsProductionData: boolean
  tolerances: Record<string, string>
  fixtures: K1BdaFixtureManifestEntry[]
}

const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/k1-bda',
)

export const loadK1BdaFixtureManifest = async (): Promise<K1BdaFixtureManifest> =>
  JSON.parse(await readFile(path.join(fixtureDirectory, 'manifest.json'), 'utf8')) as K1BdaFixtureManifest

export const supportedFixtureCanonicalPaths = (): string[] => [
  ...K1_OFFICIAL_DESTINATIONS.map((definition) => definition.canonicalPath),
  ...K1_CALCULATION_DESTINATIONS.flatMap((definition) =>
    definition.canonicalPath && definition.policy !== 'WORKPAPER_EXCLUDED'
      ? [definition.canonicalPath]
      : [],
  ),
]

export const assertK1BdaFixtureCoverage = (manifest: K1BdaFixtureManifest): void => {
  if (manifest.schemaVersion !== K1_MAPPING_RULE_VERSION) throw new Error('Fixture mapping version is stale.')
  if (manifest.containsProductionData) throw new Error('Production data is forbidden in K-1 fixtures.')
  const requiredModes = new Set(['digital', 'scanned', 'encrypted', 'corrupt', 'duplicate'])
  manifest.fixtures.forEach((fixture) => requiredModes.delete(fixture.mode))
  if (requiredModes.size > 0) throw new Error(`Missing fixture modes: ${[...requiredModes].join(', ')}`)
  const revisionYears = new Set(manifest.fixtures.map((fixture) => fixture.revisionYear).filter(Boolean))
  if (revisionYears.size < 2) throw new Error('At least two supported Schedule K-1 revisions are required.')
  if (![...revisionYears].some((revisionYear) => revisionYear! < 2024)) {
    throw new Error('At least one supported legacy Schedule K-1 revision before 2024 is required.')
  }
  const features = new Set(manifest.fixtures.flatMap((fixture) => fixture.features))
  for (const feature of [
    'all-destinations', 'all-coded-sections', 'continuation-pages', 'final', 'amended',
    'general', 'limited', 'domestic', 'foreign', 'ambiguous-entity', 'apply-conflicts',
    'dated-contribution-authoritative', 'dated-distribution-authoritative',
  ]) {
    if (!features.has(feature)) throw new Error(`Missing fixture feature: ${feature}`)
  }
  if (supportedFixtureCanonicalPaths().length !== 79) {
    throw new Error('The fixture generator must cover all 48 official and 31 literal calculation destinations.')
  }
}

/** Builds a synthetic, non-PII PDF whose text enumerates every supported destination. */
export const buildSyntheticK1Pdf = async (entry: K1BdaFixtureManifestEntry): Promise<Uint8Array> => {
  if (entry.mode === 'corrupt') return new TextEncoder().encode('%PDF-corrupt-synthetic-fixture')
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Synthetic K-1 fixture ${entry.id}`)
  pdf.setSubject('Non-production test data')
  const font = await pdf.embedFont(StandardFonts.Courier)
  const lines = [
    `SYNTHETIC SCHEDULE K-1 FORM 1065 ${entry.revisionYear ?? 'UNKNOWN'}`,
    'PARTNERSHIP EIN 12-3456789 / PARTNER TIN 987-65-4321',
    ...supportedFixtureCanonicalPaths(),
  ]
  let page = pdf.addPage([612, 792])
  let y = 760
  for (const line of lines) {
    if (y < 36) {
      page = pdf.addPage([612, 792])
      y = 760
    }
    page.drawText(line.slice(0, 92), { x: 24, y, size: 7, font })
    y -= 10
  }
  page = pdf.addPage([612, 792])
  page.drawText('CONTINUATION: 13 W SYNTHETIC OTHER DEDUCTION (1,200)', { x: 24, y: 760, size: 8, font })
  page.drawText('CONTINUATION: 13 AE SYNTHETIC TRAILING MINUS 250-', { x: 24, y: 746, size: 8, font })
  return pdf.save()
}
