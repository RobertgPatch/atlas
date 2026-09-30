import { useQuery } from '@tanstack/react-query'
import { reportsClient } from '../api/reportsClient'

export const liquidityPerformanceKey = (entityId?:string,accountIds?:readonly string[]) => ['reports', 'liquidity-performance',entityId,accountIds] as const

export const useLiquidityPerformance = (entityId?:string,accountIds?:string[]) =>
  useQuery({
    queryKey: liquidityPerformanceKey(entityId,accountIds),
    enabled:!!entityId && (accountIds === undefined || accountIds.length > 0),
    queryFn: () => reportsClient.getLiquidityPerformance({entityId,accountIds}),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
