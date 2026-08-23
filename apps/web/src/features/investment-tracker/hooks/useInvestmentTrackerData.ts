import { useQuery } from '@tanstack/react-query'
import type { PartnershipAggregationResponse } from '../../../../../../packages/types/src/partnership-tracker'
import { partnershipTrackerClient } from '../../partnership-tracker/api/partnershipTrackerClient'

async function loadEveryPartnershipGroup(): Promise<PartnershipAggregationResponse> {
  const first = await partnershipTrackerClient.aggregation({ page: 1, pageSize: 100 })
  if (first.pageInfo.totalPages <= 1) return first

  const remaining = await Promise.all(
    Array.from({ length: first.pageInfo.totalPages - 1 }, (_, index) =>
      partnershipTrackerClient.aggregation({ page: index + 2, pageSize: 100 }),
    ),
  )

  return {
    ...first,
    items: [first, ...remaining].flatMap((page) => page.items),
    pageInfo: {
      ...first.pageInfo,
      page: 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  }
}

export function useInvestmentTrackerData() {
  return useQuery({
    queryKey: ['partnership-tracker', 'aggregation', 'investment-tracker-all'],
    queryFn: loadEveryPartnershipGroup,
  })
}
