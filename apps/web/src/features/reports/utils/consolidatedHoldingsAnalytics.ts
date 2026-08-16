import type {
  ConsolidatedHoldingRow,
  ConsolidatedHoldingsResponse,
} from '../../../../../../packages/types/src/reports'

export type CostBasisStatus = 'complete' | 'partial' | 'missing'

export interface AllocationDatum {
  name: string
  value: number
  percentage: number
  color: string
  symbols?: string[]
}

export type SectorAllocationDatum = AllocationDatum

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

export const allocationColors: Record<string, string> = {
  Equities: '#2563eb',
  'ETFs & Funds': '#7c3aed',
  'Fixed Income': '#4f46e5',
  'Cash & Equivalents': '#059669',
  Cryptocurrency: '#f59e0b',
  Unidentified: '#f97316',
  Other: '#94a3b8',
  'Communication Services': '#0f766e',
  'Consumer Discretionary': '#7c3aed',
  'Consumer Staples': '#65a30d',
  Energy: '#ea580c',
  Financials: '#2563eb',
  'Health Care': '#dc2626',
  Industrials: '#475569',
  Materials: '#a16207',
  'Real Estate': '#c026d3',
  Utilities: '#0891b2',
  Technology: '#4f46e5',
  Unclassified: '#94a3b8',
}

export const EQUITY_SECTORS = [
  'Communication Services',
  'Consumer Discretionary',
  'Consumer Staples',
  'Energy',
  'Financials',
  'Health Care',
  'Industrials',
  'Materials',
  'Real Estate',
  'Utilities',
  'Technology',
] as const

export type EquitySector = (typeof EQUITY_SECTORS)[number]

/**
 * Known symbol assignments cover the supplied examples and take precedence
 * over the broader provider taxonomy stored on a holding.
 */
export const knownSectorBySymbol: Readonly<Record<string, EquitySector>> = {
  GOOGL: 'Communication Services',
  META: 'Communication Services',
  NFLX: 'Communication Services',
  TMUS: 'Communication Services',
  VZ: 'Communication Services',
  T: 'Communication Services',
  DIS: 'Communication Services',
  CMCSA: 'Communication Services',
  SPOT: 'Communication Services',
  WBD: 'Communication Services',

  AMZN: 'Consumer Discretionary',
  TSLA: 'Consumer Discretionary',
  HD: 'Consumer Discretionary',
  MCD: 'Consumer Discretionary',
  TJX: 'Consumer Discretionary',
  LOW: 'Consumer Discretionary',
  BKNG: 'Consumer Discretionary',
  SBUX: 'Consumer Discretionary',
  MAR: 'Consumer Discretionary',
  NKE: 'Consumer Discretionary',

  WMT: 'Consumer Staples',
  COST: 'Consumer Staples',
  PG: 'Consumer Staples',
  KO: 'Consumer Staples',
  PM: 'Consumer Staples',
  PEP: 'Consumer Staples',
  MO: 'Consumer Staples',
  MDLZ: 'Consumer Staples',
  MNST: 'Consumer Staples',
  CL: 'Consumer Staples',

  XOM: 'Energy',
  CVX: 'Energy',
  COP: 'Energy',
  WMB: 'Energy',
  SLB: 'Energy',
  KMI: 'Energy',
  EOG: 'Energy',
  PSX: 'Energy',
  VLO: 'Energy',
  BKR: 'Energy',

  'BRK.B': 'Financials',
  JPM: 'Financials',
  BAC: 'Financials',
  GS: 'Financials',
  MS: 'Financials',
  WFC: 'Financials',
  AXP: 'Financials',
  C: 'Financials',
  BLK: 'Financials',
  COF: 'Financials',

  LLY: 'Health Care',
  JNJ: 'Health Care',
  ABBV: 'Health Care',
  MRK: 'Health Care',
  UNH: 'Health Care',
  ABT: 'Health Care',
  GILD: 'Health Care',
  TMO: 'Health Care',
  ISRG: 'Health Care',

  CAT: 'Industrials',
  GE: 'Industrials',
  RTX: 'Industrials',
  GEV: 'Industrials',
  BA: 'Industrials',
  DE: 'Industrials',
  UNP: 'Industrials',
  HON: 'Industrials',
  ETN: 'Industrials',
  LMT: 'Industrials',

  LIN: 'Materials',
  SCCO: 'Materials',
  NEM: 'Materials',
  SHW: 'Materials',
  FCX: 'Materials',
  ECL: 'Materials',
  CRH: 'Materials',
  APD: 'Materials',
  AU: 'Materials',
  CTVA: 'Materials',

  WELL: 'Real Estate',
  PLD: 'Real Estate',
  EQIX: 'Real Estate',
  AMT: 'Real Estate',
  SPG: 'Real Estate',
  DLR: 'Real Estate',
  O: 'Real Estate',
  PSA: 'Real Estate',
  CBRE: 'Real Estate',
  VTR: 'Real Estate',

  NEE: 'Utilities',
  SO: 'Utilities',
  DUK: 'Utilities',
  CEG: 'Utilities',
  AEP: 'Utilities',
  SRE: 'Utilities',
  VST: 'Utilities',
  D: 'Utilities',
  EXC: 'Utilities',
  XEL: 'Utilities',

  NVDA: 'Technology',
  AAPL: 'Technology',
  MSFT: 'Technology',
  AVGO: 'Technology',
  V: 'Financials',
  MU: 'Technology',
  MA: 'Financials',
  ORCL: 'Technology',
  AMD: 'Technology',
  PLTR: 'Technology',
}

