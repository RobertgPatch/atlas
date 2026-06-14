import { AlertTriangleIcon } from 'lucide-react'
import type { ConsolidatedHoldingsResponse } from '../../../../../../packages/types/src/reports'

interface ConsolidatedHoldingsSyncStatusProps {
  sync: ConsolidatedHoldingsResponse['sync'] | undefined
}

export function ConsolidatedHoldingsSyncStatus({
  sync,
}: ConsolidatedHoldingsSyncStatusProps) {
  if (!sync || sync.warnings.length === 0) return null

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>
        <div className="font-medium">Some holdings need attention</div>
        <div>{sync.warnings.join(' ')}</div>
      </div>
    </div>
  )
}
