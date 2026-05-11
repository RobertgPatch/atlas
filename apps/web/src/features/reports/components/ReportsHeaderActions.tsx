import { DownloadIcon } from 'lucide-react'
import type { ReportExportFormat } from '../../../../../../packages/types/src/reports'

interface ReportsHeaderActionsProps {
  isExporting?: boolean
  onExport: (format: ReportExportFormat) => void
}

export function ReportsHeaderActions({ isExporting = false, onExport }: ReportsHeaderActionsProps) {
  const baseButtonClass =
    'inline-flex items-center gap-1.5 rounded-card border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div className="flex items-center gap-2" data-testid="reports-header-actions">
      <button
        type="button"
        onClick={() => onExport('csv')}
        className={baseButtonClass}
        disabled={isExporting}
      >
        <DownloadIcon className="h-4 w-4" />
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => onExport('xlsx')}
        className={baseButtonClass}
        disabled={isExporting}
      >
        <DownloadIcon className="h-4 w-4" />
        Export XLSX
      </button>
    </div>
  )
}