/** Provider records whose broad sector/industry labels need a known correction. */
const providerExceptionSectorBySymbol: Readonly<Record<string, EquitySector>> = {
  AER: 'Industrials',
  AMAT: 'Technology',
  BWA: 'Consumer Discretionary',
  CSGP: 'Real Estate',
  IREN: 'Technology',
  JBL: 'Technology',
  JOYY: 'Communication Services',
  KLAR: 'Financials',
  LDOS: 'Industrials',
  LRCX: 'Technology',
  MKSI: 'Technology',
  MSCI: 'Financials',
  NMRK: 'Real Estate',
  OMC: 'Communication Services',
  OSK: 'Industrials',
  RCAT: 'Industrials',
  ROKU: 'Communication Services',
  SHOP: 'Technology',
  SLDE: 'Financials',
  TGT: 'Consumer Staples',
  TRGP: 'Energy',
  URI: 'Industrials',
}

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
const cashSymbols = new Set(['CASH', 'SPAXX', 'VMFXX', 'SWVXX', 'FDRXX'])

const isFundType = (type: string): boolean =>
  type.includes('etf') || type.includes('fund')

const isEquityType = (type: string): boolean =>
  type.includes('stock') || type.includes('equity')

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

export function inferAssetClass(row: ConsolidatedHoldingRow): string {
  const symbol = (row.symbol ?? '').toUpperCase()
  const type = row.type.toLowerCase()
  const description = row.description.toLowerCase()

  if (isUnidentifiedHolding(row)) return 'Unidentified'
  if (type.includes('cash') || cashSymbols.has(symbol) || description.includes('money market')) {
    return 'Cash & Equivalents'
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
  if (isFundType(type)) return 'ETFs & Funds'
  if (isEquityType(type)) return 'Equities'
  return 'Other'
}

const normalizeSymbol = (symbol: string | null): string =>
  (symbol ?? '').trim().toUpperCase().replace('-', '.')

const canonicalSectorFromProvider = (sector: string): EquitySector | null => {
  const normalized = sector.trim().toLowerCase()
  const aliases: Record<string, EquitySector> = {
    communications: 'Communication Services',
    'communication services': 'Communication Services',
    'consumer discretionary': 'Consumer Discretionary',
    'consumer cyclical': 'Consumer Discretionary',
    'consumer staples': 'Consumer Staples',
    'consumer defensive': 'Consumer Staples',
    energy: 'Energy',
    financials: 'Financials',
    'financial services': 'Financials',
    healthcare: 'Health Care',
    'health care': 'Health Care',
    industrials: 'Industrials',
    materials: 'Materials',
    'basic materials': 'Materials',
    'real estate': 'Real Estate',
    utilities: 'Utilities',
    technology: 'Technology',
    'information technology': 'Technology',
  }

  return aliases[normalized] ?? null
}

export function inferEquitySector(row: ConsolidatedHoldingRow): EquitySector | null {
  const type = row.type.toLowerCase()
  if (!isEquityType(type) || isUnidentifiedHolding(row)) return null

  const symbol = normalizeSymbol(row.symbol)
  const symbolSector =
    knownSectorBySymbol[symbol] ?? providerExceptionSectorBySymbol[symbol]
  if (symbolSector) return symbolSector

  const sourceSector = (row.sector ?? '').trim()
  const industry = (row.industry ?? '').trim().toLowerCase()
  const canonicalSector = canonicalSectorFromProvider(sourceSector)
  if (canonicalSector) return canonicalSector

  if (industry.includes('real estate')) return 'Real Estate'
  if (
    industry.includes('broadcast') ||
    industry.includes('cable or satellite') ||
    industry.includes('movies or entertainment') ||
    industry.includes('advertising or marketing') ||
    industry.includes('internet software or services') ||
    (industry.includes('telecommunication') && !industry.includes('equipment'))
  ) {
    return 'Communication Services'
  }
  if (
    industry.includes('pharmaceutical') ||
    industry.includes('biotechnology') ||
    industry.includes('medical') ||
    industry.includes('hospital') ||
    industry.includes('managed health care')
  ) {
    return 'Health Care'
  }
  if (
    industry.includes('oil and gas') ||
    industry.includes('integrated oil') ||
    industry.includes('oil refining') ||
    industry.includes('oilfield')
  ) {
    return 'Energy'
  }
  if (
    industry.includes('electric utilities') ||
    industry.includes('gas distributors') ||
    industry.includes('power generation')
  ) {
    return 'Utilities'
  }
  if (
    industry.includes('bank') ||
    industry.includes('finance') ||
    industry.includes('insurance') ||
    industry.includes('investment manager')
  ) {
    return 'Financials'
  }
  if (
    industry.includes('metal') ||
    industry.includes('mineral') ||
    industry.includes('steel') ||
    industry.includes('aluminum') ||
    industry.includes('chemical') ||
    industry.includes('construction materials') ||
    industry.includes('container') ||
    industry.includes('packaging')
  ) {
    return 'Materials'
  }
  if (
    industry.includes('restaurant') ||
    industry.includes('hotel') ||
    industry.includes('resort') ||
    industry.includes('cruise') ||
    industry.includes('casino') ||
    industry.includes('gaming') ||
    industry.includes('homebuilding') ||
    industry.includes('motor vehicle') ||
    industry.includes('auto parts') ||
    industry.includes('apparel') ||
    industry.includes('footwear') ||
    industry.includes('department store') ||
    industry.includes('internet retail') ||
    industry.includes('specialty store')
  ) {
    return 'Consumer Discretionary'
  }
  if (
    industry.includes('food') ||
    industry.includes('meat or fish or dairy') ||
    industry.includes('tobacco') ||
    industry.includes('drugstore') ||
    industry.includes('discount store') ||
    industry.includes('agricultural commodities')
  ) {
    return 'Consumer Staples'
  }
  if (
    industry.includes('semiconductor') ||
    industry.includes('software') ||
    industry.includes('data processing') ||
    industry.includes('information technology') ||
    industry.includes('computer') ||
    industry.includes('electronic')
  ) {
    return 'Technology'
  }
  if (
    industry.includes('aerospace') ||
    industry.includes('defense') ||
    industry.includes('machinery') ||
    industry.includes('electrical products') ||
    industry.includes('engineering') ||
    industry.includes('construction') ||
    industry.includes('transportation') ||
    industry.includes('airline') ||
    industry.includes('courier') ||
    industry.includes('commercial services') ||
    industry.includes('wholesale distributor')
  ) {
    return 'Industrials'
  }

  const providerSector = sourceSector.toLowerCase()
  const providerSectorFallbacks: Record<string, EquitySector> = {
    'commercial services': 'Industrials',
    'consumer durables': 'Consumer Discretionary',
    'consumer non-durables': 'Consumer Staples',
    'consumer services': 'Consumer Discretionary',
    'distribution services': 'Industrials',
    'electronic technology': 'Technology',
    'energy & minerals': 'Energy',
    finance: 'Financials',
    'health services': 'Health Care',
    'health technology': 'Health Care',
    'industrial services': 'Industrials',
    'non-energy minerals': 'Materials',
    'process industries': 'Materials',
    'producer manufacturing': 'Industrials',
    'retail trade': 'Consumer Discretionary',
    'technology services': 'Technology',
    transportation: 'Industrials',
  }

  return providerSectorFallbacks[providerSector] ?? null
}

export function inferSector(row: ConsolidatedHoldingRow): string {
  return inferEquitySector(row) ?? inferAssetClass(row)
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

export function getAssetAllocation(
  rows: ConsolidatedHoldingRow[],
  totalValue: number,
): AllocationDatum[] {
  const allocationMap = new Map<string, number>()

  for (const row of rows) {
    const assetClass = inferAssetClass(row)
    allocationMap.set(
      assetClass,
      (allocationMap.get(assetClass) ?? 0) + (row.marketValue ?? 0),
    )
  }

  return [...allocationMap.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      color: allocationColors[name] ?? allocationColors.Other,
    }))
    .sort((a, b) => b.value - a.value)
}

