import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  partnershipsClient,
  type ListPartnershipsParams,
} from '../api/partnershipsClient'
import type {
  PartnershipDirectoryResponse,
  PartnershipDetail,
} from '../../../../../packages/types/src/partnership-management'

export type PartnershipFilters = {
  search: string
  entityId: string
  assetClass: string
  status: string[]
  sort: string
  page: number
  pageSize: number
}

const DEFAULT_FILTERS: PartnershipFilters = {
  search: '',
  entityId: '',
  assetClass: '',
  status: [],
  sort: 'name',
  page: 1,
  pageSize: 50,
}

function filtersFromSearch(params: URLSearchParams): PartnershipFilters {
  return {
    search: params.get('search') ?? '',
    entityId: params.get('entityId') ?? '',
    assetClass: params.get('assetClass') ?? '',
    status: params.getAll('status'),
    sort: params.get('sort') ?? 'name',
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 50),
  }
}

function filtersToSearch(filters: PartnershipFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.entityId) params.set('entityId', filters.entityId)
  if (filters.assetClass) params.set('assetClass', filters.assetClass)
  filters.status.forEach((s) => params.append('status', s))
  if (filters.sort && filters.sort !== 'name') params.set('sort', filters.sort)
  if (filters.page > 1) params.set('page', String(filters.page))
  if (filters.pageSize !== 50) params.set('pageSize', String(filters.pageSize))
  return params
}

function filtersToQueryParams(filters: PartnershipFilters): ListPartnershipsParams {
  return {
    search: filters.search || undefined,
    entityId: filters.entityId || undefined,
    assetClass: filters.assetClass || undefined,
    status: filters.status.length ? filters.status : undefined,
    sort: filters.sort || undefined,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export function usePartnershipList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<PartnershipFilters>(() =>
    filtersFromSearch(searchParams),
  )

  // Debounced search value (200ms per FR-005 / spec)
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateSearch = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, search: value, page: 1 }))
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 200)
  }, [])

  const updateFilter = useCallback(
    (key: keyof Omit<PartnershipFilters, 'search'>, value: PartnershipFilters[typeof key]) => {
      setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
      if (key !== 'search') {
        setDebouncedSearch((prev) => prev) // no debounce needed for non-search
      }
    },
    [],
  )

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setDebouncedSearch('')
  }, [])

  // Sync filter state → URL (replace so back doesn't re-fire)
  useEffect(() => {
    const effectiveFilters = { ...filters, search: debouncedSearch }
    setSearchParams(filtersToSearch(effectiveFilters), { replace: true })
  }, [filters, debouncedSearch, setSearchParams])

  const queryFilters = useMemo(
    () => filtersToQueryParams({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  )

  const query = useQuery<PartnershipDirectoryResponse, Error>({
    queryKey: ['partnerships-list', queryFilters],
    queryFn: () => partnershipsClient.list(queryFilters),
    placeholderData: (prev) => prev,
  })

  return {
    filters,
    updateSearch,
    updateFilter,
    clearFilters,
    query,
  }
}

export function usePartnershipNavigate() {
  const navigate = useNavigate()
  return (id: string) => navigate(`/partnerships/${id}`)
}

export function usePartnershipDetail(id: string | undefined) {
  return useQuery<PartnershipDetail, Error>({
    queryKey: ['partnership', id],
    queryFn: () => partnershipsClient.get(id!),
    enabled: !!id,
  })
}
