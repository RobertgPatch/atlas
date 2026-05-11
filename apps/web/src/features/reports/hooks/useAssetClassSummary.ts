import { useQuery } from '@tanstack/react-query'
import type { ReportsQueryBase } from '../../../../../../packages/types/src/reports'
import { reportsClient } from '../api/reportsClient'
import { reportsKeys } from './usePortfolioSummary'

export const useAssetClassSummary = (
  filters: ReportsQueryBase,
  enabled = true,
) =>
  useQuery({
    queryKey: reportsKeys.assetClassSummary(filters),
    queryFn: () => reportsClient.getAssetClassSummary(filters),
    placeholderData: (previous) => previous,
    enabled,
  })
