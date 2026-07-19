import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { FileDown, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PartnershipAggregateGroup, PartnershipPortfolioRollup } from '../../../../../../../packages/types/src/partnership-tracker'
import { partnershipLedgerColumns, type PartnershipLedgerColumnId } from './partnershipAggregationColumns'
import { openPartnershipLedgerPdf } from './partnershipLedgerPdf'

interface PartnershipLedgerPdfExportDialogProps {
  open: boolean
  rows: PartnershipAggregateGroup[]
  rollup: PartnershipPortfolioRollup
  onClose: () => void
}

const allColumnIds = partnershipLedgerColumns.map((column) => column.id)
const defaultColumnIds = partnershipLedgerColumns
  .filter((column) => !['lifecycle', 'workflow', 'warnings', 'quality'].includes(column.id))
  .map((column) => column.id)

export function PartnershipLedgerPdfExportDialog({ open, rows, rollup, onClose }: PartnershipLedgerPdfExportDialogProps) {
  const [selectedColumnIds, setSelectedColumnIds] = useState<PartnershipLedgerColumnId[]>(defaultColumnIds)
  const [error, setError] = useState<string>()

  const close = () => {
    setSelectedColumnIds(defaultColumnIds)
    setError(undefined)
    onClose()
  }

  const selectedColumns = useMemo(
    () => partnershipLedgerColumns.filter((column) => selectedColumnIds.includes(column.id)),
    [selectedColumnIds],
  )

  const toggleColumn = (columnId: PartnershipLedgerColumnId) => {
    setSelectedColumnIds((current) => current.includes(columnId)
      ? current.filter((id) => id !== columnId)
      : [...current, columnId])
  }

  const exportPdf = () => {
    if (!openPartnershipLedgerPdf(rows, selectedColumns, rollup)) {
      setError('The PDF window could not be opened. Allow popups, then try again.')
      return
    }
    close()
  }

  return (
    <Dialog open={open} onClose={close} className="relative z-50">
      <div className="fixed inset-0 bg-gray-950/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-jackson-hover">Partnership ledger</p>
              <DialogTitle className="mt-1 font-serif text-xl font-semibold text-gray-950">Export visible partnerships</DialogTitle>
              <p className="mt-1 text-sm text-gray-500">{rows.length} {rows.length === 1 ? 'partnership' : 'partnerships'} from the current list</p>
            </div>
            <button type="button" aria-label="Close PDF export" onClick={close} className="grid min-h-11 min-w-11 place-items-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold"><X className="h-5 w-5" /></button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-gray-700">Columns</h3>
              <div className="flex gap-3 text-sm font-semibold">
                <button type="button" onClick={() => setSelectedColumnIds(allColumnIds)} className="min-h-9 text-gray-700 underline decoration-jackson-gold underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">All columns</button>
                <button type="button" onClick={() => setSelectedColumnIds([])} className="min-h-9 text-gray-700 underline decoration-jackson-gold underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Clear</button>
              </div>
            </div>
            <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Columns to include in the PDF</legend>
              {partnershipLedgerColumns.map((column) => (
                <label key={column.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-gray-100 px-2 text-sm text-gray-800 hover:bg-gray-50">
                  <input type="checkbox" checked={selectedColumnIds.includes(column.id)} onChange={() => toggleColumn(column.id)} className="h-4 w-4 rounded border-gray-300 text-jackson-gold focus:ring-jackson-gold" />
                  {column.label}
                </label>
              ))}
            </fieldset>
            {error && <p role="alert" className="mt-4 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Cancel</button>
            <button type="button" onClick={exportPdf} disabled={!rows.length || !selectedColumns.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-gray-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2"><FileDown className="h-4 w-4" /> Export PDF</button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
