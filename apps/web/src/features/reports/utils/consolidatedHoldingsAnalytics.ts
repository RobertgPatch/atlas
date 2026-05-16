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
  'Communication Services': '#6366f1',
  'Consumer Cyclical': '#8b5cf6',
  'Consumer Defensive': '#84cc16',
  'Financial Services': '#0ea5e9',
  Industrials: '#f97316',
  Energy: '#ef4444',
  Utilities: '#22c55e',
  'Real Estate': '#a855f7',
  Materials: '#64748b',
  'Broad Market': '#14b8a6',
  Equities: '#2563eb',
  Funds: '#7c3aed',
  'Fixed Income': '#4f46e5',
  Cash: '#059669',
  Cryptocurrency: '#f59e0b',
  Healthcare: '#10b981',
  Unidentified: '#f97316',
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
  'ASML',
  'QCOM',
  'TXN',
  'INTU',
  'NOW',
  'IBM',
  'CSCO',
  'AMAT',
  'LRCX',
  'MU',
  'INTC',
  'PANW',
  'SNOW',
  'PLTR',
])

const communicationSymbols = new Set([
  'GOOGL',
  'GOOG',
  'META',
  'NFLX',
  'DIS',
  'CMCSA',
  'T',
  'TMUS',
  'VZ',
])
const consumerCyclicalSymbols = new Set([
  'AMZN',
  'TSLA',
  'HD',
  'MCD',
  'NKE',
  'LOW',
  'SBUX',
  'BKNG',
  'CMG',
  'ORLY',
  'F',
  'GM',
])
const consumerDefensiveSymbols = new Set([
  'COST',
  'WMT',
  'PG',
  'KO',
  'PEP',
  'PM',
  'MO',
  'MDLZ',
  'CL',
  'TGT',
])
const financialSymbols = new Set([
  'JPM',
  'V',
  'MA',
  'BAC',
  'WFC',
  'GS',
  'MS',
  'BRK.B',
  'BRK-B',
  'SPGI',
  'BLK',
  'AXP',
  'C',
  'USB',
  'PNC',
  'SCHW',
  'COF',
])
const healthcareSymbols = new Set([
  'UNH',
  'JNJ',
  'LLY',
  'ABBV',
  'PFE',
  'MRK',
  'TMO',
  'ABT',
  'DHR',
  'AMGN',
])
const industrialSymbols = new Set([
  'BA',
  'CAT',
  'GE',
  'HON',
  'UPS',
  'RTX',
  'LMT',
  'UNP',
  'DE',
  'MMM',
])
const energySymbols = new Set(['XOM', 'CVX', 'COP', 'SLB', 'EOG'])
const utilitiesSymbols = new Set(['NEE', 'DUK', 'SO', 'AEP', 'EXC'])
const realEstateSymbols = new Set(['PLD', 'AMT', 'CCI', 'EQIX', 'SPG', 'O', 'PSA'])
const materialsSymbols = new Set(['LIN', 'APD', 'SHW', 'FCX', 'NEM', 'DD', 'DOW'])
const broadMarketSymbols = new Set([
  'VTI',
  'VOO',
  'SPY',
  'IVV',
  'SCHB',
  'ITOT',
  'VT',
  'ACWI',
  'QQQ',
  'DIA',
  'IWM',
])
const fixedIncomeSymbols = new Set([
  'BND',
  'AGG',
  'IEF',
  'TLT',
  'SHY',
  'MUB',
  'LQD',
  'HYG',
])
const cashSymbols = new Set(['SPAXX', 'VMFXX', 'SWVXX', 'FDRXX'])

const normalizePlaidSector = (sector: string | null | undefined): string | null => {
  const value = sector?.trim().toLowerCase()
  if (!value || value === 'miscellaneous' || value === 'other') return null

  if (value.includes('finance')) return 'Financial Services'
  if (value.includes('health')) return 'Healthcare'
  if (value.includes('technology') || value.includes('electronic')) return 'Technology'
  if (value.includes('communication')) return 'Communication Services'
  if (value.includes('consumer services') || value.includes('retail')) {
    return 'Consumer Cyclical'
  }
  if (value.includes('consumer non-durables')) return 'Consumer Defensive'
  if (value.includes('energy')) return 'Energy'
  if (value.includes('utilities')) return 'Utilities'
  if (value.includes('real estate')) return 'Real Estate'
  if (value.includes('materials') || value.includes('minerals')) return 'Materials'
  if (
    value.includes('industrial') ||
    value.includes('manufacturing') ||
    value.includes('transportation')
  ) {
    return 'Industrials'
  }

  return sector.trim()
}

const isFundType = (type: string): boolean =>
  type.includes('etf') || type.includes('fund')

const isUnidentifiedHolding = (row: ConsolidatedHoldingRow): boolean => {
  const description = row.description.toLowerCase()
  return (
    row.identityConfidence === 'low' &&
    !row.symbol &&
    (description.includes('unidentified holding') ||
      description.includes('unknown security'))
  )
}

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

  if (isUnidentifiedHolding(row)) return 'Unidentified'
  if (type.includes('cash') || cashSymbols.has(symbol) || description.includes('money market')) {
    return 'Cash'
  }
  if (type.includes('crypto')) return 'Cryptocurrency'
  if (
    type.includes('fixed') ||
    type.includes('bond') ||
    fixedIncomeSymbols.has(symbol) ||
    description.includes('bond') ||
    description.includes('treasury')
  ) {
    return 'Fixed Income'
  }
  if (broadMarketSymbols.has(symbol) || description.includes('total stock market')) {
    return 'Broad Market'
  }
  if (isFundType(type)) return 'Funds'

  const plaidSector = normalizePlaidSector(row.sector)
  if (plaidSector) return plaidSector

  if (communicationSymbols.has(symbol)) return 'Communication Services'
  if (technologySymbols.has(symbol)) return 'Technology'
  if (consumerCyclicalSymbols.has(symbol)) return 'Consumer Cyclical'
  if (consumerDefensiveSymbols.has(symbol)) return 'Consumer Defensive'
  if (financialSymbols.has(symbol)) return 'Financial Services'
  if (healthcareSymbols.has(symbol)) return 'Healthcare'
  if (industrialSymbols.has(symbol)) return 'Industrials'
  if (energySymbols.has(symbol)) return 'Energy'
  if (utilitiesSymbols.has(symbol)) return 'Utilities'
  if (realEstateSymbols.has(symbol)) return 'Real Estate'
  if (materialsSymbols.has(symbol)) return 'Materials'
  if (description.includes('health') || description.includes('pharma')) return 'Healthcare'
  if (type.includes('stock') || type.includes('equity')) return 'Equities'
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

  for (const account of response.selectedAccounts) {
    const existing = custodians.get(account.custodianName) ?? {
      value: 0,
      accounts: new Set<string>(),
      lastSyncedAt: null,
    }

    existing.accounts.add(account.id)
    if (
      account.lastSyncedAt &&
      (!existing.lastSyncedAt || account.lastSyncedAt > existing.lastSyncedAt)
    ) {
      existing.lastSyncedAt = account.lastSyncedAt
    }
    custodians.set(account.custodianName, existing)
  }

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
