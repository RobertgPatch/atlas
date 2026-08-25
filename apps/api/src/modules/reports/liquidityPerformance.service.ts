import { liquidityValuationRepository } from '../market-data/liquidity-valuation.repository.js'
import { plaidRepository } from '../plaid/plaid.repository.js'
import type { ConsolidatedHoldingsReadContext } from './reports.repository.js'
import type { LiquidityPerformanceQuery } from './reports.zod.js'

interface LiquidityPerformancePoint {
  date: string
  totalMarketValue: number | null
  totalCostBasis: number | null
  totalUnrealizedGainLoss: number | null
  accountCount: number
  source: 'market_close' | 'daily_valuation' | 'custodian_snapshot'
  capturedAt: string | null
  priceAsOf: string | null
  pricedHoldingCount: number
  fallbackHoldingCount: number
}

interface LiquidityPerformanceResponse {
  points: LiquidityPerformancePoint[]
  availableFrom: string | null
  availableTo: string | null
  marketCloseAvailableFrom: string | null
}

const sumKnown = (values: Array<number | null>): number | null => {
  const known = values.filter((value): value is number => value != null)
  return known.length > 0 ? known.reduce((total, value) => total + value, 0) : null
}

const snapshotDate = (snapshot: {
  dataAsOfDate?: string | null
  completedAt: string | null
  startedAt: string
}): string =>
  snapshot.dataAsOfDate ?? snapshot.completedAt?.slice(0, 10) ?? snapshot.startedAt.slice(0, 10)

export const buildLiquidityPerformanceResponse = async (
  query: LiquidityPerformanceQuery,
  context: ConsolidatedHoldingsReadContext,
): Promise<LiquidityPerformanceResponse> => {
  const holdingsVisible = context.scope.isAdmin || context.scope.entityIds.length > 0
  const visibility = {
    actorUserId: context.actorUserId,
    isAdmin: context.scope.isAdmin,
  }
  const accounts = holdingsVisible
    ? plaidRepository.getSelectedInvestmentAccounts(visibility)
    : []
  const accountIds = accounts.map((account) => account.id)
  const accountIdSet = new Set(accountIds)
  const [snapshots, valuationPoints] = await Promise.all([
    plaidRepository.listDashboardHoldingsSnapshots({
      accountIds,
      fromDate: query.from,
      toDate: query.to,
    }),
    liquidityValuationRepository.listPerformancePoints({
      accountIds,
      toDate: query.to,
    }),
  ])
  const marketCloseAvailableFrom =
    valuationPoints.find((point) => point.source === 'market_close')?.date ?? null

  const pointByDate = new Map<string, LiquidityPerformancePoint>()
  for (const snapshot of snapshots) {
    const date = snapshotDate(snapshot)
    if (pointByDate.has(date)) continue

    const holdings = plaidRepository
      .listSourceHoldingsForSnapshot(snapshot.id)
      .filter((holding) => accountIdSet.has(holding.accountId))
    if (holdings.length === 0) continue

    pointByDate.set(date, {
      date,
      totalMarketValue: sumKnown(holdings.map((holding) => holding.marketValue)),
      totalCostBasis: sumKnown(holdings.map((holding) => holding.costBasis)),
      totalUnrealizedGainLoss: sumKnown(
        holdings.map((holding) => holding.unrealizedGainLoss),
      ),
      accountCount: new Set(holdings.map((holding) => holding.accountId)).size,
      source: 'custodian_snapshot',
      capturedAt: snapshot.completedAt ?? snapshot.startedAt,
      priceAsOf: snapshot.dataAsOfDate ?? null,
      pricedHoldingCount: 0,
      fallbackHoldingCount: holdings.length,
    })
  }

  for (const point of valuationPoints) {
    if (query.from && point.date < query.from) continue
    pointByDate.set(point.date, {
      ...point,
      source: point.source === 'market_close' ? 'market_close' : 'daily_valuation',
    })
  }

  const points = [...pointByDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  )

  return {
    points,
    availableFrom: points[0]?.date ?? null,
    availableTo: points.at(-1)?.date ?? null,
    marketCloseAvailableFrom,
  }
}
