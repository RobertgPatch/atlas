import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  PrivateInvestmentDetailColumnId,
  PrivateInvestmentQuery,
  PrivateInvestmentSummaryColumnId,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { serializePrivateInvestmentParams } from '../../api/partnershipTrackerClient'
import { usePrivateInvestmentPdfExport, usePrivateInvestmentTracker } from '../../hooks/usePartnershipTracker'
import { PrivateInvestmentActivityTable } from './PrivateInvestmentActivityTable'
import { PrivateInvestmentFilters } from './PrivateInvestmentFilters'
import { PrivateInvestmentPdfExportDialog } from './PrivateInvestmentPdfExportDialog'
import { PrivateInvestmentSummaryTable } from './PrivateInvestmentSummaryTable'
import {
  DEFAULT_PRIVATE_INVESTMENT_QUERY,
  parsePrivateInvestmentSearchParams,
} from './privateInvestmentQueryState'

export function PrivateInvestmentTrackerPageContent() {
  const [params, setParams] = useSearchParams()
  const query = useMemo(() => parsePrivateInvestmentSearchParams(params), [params])
  const tracker = usePrivateInvestmentTracker(query)
  const exportPdf = usePrivateInvestmentPdfExport()
  const [exportOpen, setExportOpen] = useState(false)
  const setQuery = useCallback((next: PrivateInvestmentQuery, replace = true) => {
    setParams(new URLSearchParams(serializePrivateInvestmentParams(next)), { replace })
  }, [setParams])
  useEffect(() => {
    if (!tracker.data || tracker.isPlaceholderData) return
    const requested = serializePrivateInvestmentParams(query)
    const normalized = serializePrivateInvestmentParams(tracker.data.query)
    if (requested !== normalized) setParams(new URLSearchParams(normalized), { replace: true })
  }, [query, setParams, tracker.data, tracker.isPlaceholderData])
  const activeFilterCount = query.assetClasses.length + query.entityIds.length + query.partnershipIds.length
  const doExport = (summaryColumns: PrivateInvestmentSummaryColumnId[], detailColumns: PrivateInvestmentDetailColumnId[]) => {
    exportPdf.mutate({
      filters: {
        assetClasses: query.assetClasses,
        entityIds: query.entityIds,
        partnershipIds: query.partnershipIds,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        amountMin: query.amountMin,
        amountMax: query.amountMax,
      },
      summaryColumns,
      detailColumns,
    }, { onSuccess: () => setExportOpen(false) })
  }
  const exportError = exportPdf.error
    ? 'The PDF could not be prepared. Your filters and column choices are still available; try again.'
    : null
  const hasBaseData = Boolean(tracker.data?.facets.entities.length || tracker.data?.positions.length)

  return (
    <div className="relative border-l-4 border-jackson-gold pl-3 sm:pl-5">
      <PageHeader
        title="Investment Tracker"
        subtitle="A filterable, exact-value ledger of commitments, cash activity, valuations, and lifetime performance."
        actions={<button type="button" disabled={!tracker.data || (!tracker.data.positions.length && tracker.data.pageInfo.totalItems === 0)} onClick={() => { exportPdf.reset(); setExportOpen(true) }} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-jackson-gold px-4 text-sm font-bold text-gray-950 shadow-sm hover:bg-jackson-hover disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2"><Download className="h-4 w-4" /> Export PDF</button>}
      />

      <section aria-labelledby="investment-context-title" className="mb-5 overflow-hidden border-y border-gray-300 bg-white">
        <div className="flex items-baseline justify-between gap-4 border-b border-gray-200 bg-gray-950 px-4 py-3 text-white sm:px-5">
          <h2 id="investment-context-title" className="font-serif text-lg tracking-wide">Operational investment context</h2>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400">As of {tracker.data?.asOfDate ?? '—'}</p>
        </div>
        <dl className="grid sm:grid-cols-3">
          <div className="border-b border-gray-200 px-4 py-4 sm:border-b-0 sm:border-r sm:px-5">
            <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-gray-500">Metric source</dt>
            <dd className="mt-2 font-serif text-lg font-semibold text-gray-950">Operational ledger only</dd>
            <dd className="mt-1 text-xs leading-4 text-gray-500">K-1 values remain tax and reconciliation data.</dd>
          </div>
          <div className="border-b border-gray-200 px-4 py-4 sm:border-b-0 sm:border-r sm:px-5">
            <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-gray-500">Summary scope</dt>
            <dd className="mt-2 font-serif text-lg font-semibold text-gray-950">Lifetime for matched positions</dd>
            <dd className="mt-1 text-xs leading-4 text-gray-500">Entity and Fund filters include positions even before their first activity entry.</dd>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-gray-500">Valuation policy</dt>
            <dd className="mt-2 font-serif text-lg font-semibold text-gray-950">Latest actual FMV</dd>
            <dd className="mt-1 text-xs leading-4 text-gray-500">Uses eligible commitments and real valuation entries.</dd>
          </div>
        </dl>
      </section>

      {tracker.data && <PrivateInvestmentFilters query={query} facets={tracker.data.facets} onChange={setQuery} />}

      <main className="mt-6 space-y-5" aria-label="Investment tracker results">
        <div className="flex min-h-10 flex-wrap items-center gap-3">
          <p className="mr-auto text-sm font-semibold text-gray-700" aria-live="polite" aria-atomic="true">
            {tracker.data ? `${tracker.data.positions.length} position${tracker.data.positions.length === 1 ? '' : 's'} • ${tracker.data.pageInfo.totalItems} ledger row${tracker.data.pageInfo.totalItems === 1 ? '' : 's'}` : 'Loading investment results'}
          </p>
          {activeFilterCount > 0 && <span className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700">{activeFilterCount} active filters</span>}
          {tracker.isFetching && !tracker.isLoading && <span className="inline-flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Updating ledger</span>}
        </div>

        {tracker.isLoading ? (
          <section aria-label="Loading investment tracker" className="space-y-5"><div className="h-48 animate-pulse border border-gray-200 bg-gray-100 motion-reduce:animate-none" /><div className="h-80 animate-pulse border border-gray-200 bg-gray-100 motion-reduce:animate-none" /></section>
        ) : tracker.isError ? (
          <section className="border border-red-300 bg-red-50 p-6" role="alert"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-red-700" /><div><h2 className="font-serif text-xl font-semibold text-red-950">The investment ledger could not be loaded</h2><p className="mt-2 text-sm text-red-800">The database may be unavailable or the request was interrupted. The URL still preserves your filters.</p></div></div><button type="button" onClick={() => void tracker.refetch()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-red-400 bg-white px-4 text-sm font-bold text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"><RefreshCw className="h-4 w-4" /> Try again</button></section>
        ) : tracker.data && !hasBaseData ? (
          <section className="border border-dashed border-gray-400 bg-white px-6 py-16 text-center"><p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-jackson-hover">Investment ledger</p><h2 className="mt-2 font-serif text-2xl font-semibold text-gray-950">No partnerships yet</h2><p className="mx-auto mt-3 max-w-xl text-sm text-gray-600">Add a partnership to begin the investment summary, then record Cash Activity and FMV entries as they occur.</p></section>
        ) : tracker.data ? (
          <>
            {tracker.data.positions.length ? <section aria-labelledby="investment-summary-heading" className="border border-gray-300 bg-white">
              <div className="flex flex-col gap-2 border-b border-gray-300 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-jackson-hover">Position summary</p><h2 id="investment-summary-heading" className="mt-1 font-serif text-xl font-semibold text-gray-950">Fund investment summary</h2></div>
                <p className="max-w-xl text-xs text-gray-500">Lifetime metrics for every matching entity-fund position and asset class.</p>
              </div>
              <PrivateInvestmentSummaryTable positions={tracker.data.positions} />
            </section> : <section className="border border-dashed border-gray-400 bg-white px-6 py-14 text-center"><h2 className="font-serif text-2xl font-semibold text-gray-950">No investments match these filters</h2><p className="mt-3 text-sm text-gray-600">Your partnership and operational history are unchanged. Clear or widen the filters.</p><button type="button" onClick={() => setQuery({ ...DEFAULT_PRIVATE_INVESTMENT_QUERY, pageSize: query.pageSize })} className="mt-5 min-h-11 rounded-md border border-gray-400 bg-white px-4 text-sm font-bold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Clear all filters</button></section>}
            {tracker.data.positions.length ? <section aria-labelledby="investment-detail-heading" className="border border-gray-300 bg-white">
              <div className="border-b border-gray-300 px-4 py-4">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-jackson-hover">Activity ledger</p>
                <h2 id="investment-detail-heading" className="mt-1 font-serif text-xl font-semibold text-gray-950">Cash flow & valuation detail</h2>
                <p className="mt-1 text-xs text-gray-500">Newest activity appears first; accounting direction is shown in the table.</p>
              </div>
              {tracker.data.pageInfo.totalItems > 0
                ? <PrivateInvestmentActivityTable activities={tracker.data.activities} pageInfo={tracker.data.pageInfo} onPageChange={(page) => setQuery({ ...query, page }, false)} onPageSizeChange={(pageSize) => setQuery({ ...query, pageSize, page: 1 })} />
                : <div className="px-6 py-12 text-center"><h3 className="font-serif text-xl font-semibold text-gray-950">No Cash Activity or FMV entries yet</h3><p className="mt-2 text-sm text-gray-600">This position remains in the summary so its commitment and profile stay visible.</p></div>}
            </section> : null}
          </>
        ) : null}
      </main>
      {exportOpen && <PrivateInvestmentPdfExportDialog open exporting={exportPdf.isPending} error={exportError} onClose={() => setExportOpen(false)} onExport={doExport} />}
    </div>
  )
}
