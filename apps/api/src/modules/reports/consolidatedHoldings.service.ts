import { config } from '../../config.js'
import { readLiquiditySources } from '../liquidity-sources/liquidity-source.read.js'
import type { ReportSourceAccount,SourceHoldingRecord } from '../liquidity-sources/liquidity-source.types.js'
import type { Coverage,PricingCapability } from '../liquidity-statements/liquidity-statement.types.js'
import { decimal,format,sum,divide } from '../liquidity-statements/csv/decimal.js'
import { hash } from '../liquidity-statements/liquidity-statement.repository.js'
import { recordCsvReportState } from '../liquidity-statements/csv-observability.js'
import { marketDataService } from '../market-data/market-data.service.js'
import type { HoldingsPricingMetadata } from '../market-data/market-data.types.js'
import type { ConsolidatedHoldingsQuery } from './reports.zod.js'
import type { ReportsScope } from './reports.repository.js'

type HoldingsSyncStatus =
  | 'never_synced'
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'needs_user_action'
  | 'unavailable'

type HoldingsFreshnessStatus =
  | 'fresh'
  | 'stale'
  | 'refreshing'
  | 'failed'
  | 'unavailable'

interface ConsolidatedHoldingsKpis {
  totalMarketValue: number | null
  totalCostBasis: number | null
  totalUnrealizedGainLoss: number | null
  gainLossPercent: number | null
  uniqueAssetCount: number
  selectedAccountCount: number
}

interface CustodianHoldingDetailRow {
  exact?: SourceHoldingRecord['exact']
  currencyCode?: string | null
  sourceAsOfDate?: string | null
  id: string
  symbol: string | null
  securityIdentifier: string | null
  description: string
  type: string
  sector: string | null
  industry: string | null
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
  exact?: SourceHoldingRecord['exact']
  basisCoverage?: Coverage
  gainCoverage?: Coverage
  currencyCode?: string | null
  id: string
  symbol: string | null
  securityIdentifier: string | null
  description: string
  type: string
  sector: string | null
  industry: string | null
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
  selectedAccounts: ReportSourceAccount[]
  pricingCapability: PricingCapability
  sourceRevision: string
  coverage: { basis: Coverage; gain: Coverage; currencies: string[] }
  pricing: HoldingsPricingMetadata
  sync: {
    status: HoldingsSyncStatus
    freshnessStatus: HoldingsFreshnessStatus
    dataAsOfDate: string | null
    dataFetchedAt: string | null
    lastSuccessfulSyncAt: string | null
    nextRefreshAt: string | null
    activeRefreshId: string | null
    refreshing: boolean
    warnings: string[]
    refreshPolicy: { cadence:'on_demand'; automaticRefreshEnabled:false; manualRefreshEnabled:false }
  }
}

interface ConsolidatedHoldingsContext {
  actorUserId: string
  scope: ReportsScope
}

const normalizeText = (value: string | null | undefined): string =>
  value?.trim().toUpperCase() ?? ''

const isGenericUnknownDescription = (value: string | null | undefined): boolean => {
  const normalized = normalizeText(value)
  return normalized === 'UNKNOWN SECURITY' || normalized === 'UNIDENTIFIED HOLDING'
}

const hasSecurityIdentifier = (holding: SourceHoldingRecord): boolean =>
  Boolean(
    normalizeText(holding.cusip) ||
      normalizeText(holding.isin) ||
      normalizeText(holding.symbol),
  )

const securityIdentifierFor = (holding: SourceHoldingRecord): string | null => {
  const cusip = normalizeText(holding.cusip)
  if (cusip) return `CUSIP ${cusip}`

  const isin = normalizeText(holding.isin)
  if (isin) return `ISIN ${isin}`

  return null
}

const displaySymbolFor = (holding: SourceHoldingRecord): string | null => {
  const symbol = holding.symbol?.trim()
  if (symbol) return symbol

  const cusip = normalizeText(holding.cusip)
  if (cusip) return cusip

  const isin = normalizeText(holding.isin)
  if (isin) return isin

  return null
}

