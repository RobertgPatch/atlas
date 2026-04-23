import { useQuery } from '@tanstack/react-query'
import { dashboardClient } from '../api/dashboardClient'

const POLL_MS = 5_000

export const dashboardKeys = {
  summary: () => ['dashboard', 'summary'] as const,
}

export const useDashboardSummary = () =>
  useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: () => dashboardClient.getSummary(),
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      return data.statusCounts.UPLOADED + data.statusCounts.PROCESSING > 0 ? POLL_MS : false
    },
  })