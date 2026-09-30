import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
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

const toQuery = (filters: ConsolidatedHoldingsFilters,entityId?:string): ConsolidatedHoldingsQuery => ({
  entityId,
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

export const useConsolidatedHoldings = (entityId?:string) => {
  const [filters, setFilters] = useState<ConsolidatedHoldingsFilters>(DEFAULT_FILTERS)
  const queryInput = useMemo(() => toQuery(filters,entityId), [entityId,filters])
  const queryKey = useMemo(
    () => consolidatedHoldingsKeys.report(queryInput),
    [queryInput],
  )
  const query = useQuery({
    queryKey,
    enabled:!!entityId,
    queryFn: ({ signal }) =>
      reportsClient.getConsolidatedHoldings(queryInput, { pricingMode: 'saved', signal }),
    staleTime: 30_000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
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
    updateFilter,
    clearFilters,
    setPage,
  }
}
