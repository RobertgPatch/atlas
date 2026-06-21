import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  pageSize: 5000,
}

const toQuery = (filters: ConsolidatedHoldingsFilters): ConsolidatedHoldingsQuery => ({
  search: filters.search || undefined,
  custodian: filters.custodian || undefined,
  accountId: filters.accountId || undefined,
  type: filters.type || undefined,
  gainLossState: filters.gainLossState || undefined,
  page: 1,
  pageSize: filters.pageSize,
})

export const consolidatedHoldingsKeys = {
  report: (query: ConsolidatedHoldingsQuery) =>
    ['reports', 'consolidated-holdings', query] as const,
}

export const useConsolidatedHoldings = () => {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<ConsolidatedHoldingsFilters>(DEFAULT_FILTERS)
  const queryInput = useMemo(() => toQuery(filters), [filters])

  const query = useQuery({
    queryKey: consolidatedHoldingsKeys.report(queryInput),
    queryFn: () => reportsClient.getConsolidatedHoldings(queryInput),
    placeholderData: (previous) => previous,
  })

  const refresh = useMutation({
    mutationFn: () => reportsClient.refreshConsolidatedHoldings(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports', 'consolidated-holdings'] })
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
    updateFilter,
    clearFilters,
  }
}
