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
  const currentKey = useRef(queryKey)
  currentKey.current = queryKey

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      reportsClient.getConsolidatedHoldings(queryInput, { pricingMode: 'saved', signal }),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })

  const refreshMarketValues = useCallback(async () => {
    const requestKey = currentKey.current
    const before = queryClient.getQueryData(requestKey)
    setIsMarketRefreshing(true)
    try {
      await reportsClient.refreshConsolidatedHoldings()
      const refreshed = await reportsClient.getConsolidatedHoldings(queryInput, {
        pricingMode: 'saved',
      })
      // Do not let a request started before a server-mode change overwrite the
      // newer CSV-only response already in the query cache.
      const current = queryClient.getQueryData<typeof refreshed>(currentKey.current)
      if (currentKey.current !== requestKey || current !== before) return current
      if (current?.pricingCapability?.realTimeEquitiesEnabled === false && refreshed.pricingCapability?.realTimeEquitiesEnabled === true) return current
      queryClient.setQueryData(requestKey, refreshed)
      await queryClient.invalidateQueries({
        queryKey: ['reports', 'liquidity-performance'],
      })
      return refreshed
    } finally {
      setIsMarketRefreshing(false)
    }
  }, [queryClient, queryInput, queryKey])

  useEffect(() => {
    if (!query.data?.pricingCapability?.realTimeEquitiesEnabled || startedMarketRefresh.current) return
    startedMarketRefresh.current = true
    void refreshMarketValues().catch(() => {
      // Keep the saved values visible when the market-data provider is unavailable.
    })
  }, [query.data, refreshMarketValues])

  const refresh = useMutation({
    mutationFn: async (_input?: { force?: boolean }) => {
      if (query.data?.pricingCapability?.realTimeEquitiesEnabled) return refreshMarketValues()
      return query.refetch()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports', 'consolidated-holdings'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'liquidity-performance'] })
    },
  })

  const updateFilter = <K extends keyof ConsolidatedHoldingsFilters>(
    key: K,
    value: ConsolidatedHoldingsFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
  }

  const clearFilters = () => setFilters(DEFAULT_FILTERS)
  const setPage = (page: number) => setFilters(previous => ({ ...previous, page: Math.max(1, page) }))

  return {
    filters,
    queryInput,
    query,
    refresh,
    refreshMarketValues,
    isMarketRefreshing,
    updateFilter,
    clearFilters,
    setPage,
  }
}
