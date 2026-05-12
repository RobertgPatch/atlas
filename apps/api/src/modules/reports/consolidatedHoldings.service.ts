import { plaidRepository, type SourceHoldingRecord } from '../plaid/plaid.repository.js'
import type { ConsolidatedHoldingsQuery } from './reports.zod.js'

type HoldingsSyncStatus =
  | 'never_synced'
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'needs_user_action'

interface ConsolidatedHoldingsKpis {
  totalMarketValue: number | null
  totalCostBasis: number | null
  totalUnrealizedGainLoss: number | null
  gainLossPercent: number | null
  uniqueAssetCount: number
  selectedAccountCount: number
}

interface CustodianHoldingDetailRow {
  id: string
  symbol: string | null
  description: string
  type: string
  custodian: string
  accountName: string
  accountMask: string | null
  quantity: number | null
  institutionPrice: number | null
  priceAsOfDate: string | null
  costBasis: number | null
  averageCostBasis: number | null
  unrealizedGainLoss: number | null
  gainLossPercent: number | null
  marketValue: number | null
}

interface ConsolidatedHoldingRow {
  id: string
  symbol: string | null
  description: string
  type: string
  custodianSummary: string
  quantity: number | null
  institutionPrice: number | null
  priceAsOfDate: string | null
  costBasis: number | null
  averageCostBasis: number | null
  unrealizedGainLoss: number | null
  gainLossPercent: number | null
  marketValue: number | null
  identityConfidence: 'high' | 'medium' | 'low'
  details: CustodianHoldingDetailRow[]
}

interface ConsolidatedHoldingsResponse {
  kpis: ConsolidatedHoldingsKpis
  rows: ConsolidatedHoldingRow[]
  page: {
    size: number
    offset: number
    total: number
  }
  selectedAccounts: ReturnType<typeof plaidRepository.getSelectedInvestmentAccounts>
  sync: {
    status: HoldingsSyncStatus
    lastSuccessfulSyncAt: string | null
    warnings: string[]
  }
}

const normalizeText = (value: string | null | undefined): string =>
  value?.trim().toUpperCase() ?? ''

const identityKeyFor = (holding: SourceHoldingRecord): {
  key: string
  confidence: 'high' | 'medium' | 'low'
} => {
  const cusip = normalizeText(holding.cusip)
  if (cusip) return { key: `CUSIP:${cusip}`, confidence: 'high' }

  const isin = normalizeText(holding.isin)
  if (isin) return { key: `ISIN:${isin}`, confidence: 'high' }

  const symbol = normalizeText(holding.symbol)
  if (symbol) {
    return {
      key: `SYMBOL:${symbol}:${normalizeText(holding.currencyCode)}:${normalizeText(holding.type)}`,
      confidence: 'medium',
    }
  }

  return {
    key: `NAME:${normalizeText(holding.description)}:${normalizeText(holding.type)}`,
    confidence: 'low',
  }
}

const sumKnown = (values: Array<number | null>): number | null => {
  const known = values.filter((value): value is number => value != null)
  if (known.length === 0) return null
  return known.reduce((sum, value) => sum + value, 0)
}

const latestDate = (values: Array<string | null>): string | null => {
  const known = values.filter((value): value is string => Boolean(value))
  if (known.length === 0) return null
  return known.sort((a, b) => b.localeCompare(a))[0]!
}

const gainLossStateFor = (row: ConsolidatedHoldingRow): string => {
  if (row.unrealizedGainLoss == null) return 'unknown'
  if (row.unrealizedGainLoss > 0) return 'gain'
  if (row.unrealizedGainLoss < 0) return 'loss'
  return 'flat'
}

const sortAccessors: Record<
  NonNullable<ConsolidatedHoldingsQuery['sort']>,
  (row: ConsolidatedHoldingRow) => string | number | null
> = {
  symbol: (row) => row.symbol,
  type: (row) => row.type,
  quantity: (row) => row.quantity,
  costBasis: (row) => row.costBasis,
  unrealizedGainLoss: (row) => row.unrealizedGainLoss,
  marketValue: (row) => row.marketValue,
}

const compareValues = (
  a: string | number | null,
  b: string | number | null,
  direction: 'asc' | 'desc',
): number => {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  const result =
    typeof a === 'string' || typeof b === 'string'
      ? String(a).localeCompare(String(b))
      : a - b

  return direction === 'asc' ? result : -result
}

