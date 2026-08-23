import { AlertCircle, Ban, ChevronDown, Clock3, FileCheck2, Loader2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { K1IngestionBatchStatus, K1IngestionItem } from '../../../../../../packages/types/src/k1-ingestion'
import { useCancelK1BatchItem, useDeleteK1BatchItem, useK1Batches, useRetryK1Extraction } from '../hooks/useK1Queries'

const STATUS_LABEL: Record<K1IngestionBatchStatus, string> = {
  OPEN: 'Waiting for upload', PROCESSING: 'Processing', ACTION_REQUIRED: 'Action required',
  COMPLETED: 'Completed', PARTIAL_FAILURE: 'Partial failure', CANCELLED: 'Cancelled',
}

const itemLabel = (status: K1IngestionItem['status']) => status.replaceAll('_', ' ').toLowerCase()
const reviewable = (item: K1IngestionItem) => Boolean(item.k1DocumentId && ['NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY', 'APPLIED'].includes(item.status))

export function K1BatchQueue({ entityId }: { entityId?: string }) {
  const navigate = useNavigate()
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [status, setStatus] = useState<K1IngestionBatchStatus | ''>('')
  const query = useK1Batches({ entityId, attentionOnly, status: status || undefined, limit: 10 })
  const cancel = useCancelK1BatchItem()
  const remove = useDeleteK1BatchItem()
  const retry = useRetryK1Extraction()
  const batches = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const counts = query.data?.pages[0]?.counts

  const cancelItem = async (item: K1IngestionItem) => {
    if (!window.confirm(`Cancel ${item.fileName}? The source is retained once document processing has started.`)) return
    await cancel.mutateAsync(item.id)
  }
  const retryItem = async (item: K1IngestionItem) => {
    if (!item.k1DocumentId || item.documentVersion == null) return
    const action = item.status === 'FAILED' ? 'Retry extraction' : 'Re-run AWS extraction'
    if (!window.confirm(`${action} for ${item.fileName}? A new attempt will be appended to its history and the source PDF will be preserved.`)) return
    await retry.mutateAsync({ k1DocumentId: item.k1DocumentId, expectedDocumentVersion: item.documentVersion })
  }
  const deleteItem = async (item: K1IngestionItem) => {
    if (!window.confirm(`Delete ${item.fileName}? Its failed or cancelled upload data will be permanently removed so the PDF can be uploaded again.`)) return
    await remove.mutateAsync(item.id)
  }

  return <section className="mb-6 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" aria-labelledby="batch-queue-title">
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-950 px-4 py-4 text-white lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300"><Clock3 size={13} />Durable processing queue</div>
        <h2 id="batch-queue-title" className="mt-1 text-base font-semibold">K-1 upload batches</h2>
        <p className="mt-1 text-xs text-slate-400">Safe to leave and return. Active work refreshes automatically.</p>
      </div>
      {counts && <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded border border-slate-700 px-2 py-1"><b className="block text-white">{counts.total}</b><span className="text-slate-400">batches</span></div>
        <div className="rounded border border-slate-700 px-2 py-1"><b className="block text-cyan-300">{counts.active}</b><span className="text-slate-400">active</span></div>
        <div className="rounded border border-slate-700 px-2 py-1"><b className="block text-amber-300">{counts.attentionRequired}</b><span className="text-slate-400">attention</span></div>
        <div className="rounded border border-slate-700 px-2 py-1"><b className="block text-emerald-300">{counts.completed}</b><span className="text-slate-400">complete</span></div>
      </div>}
    </div>

    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <label className="flex min-h-9 items-center gap-2 text-xs font-semibold text-slate-700">
        <input type="checkbox" checked={attentionOnly} onChange={(event) => setAttentionOnly(event.target.checked)} className="h-4 w-4 accent-primary focus-visible:ring-focus" />Needs attention only
      </label>
      <label className="text-xs font-semibold text-slate-700">Status <select aria-label="Batch status" value={status} onChange={(event) => setStatus(event.target.value as K1IngestionBatchStatus | '')} className="ml-2 min-h-9 rounded border border-slate-300 bg-white px-2">
        <option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
        <RefreshCw size={13} className={query.isFetching ? 'animate-spin' : ''} />Refresh
      </button>
    </div>

    {query.isLoading && <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Loading durable queue…</div>}
    {query.isError && <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-700"><AlertCircle size={16} />The processing queue could not be loaded.</div>}
    {!query.isLoading && !batches.length && <div className="px-4 py-10 text-center text-sm text-slate-500">No upload batches match these filters.</div>}

    <div className="divide-y divide-slate-200">
      {batches.map((batch) => <article key={batch.id} className="px-4 py-4" data-testid={`batch-${batch.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${batch.status === 'ACTION_REQUIRED' || batch.status === 'PARTIAL_FAILURE' ? 'bg-amber-100 text-amber-900' : batch.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{STATUS_LABEL[batch.status]}</span><span className="font-mono text-[10px] text-slate-400">{batch.id.slice(0, 8)}</span></div>
            <p className="mt-1 text-xs text-slate-500">Started {new Date(batch.createdAt).toLocaleString()} · {batch.counts.total} file{batch.counts.total === 1 ? '' : 's'}</p>
          </div>
          <div className="flex gap-3 font-mono text-xs tabular-nums text-slate-600"><span>{batch.counts.active} active</span><span className="text-amber-700">{batch.counts.actionRequired} attention</span><span className="text-red-700">{batch.counts.failed} failed</span></div>
        </div>
        <div className="mt-3 grid gap-2">
          {batch.items.map((item) => <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5" data-testid={`queue-item-${item.id}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><div className="flex items-center gap-2"><FileCheck2 size={14} className="shrink-0 text-slate-500" /><span className="truncate text-sm font-medium text-slate-900">{item.fileName}</span></div><div className="mt-1 pl-5 text-[11px] capitalize text-slate-500">{itemLabel(item.status)} · updated {new Date(item.updatedAt).toLocaleString()}</div></div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {reviewable(item) && <button type="button" onClick={() => navigate(`/k1/${item.k1DocumentId}/review`)} className="min-h-8 rounded bg-primary px-2.5 text-xs font-semibold text-white hover:bg-primary-hover">Open review</button>}
                {item.canRetry && <button type="button" onClick={() => void retryItem(item)} disabled={retry.isPending} className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RotateCcw size={12} />{item.status === 'FAILED' ? 'Retry' : 'Re-run extraction'}</button>}
                {item.canCancel && <button type="button" onClick={() => void cancelItem(item)} disabled={cancel.isPending} className="inline-flex min-h-8 items-center gap-1 rounded border border-red-200 bg-white px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><Ban size={12} />Cancel</button>}
                {item.canDelete && <button type="button" onClick={() => void deleteItem(item)} disabled={remove.isPending} className="inline-flex min-h-8 items-center gap-1 rounded border border-red-300 bg-red-50 px-2.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"><Trash2 size={12} />Delete</button>}
              </div>
            </div>
            {item.error && <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800"><b>{item.error.code}</b>{item.error.message ? ` · ${item.error.message}` : ''}</p>}
            {item.attemptHistory.length > 0 && <details className="mt-2 text-xs text-slate-600"><summary className="inline-flex cursor-pointer items-center gap-1 font-semibold text-slate-700"><ChevronDown size={12} />Attempt history ({item.attemptHistory.length})</summary><ol className="mt-2 space-y-1 border-l border-slate-300 pl-3">{item.attemptHistory.map((attempt) => <li key={attempt.id}><span className="font-mono">#{attempt.attemptNumber}</span> · {attempt.provider} · {attempt.status}{attempt.active ? ' · active' : ''}{attempt.error ? ` · ${attempt.error.code}` : ''}</li>)}</ol></details>}
          </div>)}
        </div>
      </article>)}
    </div>
    {query.hasNextPage && <div className="border-t border-slate-200 px-4 py-3 text-center"><button type="button" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="min-h-9 rounded border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">{query.isFetchingNextPage ? 'Loading…' : 'Load older batches'}</button></div>}
  </section>
}
