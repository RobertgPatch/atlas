import { liquiditySourceHistory } from '../liquidity-sources/liquidity-source-history.js'
import type { ConsolidatedHoldingsReadContext } from './reports.repository.js'
import type { LiquidityPerformanceQuery } from './reports.zod.js'

export const buildLiquidityPerformanceResponse = async (
  query: LiquidityPerformanceQuery,
  context: ConsolidatedHoldingsReadContext,
) => (await liquiditySourceHistory({userId:context.actorUserId,...context.scope},query)) ?? {
  points: [],
  availableFrom: null,
  availableTo: null,
  marketCloseAvailableFrom: null,
}
