import type { MagicWorkspaceArea } from '../partnership-tracker/components/magic-patterns/MagicPatternPartnershipWorkspace'

const validAreas = new Set<MagicWorkspaceArea>([
  'overview',
  'capital-activity',
  'valuations',
  'k1-history',
  'underlying-assets',
])

export function canonicalInvestmentTrackerArea(rawArea: string | null): MagicWorkspaceArea {
  if (rawArea && validAreas.has(rawArea as MagicWorkspaceArea)) return rawArea as MagicWorkspaceArea
  if (rawArea === 'cash-activity') return 'capital-activity'
  if (rawArea === 'k1') return 'k1-history'
  if (rawArea === 'capital') return 'valuations'
  if (rawArea === 'assets') return 'underlying-assets'
  return 'overview'
}

export function selectedInvestmentTrackerYear(rawYear: string | null): number | undefined {
  if (rawYear === null || rawYear.trim() === '') return undefined
  const year = Number(rawYear)
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : undefined
}

export function updateInvestmentTrackerQuery(
  current: URLSearchParams,
  changes: Record<string, string | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(changes)) {
    if (value == null) next.delete(key)
    else next.set(key, value)
  }
  return next
}
