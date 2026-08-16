import { useQuery } from '@tanstack/react-query'
import type { ConsolidatedHoldingsQuery } from '../../../../../../packages/types/src/reports'
import { reportsClient } from '../../reports/api/reportsClient'
import { consolidatedHoldingsKeys } from '../../reports/hooks/useConsolidatedHoldings'

export const LIQUIDITY_SUMMARY_QUERY = {
  sort: 'marketValue',
  direction: 'desc',
  page: 1,
  pageSize: 1,
} as const satisfies ConsolidatedHoldingsQuery

export const useLiquiditySummary = () =>
  useQuery({
    queryKey: consolidatedHoldingsKeys.report(LIQUIDITY_SUMMARY_QUERY),
    queryFn: () => reportsClient.getConsolidatedHoldings(LIQUIDITY_SUMMARY_QUERY),
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