export const buildConsolidatedHoldingsResponse = (
  query: ConsolidatedHoldingsQuery,
): ConsolidatedHoldingsResponse => {
  const accounts = plaidRepository.getSelectedInvestmentAccounts()
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const filteredSource = plaidRepository
    .listSourceHoldingsForSelectedAccounts()
    .filter((holding) => {
      const account = accountById.get(holding.accountId)
      if (!account) return false
      if (query.accountId && holding.accountId !== query.accountId) return false
      if (query.custodian && account.custodianName !== query.custodian) return false
      if (query.type && holding.type !== query.type) return false
      if (query.search) {
        const q = query.search.toLowerCase()
        const haystack = `${holding.symbol ?? ''} ${holding.description}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

  const groups = new Map<
    string,
    { confidence: 'high' | 'medium' | 'low'; holdings: SourceHoldingRecord[] }
  >()

  for (const holding of filteredSource) {
    const identity = identityKeyFor(holding)
    const group = groups.get(identity.key)
    if (group) {
      group.holdings.push(holding)
      if (group.confidence !== 'low') group.confidence = identity.confidence
    } else {
      groups.set(identity.key, { confidence: identity.confidence, holdings: [holding] })
    }
  }

  const rows: ConsolidatedHoldingRow[] = [...groups.entries()].map(([key, group]) => {
    const first = group.holdings[0]!
    const quantity = sumKnown(group.holdings.map((holding) => holding.quantity))
    const costBasis = sumKnown(group.holdings.map((holding) => holding.costBasis))
    const marketValue = sumKnown(group.holdings.map((holding) => holding.marketValue))
    const unrealizedGainLoss = sumKnown(
      group.holdings.map((holding) => holding.unrealizedGainLoss),
    )
    const institutionPrice =
      marketValue != null && quantity != null && quantity !== 0
        ? marketValue / quantity
        : first.institutionPrice
    const priceAsOfDate = latestDate(group.holdings.map((holding) => holding.asOfDate))
    const averageCostBasis =
      quantity != null && quantity !== 0 && costBasis != null ? costBasis / quantity : null
    const gainLossPercent =
      costBasis != null && costBasis !== 0 && unrealizedGainLoss != null
        ? (unrealizedGainLoss / costBasis) * 100
        : null

    const details: CustodianHoldingDetailRow[] = group.holdings.map((holding) => {
      const account = accountById.get(holding.accountId)
      const detailAverage =
        holding.quantity != null && holding.quantity !== 0 && holding.costBasis != null
          ? holding.costBasis / holding.quantity
          : null
      const detailGainLossPercent =
        holding.costBasis != null &&
        holding.costBasis !== 0 &&
        holding.unrealizedGainLoss != null
          ? (holding.unrealizedGainLoss / holding.costBasis) * 100
          : null

      return {
        id: holding.id,
        symbol: holding.symbol,
        description: holding.description,
        type: holding.type,
        custodian: account?.custodianName ?? 'Unknown',
        accountName: account?.name ?? 'Unknown account',
        accountMask: account?.mask ?? null,
        quantity: holding.quantity,
        institutionPrice: holding.institutionPrice,
        priceAsOfDate: holding.asOfDate,
        costBasis: holding.costBasis,
        averageCostBasis: detailAverage,
        unrealizedGainLoss: holding.unrealizedGainLoss,
        gainLossPercent: detailGainLossPercent,
        marketValue: holding.marketValue,
      }
    })

    const custodians = new Set(details.map((detail) => detail.custodian))

    return {
      id: key,
      symbol: first.symbol,
      description: first.description,
      type: first.type,
      custodianSummary:
        custodians.size === 1
          ? [...custodians][0]!
          : `${group.holdings.length} accounts`,
      quantity,
      institutionPrice,
      priceAsOfDate,
      costBasis,
      averageCostBasis,
      unrealizedGainLoss,
      gainLossPercent,
      marketValue,
      identityConfidence: group.confidence,
      details,
    }
  })

  const gainFiltered = query.gainLossState
    ? rows.filter((row) => gainLossStateFor(row) === query.gainLossState)
    : rows

  const sort = query.sort ?? 'marketValue'
  const direction = query.direction ?? 'desc'
  const sorted = [...gainFiltered].sort((a, b) =>
    compareValues(sortAccessors[sort](a), sortAccessors[sort](b), direction),
  )

  const pageSize = query.pageSize ?? 50
  const page = query.page ?? 1
  const offset = (page - 1) * pageSize
  const paged = sorted.slice(offset, offset + pageSize)

  const kpis: ConsolidatedHoldingsKpis = {
    totalMarketValue: sumKnown(gainFiltered.map((row) => row.marketValue)),
    totalCostBasis: sumKnown(gainFiltered.map((row) => row.costBasis)),
    totalUnrealizedGainLoss: sumKnown(gainFiltered.map((row) => row.unrealizedGainLoss)),
    gainLossPercent: null,
    uniqueAssetCount: gainFiltered.length,
    selectedAccountCount: accounts.length,
  }
  kpis.gainLossPercent =
    kpis.totalCostBasis != null &&
    kpis.totalCostBasis !== 0 &&
    kpis.totalUnrealizedGainLoss != null
      ? (kpis.totalUnrealizedGainLoss / kpis.totalCostBasis) * 100
      : null

  const latestSync = plaidRepository.getLatestSync()
  const failedAccounts = accounts.filter((account) => account.syncStatus === 'failed')
  const needsAction = accounts.filter(
    (account) => account.syncStatus === 'needs_user_action',
  )
  const status: HoldingsSyncStatus =
    needsAction.length > 0
      ? 'needs_user_action'
      : failedAccounts.length > 0
        ? rows.length > 0
          ? 'partial_success'
          : 'failed'
        : latestSync?.status === 'success'
          ? 'success'
          : 'never_synced'

  return {
    kpis,
    rows: paged,
    page: {
      size: pageSize,
      offset,
      total: gainFiltered.length,
    },
    selectedAccounts: accounts,
    sync: {
      status,
      lastSuccessfulSyncAt: latestSync?.completedAt ?? null,
      warnings: [
        ...failedAccounts.map((account) => `${account.custodianName} ${account.name} failed to sync.`),
        ...needsAction.map((account) => `${account.custodianName} ${account.name} needs reconnection.`),
      ],
    },
  }
}
