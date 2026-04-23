import { useCallback } from 'react'
import { partnershipsClient } from '../api/partnershipsClient'
import type { PartnershipFilters } from './usePartnershipQueries'

export function usePartnershipExport(filters: Pick<PartnershipFilters, 'search' | 'entityId' | 'assetClass' | 'status'>) {
  return useCallback(() => {
    const url = partnershipsClient.exportCsvUrl({
      search: filters.search || undefined,
      entityId: filters.entityId || undefined,
      assetClass: filters.assetClass || undefined,
      status: filters.status.length ? filters.status : undefined,
    })
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [filters.search, filters.entityId, filters.assetClass, filters.status])
}
