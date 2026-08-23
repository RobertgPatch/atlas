import { useQuery } from '@tanstack/react-query'
import { reportsClient } from '../api/reportsClient'

export const liquidityPerformanceKey = ['reports', 'liquidity-performance'] as const

export const useLiquidityPerformance = () =>
  useQuery({
    queryKey: liquidityPerformanceKey,
    queryFn: () => reportsClient.getLiquidityPerformance(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
