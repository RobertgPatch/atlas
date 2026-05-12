import type {
  ConsolidatedHoldingRow,
  ConsolidatedHoldingsResponse,
} from '../../../../../../packages/types/src/reports'

export type CostBasisStatus = 'complete' | 'partial' | 'missing'

export interface SectorAllocationDatum {
  name: string
  value: number
  percentage: number
  color: string
}

export interface CustodianBreakdownDatum {
  institution: string
  logo: string
  totalValue: number
  percentage: number
  accountCount: number
  lastSyncedAt: string | null
}

export interface TopHoldingDatum {
  id: string
  symbol: string
  description: string
  marketValue: number
  gainLossPercent: number | null
  costBasisStatus: CostBasisStatus
  weight: number
  sector: string
}

export const sectorColors: Record<string, string> = {
  Technology: '#3b82f6',
  'Consumer Cyclical': '#8b5cf6',
  'Financial Services': '#0ea5e9',
  'Broad Market': '#14b8a6',
  Healthcare: '#10b981',
  Other: '#94a3b8',
}

const technologySymbols = new Set([
  'AAPL',
  'GOOGL',
  'GOOG',
  'MSFT',
  'NVDA',
  'META',
  'AMD',
  'AVGO',
  'CRM',
  'ORCL',
  'ADBE',
])

const consumerCyclicalSymbols = new Set(['AMZN', 'TSLA', 'HD', 'MCD', 'NKE'])
const financialSymbols = new Set(['JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS'])
const broadMarketSymbols = new Set(['VTI', 'VOO', 'SPY', 'IVV', 'SCHB', 'ITOT'])

export function getCostBasisStatus(row: ConsolidatedHoldingRow): CostBasisStatus {
  if (row.details.length === 0) return row.costBasis == null ? 'missing' : 'complete'

  const knownDetails = row.details.filter((detail) => detail.costBasis != null)
  if (knownDetails.length === 0) return 'missing'
  if (knownDetails.length < row.details.length) return 'partial'
  return 'complete'
}

export function inferSector(row: ConsolidatedHoldingRow): string {
  const symbol = (row.symbol ?? '').toUpperCase()
  const type = row.type.toLowerCase()
  const description = row.description.toLowerCase()

  if (type.includes('etf') || broadMarketSymbols.has(symbol)) return 'Broad Market'
  if (technologySymbols.has(symbol)) return 'Technology'
  if (consumerCyclicalSymbols.has(symbol)) return 'Consumer Cyclical'
  if (financialSymbols.has(symbol)) return 'Financial Services'
  if (description.includes('health') || description.includes('pharma')) return 'Healthcare'
  return 'Other'
}

export function getCostBasisQuality(rows: ConsolidatedHoldingRow[]) {
  const detailRows = rows.flatMap((row) => row.details)
  const missingDetails = detailRows.filter((detail) => detail.costBasis == null)
  const affectedAccounts = new Set(
    missingDetails.map((detail) => `${detail.custodian}::${detail.accountName}`),
  )

  return {
    nullCostBasisCount: missingDetails.length,
    affectedAccountCount: affectedAccounts.size,
    costBasisIsPartial:
      missingDetails.length > 0 && missingDetails.length < Math.max(detailRows.length, 1),
  }
}

export function getSectorAllocation(
  rows: ConsolidatedHoldingRow[],
  totalValue: number,
): SectorAllocationDatum[] {
  const sectorMap = new Map<string, number>()

  for (const row of rows) {
    const sector = inferSector(row)
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + (row.marketValue ?? 0))
  }

  return [...sectorMap.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      color: sectorColors[name] ?? sectorColors.Other,
    }))
    .sort((a, b) => b.value - a.value)
}

export function getCustodianBreakdown(
  response: ConsolidatedHoldingsResponse,
  totalValue: number,
): CustodianBreakdownDatum[] {
  const accountByName = new Map(
    response.selectedAccounts.map((account) => [
      `${account.custodianName}::${account.name}`,
      account,
    ]),
  )
  const custodians = new Map<
    string,
    { value: number; accounts: Set<string>; lastSyncedAt: string | null }
  >()

  for (const row of response.rows) {
    for (const detail of row.details) {
      const account = accountByName.get(`${detail.custodian}::${detail.accountName}`)
      const accountId = account?.id ?? `${detail.custodian}:${detail.accountName}`
      const existing = custodians.get(detail.custodian) ?? {
        value: 0,
        accounts: new Set<string>(),
        lastSyncedAt: null,
      }

      existing.value += detail.marketValue ?? 0
      existing.accounts.add(accountId)
      if (
        account?.lastSyncedAt &&
        (!existing.lastSyncedAt || account.lastSyncedAt > existing.lastSyncedAt)
      ) {
        existing.lastSyncedAt = account.lastSyncedAt
      }
      custodians.set(detail.custodian, existing)
    }
  }

  return [...custodians.entries()]
    .map(([institution, data]) => ({
      institution,
      logo: institution
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      totalValue: data.value,
      percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      accountCount: data.accounts.size,
      lastSyncedAt: data.lastSyncedAt,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
}

export function getTopHoldings(
  rows: ConsolidatedHoldingRow[],
  totalValue: number,
): TopHoldingDatum[] {
  return [...rows]
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      symbol: row.symbol ?? 'N/A',
      description: row.description,
      marketValue: row.marketValue ?? 0,
      gainLossPercent: row.gainLossPercent,
      costBasisStatus: getCostBasisStatus(row),
      weight: totalValue > 0 ? ((row.marketValue ?? 0) / totalValue) * 100 : 0,
      sector: inferSector(row),
    }))
}
