import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConsolidatedHoldingsQuery } from '../../../../../../packages/types/src/reports'
import { reportsClient } from '../api/reportsClient'

export interface ConsolidatedHoldingsFilters {
  search: string
  custodian: string
  accountId: string
  type: string
  gainLossState: '' | 'gain' | 'loss' | 'flat' | 'unknown'
  sort: NonNullable<ConsolidatedHoldingsQuery['sort']>
  direction: 'asc' | 'desc'
  page: number
  pageSize: number
}

const DEFAULT_FILTERS: ConsolidatedHoldingsFilters = {
  search: '',
  custodian: '',
  accountId: '',
  type: '',
  gainLossState: '',
  sort: 'symbol',
  direction: 'asc',
  page: 1,
  // Match the API's bounded report-page maximum. A larger value is rejected
  // before the holdings query runs and leaves the Liquidity dashboard empty.
  pageSize: 1000,
}

const toQuery = (filters: ConsolidatedHoldingsFilters): ConsolidatedHoldingsQuery => ({
  search: filters.search || undefined,
  custodian: filters.custodian || undefined,
  accountId: filters.accountId || undefined,
  type: filters.type || undefined,
  gainLossState: filters.gainLossState || undefined,
  sort: filters.sort,
  direction: filters.direction,
  page: filters.page,
  pageSize: filters.pageSize,
})

export const consolidatedHoldingsKeys = {
  report: (query: ConsolidatedHoldingsQuery) =>
    ['reports', 'consolidated-holdings', query] as const,
}

export const useConsolidatedHoldings = () => {
  const queryClient = useQueryClient()
  const startedMarketRefresh = useRef(false)
  const [isMarketRefreshing, setIsMarketRefreshing] = useState(false)
  const [filters, setFilters] = useState<ConsolidatedHoldingsFilters>(DEFAULT_FILTERS)
  const queryInput = useMemo(() => toQuery(filters), [filters])
  const queryKey = useMemo(
    () => consolidatedHoldingsKeys.report(queryInput),
    [queryInput],
  )

  const query = useQuery({
    queryKey,
    queryFn: () =>
      reportsClient.getConsolidatedHoldings(queryInput, { pricingMode: 'saved' }),
    placeholderData: (previous) => previous,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const refreshMarketValues = useCallback(async () => {
    setIsMarketRefreshing(true)
    try {
      const refreshed = await reportsClient.getConsolidatedHoldings(queryInput, {
        pricingMode: 'refresh',
      })
      queryClient.setQueryData(queryKey, refreshed)
      await queryClient.invalidateQueries({
        queryKey: ['reports', 'liquidity-performance'],
      })
      return refreshed
    } finally {
      setIsMarketRefreshing(false)
    }
  }, [queryClient, queryInput, queryKey])

  useEffect(() => {
    if (!query.data || startedMarketRefresh.current) return
    startedMarketRefresh.current = true
    void refreshMarketValues().catch(() => {
      // Keep the saved values visible when the market-data provider is unavailable.
    })
  }, [query.data, refreshMarketValues])

  const refresh = useMutation({
    mutationFn: (input?: { force?: boolean }) =>
      reportsClient.refreshConsolidatedHoldings(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports', 'consolidated-holdings'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'liquidity-performance'] })
      void queryClient.invalidateQueries({ queryKey: ['plaid', 'investment-accounts'] })
    },
  })

  const updateFilter = <K extends keyof ConsolidatedHoldingsFilters>(
    key: K,
    value: ConsolidatedHoldingsFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
  }

  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  return {
    filters,
    queryInput,
    query,
    refresh,
    refreshMarketValues,
    isMarketRefreshing,
    updateFilter,
    clearFilters,
  }
}