export const holdingIdentityKeyFor = (holding: SourceHoldingRecord): {
  key: string
  confidence: 'high' | 'medium' | 'low'
} => {
  const symbol = normalizeText(holding.symbol)
  if (symbol) {
    return {
      key: `SYMBOL:${symbol}`,
      confidence: 'medium',
    }
  }

  const cusip = normalizeText(holding.cusip)
  if (cusip) return { key: `CUSIP:${cusip}`, confidence: 'high' }

  const isin = normalizeText(holding.isin)
  if (isin) return { key: `ISIN:${isin}`, confidence: 'high' }

  if (isGenericUnknownDescription(holding.description) && !hasSecurityIdentifier(holding)) {
    return {
      key: `UNIDENTIFIED:${holding.accountId}:${holding.id}`,
      confidence: 'low',
    }
  }

  return {
    key: `NAME:${normalizeText(holding.description)}:${normalizeText(holding.type)}`,
    confidence: 'low',
  }
}

const displayDescriptionFor = (
  holding: SourceHoldingRecord,
  account: ReportSourceAccount | undefined,
): string => {
  if (!isGenericUnknownDescription(holding.description)) {
    return holding.description
  }

  const securityIdentifier = securityIdentifierFor(holding)
  if (securityIdentifier) return `Unidentified security (${securityIdentifier})`

  const accountLabel = account?.name ?? 'Unknown account'
  const maskLabel = account?.mask ? ` ****${account.mask}` : ''
  return `Unidentified holding - ${accountLabel}${maskLabel}`
}

const sumKnown = (values: Array<number | null>): number | null => {
  const known = values.filter((value): value is number => value != null)
  if (known.length === 0) return null
  return known.reduce((sum, value) => sum + value, 0)
}

const financialCoverage = (holdings: SourceHoldingRecord[], key: 'costBasis'|'unrealizedGainLoss'): Coverage => {
  const known=holdings.map(h=>h.exact?.[key] ?? (h[key]==null?null:String(h[key]))).filter((v):v is string=>v!=null)
  const subtotal=format(sum(known.map(v=>decimal(v)!))),unknown=holdings.length-known.length
  const mixedCurrencies=new Set(holdings.map(h=>h.currencyCode??'UNKNOWN')).size>1
  return {knownRows:known.length,unknownRows:unknown,estimatedRows:0,status:mixedCurrencies?'UNAVAILABLE':unknown===0?'COMPLETE':known.length?'PARTIAL':'UNAVAILABLE',knownSubtotal:mixedCurrencies?null:subtotal,total:unknown||mixedCurrencies?null:subtotal}
}
const exactTotal = (holdings: SourceHoldingRecord[], key: keyof NonNullable<SourceHoldingRecord['exact']>, complete=false): string|null => {
  const values=holdings.map(h=>h.exact?.[key] ?? (h[key]==null?null:String(h[key])))
  if(complete && values.some(v=>v==null))return null
  const known=values.filter((v):v is string=>v!=null)
  return known.length?format(sum(known.map(v=>decimal(v)!))):null
}

const latestDate = (values: Array<string | null>): string | null => {
  const known = values.filter((value): value is string => Boolean(value))
  if (known.length === 0) return null
  return known.sort((a, b) => b.localeCompare(a))[0]!
}

const firstKnownText = (values: Array<string | null | undefined>): string | null =>
  values.find((value): value is string => Boolean(value?.trim())) ?? null

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

