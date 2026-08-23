import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleAlert, Clock3, FileSearch, FileText, Info, Loader2, RefreshCw, UploadCloud } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import type { K1TrackerYearDetail } from '../../../../../../packages/types/src/k1-tracker'
import type { K1IngestionItem } from '../../../../../../packages/types/src/k1-ingestion'
import { focusK1TrackerField, isReconciliationBlocker, reconciliationGuidanceFor } from '../../k1-tracker/reconciliationGuidance'
import { useK1Batches } from '../hooks/useK1Queries'

const ITEM_LABELS: Record<K1IngestionItem['status'], string> = {
  PENDING_UPLOAD: 'Waiting for upload',
  UPLOADED: 'Uploaded',
  VALIDATING: 'Validating PDF',
  QUEUED: 'Queued for extraction',
  PROCESSING: 'Extracting fields',
  NEEDS_MATCH: 'Partnership match needed',
  NEEDS_REVIEW: 'Review needed',
  READY_TO_APPLY: 'Ready to apply',
  APPLIED: 'Applied',
  FAILED: 'Extraction failed',
  CANCELLED: 'Cancelled',
}

const attentionStatuses = new Set<K1IngestionItem['status']>(['NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY', 'FAILED'])
const activeStatuses = new Set<K1IngestionItem['status']>(['PENDING_UPLOAD', 'UPLOADED', 'VALIDATING', 'QUEUED', 'PROCESSING'])
const reviewableStatuses = new Set<K1IngestionItem['status']>(['NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY', 'APPLIED'])
const requiresReviewStatuses = new Set<K1IngestionItem['status']>(['NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY'])

const sourceDocumentIdsFor = (detail: K1TrackerYearDetail): string[] => {
  const documentIds = new Set<string>()
  for (const value of detail.values) {
    if (value.sourceK1DocumentId) documentIds.add(value.sourceK1DocumentId)
  }
  for (const source of Object.values(detail.officialFormSources ?? {})) {
    if (source?.sourceK1DocumentId) documentIds.add(source.sourceK1DocumentId)
  }
  return [...documentIds]
}

const itemTone = (status: K1IngestionItem['status']) => attentionStatuses.has(status)
  ? 'border-amber-200 bg-amber-50 text-amber-950'
  : activeStatuses.has(status)
    ? 'border-cyan-200 bg-cyan-50 text-cyan-950'
    : status === 'APPLIED'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : 'border-slate-200 bg-slate-50 text-slate-700'

