import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConsolidatedHoldingRow } from '../../../../../../packages/types/src/reports'
import type { SaveSectorAssignment, SectorAssignment } from '../../../../../../packages/types/src/liquidity-sectors'
import { liquiditySectorsClient } from '../api/liquiditySectorsClient'
import { reportsClient } from '../api/reportsClient'

export const sectorAssignmentsKey = ['liquidity', 'sector-assignments'] as const
export const sectorHoldingsKey = ['reports', 'sector-management-holdings'] as const

/** Read every report page so management never silently omits stocks after 1,000. */
export async function loadSectorHoldings(entityId: string | undefined, signal?: AbortSignal) {
  const rows: ConsolidatedHoldingRow[] = []
  let page = 1
  while (true) {
    const result = await reportsClient.getConsolidatedHoldings(
      { entityId, page, pageSize: 1000, sort: 'symbol', direction: 'asc' },
      { pricingMode: 'saved', signal },
    )
    rows.push(...result.rows)
    if (result.page.offset + result.page.size >= result.page.total) return rows
    if (!result.rows.length) throw new Error('The holdings list changed while loading. Reload and try again.')
    page++
  }
}

export function useLiquiditySectors(entityId?: string) {
  const client = useQueryClient()
  const assignments = useQuery({ queryKey: sectorAssignmentsKey, queryFn: liquiditySectorsClient.list })
  const holdings = useQuery({
    queryKey: [...sectorHoldingsKey, entityId ?? 'all'],
    queryFn: ({ signal }) => loadSectorHoldings(entityId, signal),
  })
  const save = useMutation({
    mutationFn: ({ symbol, ...body }: SaveSectorAssignment & { symbol: string }) => liquiditySectorsClient.save(symbol, body),
    onSuccess: async (assignment) => {
      client.setQueryData<{ items: SectorAssignment[] }>(sectorAssignmentsKey, (previous) => ({
        items: [...(previous?.items ?? []).filter((item) => item.symbol !== assignment.symbol), assignment],
      }))
      // Every entity/custodian report reads the same security-level override.
      await Promise.all([
        client.invalidateQueries({ queryKey: ['reports', 'consolidated-holdings'] }),
        client.invalidateQueries({ queryKey: sectorHoldingsKey }),
      ])
    },
  })
  return { assignments, holdings, save }
}
