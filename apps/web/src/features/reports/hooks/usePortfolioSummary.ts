import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ReportsQueryBase } from '../../../../../../packages/types/src/reports'
import { reportsClient } from '../api/reportsClient'

export interface PortfolioSummaryFilters {
  search: string
  dateRange: string
  entityType: string
  entityId: string
  sort: string
  direction: 'asc' | 'desc'
  page: number
  pageSize: number
}

const DEFAULT_FILTERS: PortfolioSummaryFilters = {
  search: '',
  dateRange: 'all',
  entityType: '',
  entityId: '',
  sort: 'entityName',
  direction: 'asc',
  page: 1,
  pageSize: 50,
}

const fromSearchParams = (params: URLSearchParams): PortfolioSummaryFilters => {
  const directionValue = params.get('direction')
  return {
    search: params.get('search') ?? '',
    dateRange: params.get('dateRange') ?? 'all',
    entityType: params.get('entityType') ?? '',
    entityId: params.get('entityId') ?? '',
    sort: params.get('sort') ?? 'entityName',
    direction: directionValue === 'desc' ? 'desc' : 'asc',
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 50),
  }
}

const toSearchParams = (filters: PortfolioSummaryFilters): URLSearchParams => {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.dateRange && filters.dateRange !== 'all') params.set('dateRange', filters.dateRange)
  if (filters.entityType) params.set('entityType', filters.entityType)
  if (filters.entityId) params.set('entityId', filters.entityId)
  if (filters.sort && filters.sort !== 'entityName') params.set('sort', filters.sort)
  if (filters.direction !== 'asc') params.set('direction', filters.direction)
  if (filters.page > 1) params.set('page', String(filters.page))
  if (filters.pageSize !== 50) params.set('pageSize', String(filters.pageSize))
  return params
}

const toQueryInput = (filters: PortfolioSummaryFilters): ReportsQueryBase => ({
  search: filters.search || undefined,
  dateRange: filters.dateRange || undefined,
  entityType: filters.entityType || undefined,
  entityId: filters.entityId || undefined,
  sort: filters.sort,
  direction: filters.direction,
  page: filters.page,
  pageSize: filters.pageSize,
})

export const reportsKeys = {
  portfolioSummary: (filters: ReportsQueryBase) => ['reports', 'portfolio-summary', filters] as const,
  assetClassSummary: (filters: ReportsQueryBase) => ['reports', 'asset-class-summary', filters] as const,
}

export const usePortfolioSummary = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<PortfolioSummaryFilters>(() =>
    fromSearchParams(searchParams),
  )

  useEffect(() => {
    setSearchParams(toSearchParams(filters), { replace: true })
  }, [filters, setSearchParams])

  const queryInput = useMemo(() => toQueryInput(filters), [filters])

  const query = useQuery({
    queryKey: reportsKeys.portfolioSummary(queryInput),
    queryFn: () => reportsClient.getPortfolioSummary(queryInput),
    placeholderData: (previous) => previous,
  })

  const updateSearch = useCallback((search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }))
  }, [])

  const updateFilter = useCallback(
    <K extends keyof Omit<PortfolioSummaryFilters, 'search'>>(
      key: K,
      value: PortfolioSummaryFilters[K],
    ) => {
      setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
    },
    [],
  )

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
  }, [])

  return {
    filters,
    queryInput,
    query,
    updateSearch,
    updateFilter,
    clearFilters,
  }
}
