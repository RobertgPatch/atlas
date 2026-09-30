export const EQUITY_SECTORS = [
  'Communication Services', 'Consumer Discretionary', 'Consumer Staples',
  'Energy', 'Financials', 'Health Care', 'Industrials', 'Materials',
  'Real Estate', 'Utilities', 'Technology',
] as const

export type EquitySector = (typeof EQUITY_SECTORS)[number]
export const SECTOR_FILTER_OPTIONS = [...EQUITY_SECTORS, 'Unclassified'] as const
export type SectorFilterOption = (typeof SECTOR_FILTER_OPTIONS)[number]

export const normalizeSectorSymbol = (symbol: string | null): string =>
  (symbol ?? '').trim().toUpperCase().replace(/[\s/-]+/g, '.')

export interface SectorAssignment {
  symbol: string
  /** null restores automatic classification; the version is retained. */
  sector: SectorFilterOption | null
  version: number
  updatedAt: string
}

export interface SaveSectorAssignment {
  sector: SectorFilterOption | null
  /** Zero means no assignment has ever been saved for this symbol. */
  expectedVersion: number
}
