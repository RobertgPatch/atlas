import { normalizeSectorSymbol, type SectorAssignment, type SectorFilterOption } from '../../../../../../packages/types/src/liquidity-sectors'
import type { ConsolidatedHoldingRow } from '../../../../../../packages/types/src/reports'
import { inferAssetClass, inferEquitySector } from './consolidatedHoldingsAnalytics'

export type SectorManagementStock = {
  symbol: string
  description: string
  automaticSector: SectorFilterOption
  sector: SectorFilterOption
  assignment?: SectorAssignment
}

export function sectorManagementStocks(rows: ConsolidatedHoldingRow[], assignments: SectorAssignment[]): SectorManagementStock[] {
  const bySymbol = new Map<string, SectorManagementStock>()
  const overrides = new Map(assignments.map((item) => [item.symbol, item]))
  for (const row of rows) {
    if (inferAssetClass(row) !== 'Equities' || !row.symbol) continue
    const symbol = normalizeSectorSymbol(row.symbol)
    if (!/^[A-Z0-9][A-Z0-9.]{0,31}$/.test(symbol)) continue
    const automaticSector = inferEquitySector({ ...row, sectorOverride: null }) ?? 'Unclassified'
    const assignment = overrides.get(symbol)
    const existing = bySymbol.get(symbol)
    // A catalog match is identical across custodians. Conflicting non-catalog
    // source sectors remain unclassified until an administrator resolves them.
    const automatic = existing && existing.automaticSector !== automaticSector ? 'Unclassified' : automaticSector
    bySymbol.set(symbol, {
      symbol, description: existing?.description ?? row.description, automaticSector: automatic,
      sector: assignment?.sector ?? automatic, assignment,
    })
  }
  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
}
