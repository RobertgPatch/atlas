import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { Download, Loader2, RectangleHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import {
  DEFAULT_PRIVATE_INVESTMENT_DETAIL_COLUMNS,
  DEFAULT_PRIVATE_INVESTMENT_SUMMARY_COLUMNS,
  PRIVATE_INVESTMENT_DETAIL_COLUMN_IDS,
  PRIVATE_INVESTMENT_SUMMARY_COLUMN_IDS,
  type PrivateInvestmentDetailColumnId,
  type PrivateInvestmentSummaryColumnId,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { humanizePrivateInvestmentCode } from './privateInvestmentFormatting'

export function PrivateInvestmentPdfExportDialog({
  open,
  exporting,
  error,
  onClose,
  onExport,
}: {
  open: boolean
  exporting: boolean
  error: string | null
  onClose: () => void
  onExport: (summaryColumns: PrivateInvestmentSummaryColumnId[], detailColumns: PrivateInvestmentDetailColumnId[]) => void
}) {
  const [summaryColumns, setSummaryColumns] = useState<PrivateInvestmentSummaryColumnId[]>(DEFAULT_PRIVATE_INVESTMENT_SUMMARY_COLUMNS)
  const [detailColumns, setDetailColumns] = useState<PrivateInvestmentDetailColumnId[]>(DEFAULT_PRIVATE_INVESTMENT_DETAIL_COLUMNS)
  const toggle = <T extends string>(values: T[], value: T, setValues: (values: T[]) => void, order: readonly T[]) => {
    const selected = new Set(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
    setValues(order.filter((item) => selected.has(item)))
  }
  return (
    <Dialog open={open} onClose={exporting ? () => undefined : onClose} className="relative z-[80]">
      <DialogBackdrop transition className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity data-[closed]:opacity-0 motion-reduce:transition-none" />
      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel transition className="flex max-h-[min(90vh,780px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl transition data-[closed]:translate-y-2 data-[closed]:opacity-0 motion-reduce:transform-none motion-reduce:transition-none">
            <header className="border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="flex items-start gap-4"><div className="mr-auto"><p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-jackson-hover">C-Suite artifact</p><DialogTitle className="mt-1 font-serif text-2xl font-semibold text-slate-950">Export PDF report</DialogTitle><p className="mt-1 max-w-xl text-sm text-slate-600">The report contains every authorized row matching the current filters, not only the visible page.</p></div><button type="button" aria-label="Close PDF export" disabled={exporting} onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold"><X className="h-5 w-5" /></button></div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="mb-6 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3" data-testid="pdf-export-orientation">
                <RectangleHorizontal className="h-5 w-5 shrink-0 text-jackson-hover" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-slate-900">Landscape orientation</p>
                  <p className="mt-0.5 text-xs text-slate-600">Letter-size pages default to landscape so the standard summary columns fit on one page.</p>
                </div>
              </div>
              <ColumnGroup title="Summary columns" description="Lifetime values for every entity-fund position." allSelected={summaryColumns.length === PRIVATE_INVESTMENT_SUMMARY_COLUMN_IDS.length} onAll={() => setSummaryColumns([...PRIVATE_INVESTMENT_SUMMARY_COLUMN_IDS])} onClear={() => setSummaryColumns([])} onDefault={() => setSummaryColumns(DEFAULT_PRIVATE_INVESTMENT_SUMMARY_COLUMNS)}>
                {PRIVATE_INVESTMENT_SUMMARY_COLUMN_IDS.map((column) => <ColumnCheckbox key={column} label={humanizePrivateInvestmentCode(column)} checked={summaryColumns.includes(column)} onChange={() => toggle(summaryColumns, column, setSummaryColumns, PRIVATE_INVESTMENT_SUMMARY_COLUMN_IDS)} />)}
              </ColumnGroup>
              <div className="my-6 border-t border-slate-200" />
              <ColumnGroup title="Detail columns" description="Filtered cash-flow and valuation ledger." allSelected={detailColumns.length === PRIVATE_INVESTMENT_DETAIL_COLUMN_IDS.length} onAll={() => setDetailColumns([...PRIVATE_INVESTMENT_DETAIL_COLUMN_IDS])} onClear={() => setDetailColumns([])} onDefault={() => setDetailColumns(DEFAULT_PRIVATE_INVESTMENT_DETAIL_COLUMNS)}>
                {PRIVATE_INVESTMENT_DETAIL_COLUMN_IDS.map((column) => <ColumnCheckbox key={column} label={humanizePrivateInvestmentCode(column)} checked={detailColumns.includes(column)} onChange={() => toggle(detailColumns, column, setDetailColumns, PRIVATE_INVESTMENT_DETAIL_COLUMN_IDS)} />)}
              </ColumnGroup>
              {error && <p className="mt-5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800" role="alert">{error}</p>}
            </div>
            <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
              <button type="button" disabled={exporting} onClick={onClose} className="min-h-11 rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Cancel</button>
              <button type="button" disabled={exporting || !summaryColumns.length || !detailColumns.length} onClick={() => onExport(summaryColumns, detailColumns)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2">{exporting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}{exporting ? 'Preparing complete report…' : 'Export PDF'}</button>
            </footer>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

function ColumnGroup({ title, description, children, allSelected, onAll, onClear, onDefault }: { title: string; description: string; children: React.ReactNode; allSelected: boolean; onAll: () => void; onClear: () => void; onDefault: () => void }) {
  return <fieldset><legend className="font-serif text-lg font-semibold text-slate-950">{title}</legend><div className="mt-1 flex flex-wrap items-center gap-2"><p className="mr-auto text-xs text-slate-600">{description}</p><button type="button" onClick={onDefault} className="min-h-9 px-2 text-xs font-bold text-slate-700 underline decoration-jackson-gold underline-offset-4">Defaults</button><button type="button" onClick={onAll} disabled={allSelected} className="min-h-9 px-2 text-xs font-bold text-slate-700 disabled:opacity-40">All</button><button type="button" onClick={onClear} className="min-h-9 px-2 text-xs font-bold text-slate-700">Clear</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div></fieldset>
}
function ColumnCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-amber-50"><input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-slate-400 text-slate-950 focus:ring-jackson-gold" />{label}</label>
}
