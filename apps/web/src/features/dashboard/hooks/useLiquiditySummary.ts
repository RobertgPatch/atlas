import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConsolidatedHoldingsQuery } from '../../../../../../packages/types/src/reports'
import { reportsClient } from '../../reports/api/reportsClient'
import { consolidatedHoldingsKeys } from '../../reports/hooks/useConsolidatedHoldings'

export const LIQUIDITY_SUMMARY_QUERY = {
  sort: 'marketValue',
  direction: 'desc',
  page: 1,
  pageSize: 1,
} as const satisfies ConsolidatedHoldingsQuery

const LIQUIDITY_SUMMARY_QUERY_KEY = consolidatedHoldingsKeys.report(LIQUIDITY_SUMMARY_QUERY)

export const useLiquiditySummary = () => {
  const queryClient = useQueryClient()
  const startedLiveRefresh = useRef(false)
  const [liveRefreshing, setLiveRefreshing] = useState(false)
  const queryKey = LIQUIDITY_SUMMARY_QUERY_KEY
  const query = useQuery({
    queryKey,
    queryFn: () => reportsClient.getConsolidatedHoldings(
      LIQUIDITY_SUMMARY_QUERY,
      { pricingMode: 'saved' },
    ),
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const refreshLive = useCallback(async () => {
    setLiveRefreshing(true)
    try {
      const refreshed = await reportsClient.getConsolidatedHoldings(
        LIQUIDITY_SUMMARY_QUERY,
        { pricingMode: 'refresh' },
      )
      queryClient.setQueryData(queryKey, refreshed)
      return refreshed
    } finally {
      setLiveRefreshing(false)
    }
  }, [queryClient, queryKey])

  useEffect(() => {
    if (!query.data || startedLiveRefresh.current) return
    startedLiveRefresh.current = true
    void refreshLive().catch(() => undefined)
  }, [query.data, refreshLive])

  return {
    ...query,
    isFetching: query.isFetching || liveRefreshing,
    refetch: refreshLive,
  }
}
