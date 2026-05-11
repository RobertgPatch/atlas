import { useQuery } from '@tanstack/react-query'
import type { ReportsQueryBase } from '../../../../../../packages/types/src/reports'
import { reportsClient } from '../api/reportsClient'

export const useActivityDetail = (
  filters: ReportsQueryBase,
  enabled = true,
) =>
  useQuery({
    queryKey: ['reports', 'activity-detail', filters],
    queryFn: () => reportsClient.getActivityDetail(filters),
    placeholderData: (previous) => previous,
    enabled,
  })