export const buildConsolidatedHoldingsResponse = async (
  query: ConsolidatedHoldingsQuery,
  context: ConsolidatedHoldingsContext,
): Promise<ConsolidatedHoldingsResponse> => {
  const holdingsVisible =
    context.scope.isAdmin || context.scope.entityIds.length > 0
  const visibility = {
    actorUserId: context.actorUserId,
    isAdmin: context.scope.isAdmin,
  }
  const sources = holdingsVisible ? await readLiquiditySources({userId:context.actorUserId,...context.scope}) : {accounts:[],holdings:[],neutralAccounts:[]}
  const accounts = sources.accounts.filter(a=>(!query.accountId||a.id===query.accountId)&&(!query.custodian||a.custodianName===query.custodian))
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const selectedAccountIds = accounts.map((account) => account.id)
  const filteredHoldings = sources.holdings
    .filter((holding) => {
      const account = accountById.get(holding.accountId)
      if (!account) return false
      if (query.accountId && holding.accountId !== query.accountId) return false
      if (query.custodian && account.custodianName !== query.custodian) return false
      if (query.type && holding.type !== query.type) return false
      if (query.search) {
        const q = query.search.toLowerCase()
        const displayDescription = displayDescriptionFor(holding, account)
        const haystack =
          `${holding.symbol ?? ''} ${holding.description} ${displayDescription} ${account.custodianName} ${account.name} ${account.mask ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  const { holdings: filteredSource, pricing } =
    await marketDataService.priceHoldingsForRead(filteredHoldings, {
      refreshStale:
        config.nodeEnv !== 'production' && query.pricingMode !== 'saved',
      saveDailySnapshot:
        query.pricingMode === 'refresh' &&
        !query.search &&
        !query.custodian &&
        !query.accountId &&
        !query.type &&
        !query.gainLossState,
      selectedAccountIds,
    })

  const groups = new Map<
    string,
    { confidence: 'high' | 'medium' | 'low'; holdings: SourceHoldingRecord[] }
  >()

  for (const holding of filteredSource) {
    const identity = holdingIdentityKeyFor(holding)
    identity.key += `:${holding.currencyCode ?? 'UNKNOWN'}`
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
    const firstAccount = accountById.get(first.accountId)
    const exact={quantity:exactTotal(group.holdings,'quantity',true),costBasis:exactTotal(group.holdings,'costBasis',true),marketValue:exactTotal(group.holdings,'marketValue',true),unrealizedGainLoss:exactTotal(group.holdings,'unrealizedGainLoss',true),institutionPrice:null as string|null}
    const quantity=exact.quantity==null?null:Number(exact.quantity),costBasis=exact.costBasis==null?null:Number(exact.costBasis),marketValue=exact.marketValue==null?null:Number(exact.marketValue),unrealizedGainLoss=exact.unrealizedGainLoss==null?null:Number(exact.unrealizedGainLoss)
    const simpleUnits=group.holdings.every(h=>h.sourceKind!=='CSV'||['stock','equity','fund','cash','etf','mutual fund'].includes(h.type.toLowerCase()))
    exact.institutionPrice=simpleUnits&&exact.marketValue!=null&&exact.quantity!=null&&decimal(exact.quantity)!==0n?format(divide(decimal(exact.marketValue)!,decimal(exact.quantity)!)):group.holdings.length===1?first.exact?.institutionPrice??null:null
    const institutionPrice=exact.institutionPrice==null?first.institutionPrice:Number(exact.institutionPrice)
    const priceAsOfDate = latestDate(group.holdings.map((holding) => holding.asOfDate))
    const averageCostBasis =
      simpleUnits && quantity != null && quantity !== 0 && costBasis != null ? Number(format(divide(decimal(exact.costBasis!)!,decimal(exact.quantity!)!))) : null
    const gainLossPercent =
      costBasis != null && costBasis !== 0 && unrealizedGainLoss != null
        ? (unrealizedGainLoss / costBasis) * 100
        : null

    const details: CustodianHoldingDetailRow[] = group.holdings.map((holding) => {
      const account = accountById.get(holding.accountId)
      const detailAverage =
        simpleUnits && holding.quantity != null && holding.quantity !== 0 && holding.costBasis != null
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
        exact:holding.exact,
        currencyCode:holding.currencyCode,
        sourceAsOfDate:holding.sourceAsOfDate ?? holding.asOfDate,
        symbol: displaySymbolFor(holding),
        securityIdentifier: securityIdentifierFor(holding),
        description: displayDescriptionFor(holding, account),
        type: holding.type,
        sector: holding.sector,
        industry: holding.industry,
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
      exact,
      basisCoverage:financialCoverage(group.holdings,'costBasis'),
      gainCoverage:financialCoverage(group.holdings,'unrealizedGainLoss'),
      currencyCode:first.currencyCode,
      symbol: displaySymbolFor(first),
      securityIdentifier: securityIdentifierFor(first),
      description: displayDescriptionFor(first, firstAccount),
      type: first.type,
      sector: firstKnownText(group.holdings.map((holding) => holding.sector)),
      industry: firstKnownText(group.holdings.map((holding) => holding.industry)),
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
    totalCostBasis: gainFiltered.some(row=>row.costBasis==null)?null:sumKnown(gainFiltered.map((row) => row.costBasis)),
    totalUnrealizedGainLoss: gainFiltered.some(row=>row.unrealizedGainLoss==null)?null:sumKnown(gainFiltered.map((row) => row.unrealizedGainLoss)),
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

  const hasNeutral=sources.neutralAccounts.length>0
  recordCsvReportState(config.marketData.realTimeEquitiesEnabled,sources.neutralAccounts.filter(a=>a.nextExpectedDate&&a.nextExpectedDate<new Date().toISOString().slice(0,10)).length)
  const selectedRows=new Set(gainFiltered.flatMap(r=>r.details.map(d=>d.id)))
  const coverageHoldings=filteredSource.filter(h=>selectedRows.has(h.id))
  const currencyCodes=[...new Set(coverageHoldings.map(h=>h.currencyCode??'UNKNOWN'))]
  const basisCoverage=financialCoverage(coverageHoldings,'costBasis'),gainCoverage=financialCoverage(coverageHoldings,'unrealizedGainLoss')
  const missingSourceAccounts=sources.neutralAccounts.filter(a=>selectedAccountIds.includes(a.id)&&!a.latestSnapshotId)
  // Accounts with no snapshot have no values to add yet. Keep their coverage
  // warning, but do not hide the exact total from accounts that do have an
  // approved snapshot.
  kpis.totalMarketValue=currencyCodes.length>1?null:Number(exactTotal(coverageHoldings,'marketValue',true)??(hasNeutral&&coverageHoldings.length===0?'0':'NaN'))
  if(Number.isNaN(kpis.totalMarketValue))kpis.totalMarketValue=null
  kpis.totalCostBasis=currencyCodes.length>1||missingSourceAccounts.length||basisCoverage.total==null?null:Number(basisCoverage.total)
  kpis.totalUnrealizedGainLoss=currencyCodes.length>1||missingSourceAccounts.length||gainCoverage.total==null?null:Number(gainCoverage.total)
  kpis.gainLossPercent=kpis.totalCostBasis!=null&&kpis.totalCostBasis>0&&kpis.totalUnrealizedGainLoss!=null?Number(format(divide(decimal(gainCoverage.total!)!,decimal(basisCoverage.total!)!,12),12))*100:null
  const refreshPolicy={cadence:'on_demand',automaticRefreshEnabled:false,manualRefreshEnabled:false} as const

  return {
    kpis,
    rows: paged,
    page: {
      size: pageSize,
      offset,
      total: gainFiltered.length,
    },
    selectedAccounts: accounts,
    pricingCapability:{realTimeEquitiesEnabled:config.marketData.realTimeEquitiesEnabled,valuationMode:config.marketData.realTimeEquitiesEnabled?'CSV_WITH_EQUITY_QUOTES':'CSV_ONLY',revision:config.marketData.realTimeEquitiesEnabled?'equity-quotes-v1':'csv-only-v1'},
    sourceRevision:hash(sources.neutralAccounts.map(a=>[a.id,a.version,a.latestSnapshotId])),
    coverage:{basis:basisCoverage,gain:gainCoverage,currencies:currencyCodes},
    pricing,
    sync: {
      status: sources.neutralAccounts.some(a=>a.latestSnapshotId)?'success':'never_synced',
      freshnessStatus: sources.neutralAccounts.some(a=>a.nextExpectedDate&&a.nextExpectedDate<new Date().toISOString().slice(0,10))?'stale':sources.neutralAccounts.some(a=>a.latestSnapshotId)?'fresh':'unavailable',
      dataAsOfDate: sources.neutralAccounts.map(a=>a.holdingsAsOfDate).filter((v):v is string=>v!=null).sort().at(-1)??null,
      dataFetchedAt: sources.neutralAccounts.map(a=>a.uploadedAt).filter((v):v is string=>v!=null).sort().at(-1)??null,
      lastSuccessfulSyncAt: sources.neutralAccounts.map(a=>a.uploadedAt).filter((v):v is string=>v!=null).sort().at(-1)??null,
      nextRefreshAt: null,
      activeRefreshId: null,
      refreshing: false,
      warnings: [...(currencyCodes.length>1?['Multiple currencies are present; portfolio totals are unavailable without an FX convention.']:[]),...(missingSourceAccounts.length?[`${missingSourceAccounts.length} included account${missingSourceAccounts.length===1?' has':'s have'} no saved snapshot; totals include accounts with approved snapshots only.`]:[]),...sources.neutralAccounts.filter(a=>a.nextExpectedDate&&a.nextExpectedDate<new Date().toISOString().slice(0,10)).map(a=>`${a.custodian} ${a.name} is due for a new CSV.`)],
      refreshPolicy,
    },
  }
}