export function getSectorAllocation(rows: ConsolidatedHoldingRow[]): SectorAllocationDatum[] {
  const sectorMap = new Map<string, { value: number; symbols: Set<string> }>()

  for (const row of rows) {
    const type = row.type.toLowerCase()
    if (!isEquityType(type) || isUnidentifiedHolding(row)) continue

    const sector = inferEquitySector(row) ?? 'Unclassified'
    const existing = sectorMap.get(sector) ?? { value: 0, symbols: new Set<string>() }
    existing.value += row.marketValue ?? 0
    existing.symbols.add(row.symbol?.trim().toUpperCase() || 'Unknown ticker')
    sectorMap.set(sector, existing)
  }

  const directStockValue = [...sectorMap.values()].reduce(
    (total, sector) => total + sector.value,
    0,
  )

  return [...sectorMap.entries()]
    .map(([name, data]) => ({
      name,
      value: data.value,
      percentage: directStockValue > 0 ? (data.value / directStockValue) * 100 : 0,
      color: allocationColors[name] ?? allocationColors.Unclassified,
      symbols: [...data.symbols].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.value - a.value)
}

export function filterHoldingsBySectors(
  rows: ConsolidatedHoldingRow[],
  sectors: readonly EquitySector[],
): ConsolidatedHoldingRow[] {
  const selected = new Set<EquitySector>(sectors)
  return rows.filter((row) => {
    const sector = inferEquitySector(row)
    return sector != null && selected.has(sector)
  })
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