export function K1PartnershipIntakeRail({
  detail,
  entityId,
  entityName,
  partnershipId,
  partnershipName,
  canUpload,
  onUpload,
}: {
  detail?: K1TrackerYearDetail
  entityId: string
  entityName: string
  partnershipId: string
  partnershipName: string
  canUpload: boolean
  onUpload: () => void
}) {
  const navigate = useNavigate()
  const query = useK1Batches({ entityId, limit: 3 })
  const sourceDocumentIds = useMemo(() => detail ? sourceDocumentIdsFor(detail) : [], [detail])
  const recentItems = useMemo(() => (query.data?.pages ?? [])
    .flatMap((page) => page.items)
    .flatMap((batch) => batch.items)
    .filter((item) => item.partnershipId === partnershipId
      || item.partnershipCandidates?.some((candidate) => candidate.id === partnershipId))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 4), [partnershipId, query.data])
  const counts = useMemo(() => ({
    active: recentItems.filter((item) => activeStatuses.has(item.status)).length,
    attentionRequired: recentItems.filter((item) => attentionStatuses.has(item.status)).length,
    completed: recentItems.filter((item) => item.status === 'APPLIED').length,
  }), [recentItems])
  const reviewItem = recentItems.find((item) => item.k1DocumentId && requiresReviewStatuses.has(item.status))
  const openChecks = detail?.calculation.checks.filter((check) => check.status !== 'PASS') ?? []
  const blockingChecks = openChecks.filter(isReconciliationBlocker)
  const warningChecks = openChecks.filter((check) => check.status === 'WARNING')
  const sourceConflictsAreRepresented = openChecks.some((check) => check.key === 'unresolved-source-conflicts')
  const extraSourceConflicts = sourceConflictsAreRepresented ? [] : detail?.sourceConflicts ?? []
  const requiredCount = blockingChecks.length + extraSourceConflicts.length
  const checksNeedingAttention = openChecks.length + extraSourceConflicts.length

  return <aside aria-label="K-1 document workflow" className="space-y-3">
    <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{detail ? `Tax year ${detail.taxYear}` : 'K-1 document workflow'}</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Document intake</h3>
          {detail && <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-200">{detail.status.replaceAll('_', ' ').toLowerCase()}</span>}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-emerald-100 p-2 text-emerald-800"><FileSearch className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-950">Source document</p>
            {sourceDocumentIds.length ? <>
              <p className="mt-1 text-xs leading-5 text-slate-600">{sourceDocumentIds.length} reviewed PDF{sourceDocumentIds.length === 1 ? ' is' : 's are'} linked to this workpaper.</p>
              <button type="button" onClick={() => navigate(`/k1/${sourceDocumentIds[0]}/review`)} className="mt-2 inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary">
                Open source review <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </> : <p className="mt-1 text-xs leading-5 text-slate-600">No reviewed PDF has been applied{detail ? ` to ${detail.taxYear}` : ''}. Extracted documents waiting below can be reviewed before a tax year is created.</p>}
          </div>
        </div>
        {reviewItem?.k1DocumentId && <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div className="min-w-0"><p className="text-xs font-semibold text-amber-950">K-1 review required</p><p className="mt-1 break-words text-xs text-amber-900">{reviewItem.fileName}{reviewItem.taxYear ? ` · ${reviewItem.taxYear}` : ''} is waiting for review for {partnershipName}.</p></div></div>
          <button type="button" onClick={() => navigate(`/k1/${reviewItem.k1DocumentId}/review`)} className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"><FileSearch className="h-3.5 w-3.5" />Review K-1 now</button>
        </div>}
        {canUpload && <button type="button" onClick={onUpload} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2">
          <UploadCloud className="h-4 w-4" />Upload K-1 PDFs
        </button>}
      </div>
    </section>

    {detail && <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" aria-labelledby="k1-open-checks-heading">
      <div className={`border-b px-4 py-3 ${requiredCount ? 'border-amber-200 bg-amber-50' : checksNeedingAttention ? 'border-sky-200 bg-sky-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {requiredCount ? <CircleAlert className="h-4 w-4 text-amber-700" /> : checksNeedingAttention ? <Info className="h-4 w-4 text-sky-700" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
            <h3 id="k1-open-checks-heading" className="text-xs font-semibold text-slate-950">Reconciliation checklist</h3>
          </div>
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${requiredCount ? 'bg-amber-200 text-amber-950' : checksNeedingAttention ? 'bg-sky-200 text-sky-950' : 'bg-emerald-200 text-emerald-950'}`}>{checksNeedingAttention}</span>
        </div>
        {checksNeedingAttention ? <p className="mt-2 text-xs leading-5 text-slate-700">
          {requiredCount ? <><strong>{requiredCount} required item{requiredCount === 1 ? '' : 's'}</strong> must be completed.</> : 'All required inputs are complete.'}
          {warningChecks.length > 0 ? ` ${warningChecks.length} calculated warning${warningChecks.length === 1 ? '' : 's'} should be reviewed and acknowledged.` : ''}
        </p> : <p className="mt-2 text-xs leading-5 text-emerald-800">Every required check passes. This revision is ready to reconcile.</p>}
      </div>

      {checksNeedingAttention > 0 && <ol className="divide-y divide-slate-200">
        {[...blockingChecks, ...warningChecks].map((check) => {
          const guidance = reconciliationGuidanceFor(check)
          const blocking = isReconciliationBlocker(check)
          return <li key={check.key} className="px-4 py-3">
            <div className="flex items-start gap-2.5">
              {blocking ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold leading-5 text-slate-950">{guidance.title}</p>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${blocking ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}>{blocking ? 'Required' : 'Review'}</span>
                </div>
                <p className="mt-1 text-[11px] leading-[1.15rem] text-slate-600">{guidance.description}</p>
                {guidance.fieldKey && guidance.actionLabel && <button type="button" onClick={() => focusK1TrackerField(guidance.fieldKey!)} className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-[10px] font-semibold text-primary hover:border-primary hover:bg-primary-subtle">
                  {guidance.actionLabel} <ArrowUpRight className="h-3 w-3" />
                </button>}
              </div>
            </div>
          </li>
        })}
        {extraSourceConflicts.map((conflict) => <li key={conflict.fieldKey} className="px-4 py-3">
          <div className="flex items-start gap-2.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-slate-950">Source values disagree</p><span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-900">Required</span></div><p className="mt-1 text-[11px] leading-[1.15rem] text-slate-600">{conflict.message}</p>{sourceDocumentIds[0] && <button type="button" onClick={() => navigate(`/k1/${sourceDocumentIds[0]}/review`)} className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-[10px] font-semibold text-primary">Open source review <ArrowUpRight className="h-3 w-3" /></button>}</div></div>
        </li>)}
      </ol>}
    </section>}

    <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" aria-labelledby="k1-recent-uploads-heading">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" /><h3 id="k1-recent-uploads-heading" className="text-xs font-semibold text-slate-950">Recent uploads</h3></div>
          <p className="mt-1 text-[10px] text-slate-500">For {partnershipName} · {entityName}</p>
        </div>
        <button type="button" aria-label="Refresh recent K-1 uploads" onClick={() => void query.refetch()} disabled={query.isFetching} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-center">
        <div className="px-2 py-2"><b className="block font-mono text-xs tabular-nums text-cyan-800">{counts.active}</b><span className="text-[9px] uppercase tracking-wide text-slate-500">active</span></div>
        <div className="border-x border-slate-200 px-2 py-2"><b className="block font-mono text-xs tabular-nums text-amber-800">{counts.attentionRequired}</b><span className="text-[9px] uppercase tracking-wide text-slate-500">review</span></div>
        <div className="px-2 py-2"><b className="block font-mono text-xs tabular-nums text-emerald-800">{counts.completed}</b><span className="text-[9px] uppercase tracking-wide text-slate-500">complete</span></div>
      </div>
      {query.isLoading ? <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading uploads…</div>
        : query.isError ? <p role="alert" className="px-4 py-4 text-xs text-red-700">Recent upload activity could not be loaded.</p>
          : recentItems.length ? <ul className="divide-y divide-slate-200" aria-label="Recent K-1 uploads for entity">
            {recentItems.map((item) => <li key={item.id} className="px-3 py-3">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-900">{item.fileName}</p>
                  <span className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold ${itemTone(item.status)}`}>{ITEM_LABELS[item.status]}</span>
                </div>
                {item.k1DocumentId && reviewableStatuses.has(item.status) && <button type="button" aria-label={`Review K-1 ${item.fileName}`} onClick={() => navigate(`/k1/${item.k1DocumentId}/review`)} className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:border-cyan-500 hover:bg-cyan-50">Review <ArrowUpRight className="h-3 w-3" /></button>}
              </div>
            </li>)}
          </ul> : <p className="px-4 py-5 text-center text-xs leading-5 text-slate-500">No K-1 PDFs are linked or suggested for {partnershipName}.</p>}
      <button type="button" onClick={() => navigate('/k1')} className="flex min-h-9 w-full items-center justify-center gap-1.5 border-t border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100">
        View full processing queue <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </section>

    <section className="rounded-lg border border-cyan-200 bg-cyan-50 p-3.5 text-xs text-cyan-950">
      <p className="font-semibold">Upload → extract → review → apply</p>
      <p className="mt-1 leading-5 text-cyan-900">AWS extraction creates a draft. It never creates a partnership or overwrites this workpaper without review.</p>
    </section>
  </aside>
}
