import { ArrowRight, CheckCircle2, GitCompareArrows, Loader2, ShieldAlert } from 'lucide-react'
import type {
  K1ApplicationDecision,
  K1ApplicationFieldDecision,
  K1ApplicationPreview,
} from '../../../../../../packages/types/src/k1-ingestion'

const valueLabel = (value: unknown): string => {
  if (value == null || value === '') return 'No value'
  if (typeof value === 'boolean') return value ? 'Checked' : 'Not checked'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const destinationLabel = (decision: K1ApplicationFieldDecision) =>
  decision.destinationKey.replaceAll('_', ' ')

const blockerLabel = (blocker: string): string => ({
  MATCH_REQUIRED: 'Link the K-1 to the entity receiving it, the partnership that issued it, and the tax year.',
  TAX_YEAR_REQUIRED: 'Choose the K-1 tax year in the linking step.',
  OPEN_ISSUES: 'Review and resolve each open extraction check.',
  EMPTY_REQUIRED: 'Enter the missing required K-1 fields and save the corrections.',
  REVIEW_NOT_FINALIZED: 'Finalize the reviewed extraction before building the tracker preview.',
  ACTIVE_ATTEMPT_NOT_SUCCEEDED: 'Wait for AWS extraction to finish successfully, or re-run extraction.',
  NOT_ADMIN: 'An administrator must finalize and apply this K-1.',
  ALREADY_APPLIED: 'This K-1 has already been applied.',
}[blocker] ?? blocker.replaceAll('_', ' ').toLowerCase())

export function K1ApplyPanel({
  canApply,
  blockers,
  preview,
  choices,
  previewPending,
  applyPending,
  applied,
  onPreview,
  onChoice,
  onApply,
  onOpenTracker,
  onResolveMatch,
  onResolveIssues,
  onFinalizeReview,
}: {
  canApply: boolean
  blockers: string[]
  preview: K1ApplicationPreview | null
  choices: Record<string, K1ApplicationDecision | undefined>
  previewPending: boolean
  applyPending: boolean
  applied?: { at: string; byEmail?: string | null } | null
  onPreview: () => void
  onChoice: (decisionId: string, choice: K1ApplicationDecision) => void
  onApply: () => void
  onOpenTracker: () => void
  onResolveMatch?: () => void
  onResolveIssues?: () => void
  onFinalizeReview?: () => void
}) {
  if (applied) {
    return <section className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-4" aria-labelledby="applied-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-900"><CheckCircle2 size={18} /><h2 id="applied-title" className="font-semibold">K-1 applied to the tracker</h2></div>
          <p className="mt-1 text-xs text-emerald-800">
            Applied {new Date(applied.at).toLocaleString()}{applied.byEmail ? ` by ${applied.byEmail}` : ''}. The source document and reviewed evidence remain attached to every imported value.
          </p>
        </div>
        <button type="button" onClick={onOpenTracker} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          Open tracker <ArrowRight size={15} />
        </button>
      </div>
    </section>
  }

  if (!preview) {
    return <section className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-4" aria-labelledby="apply-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-indigo-950"><GitCompareArrows size={17} /><h2 id="apply-heading" className="font-semibold">Apply reviewed values</h2></div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-indigo-800">Build a revision-bound preview before anything enters the tracker. Existing values are preserved until you explicitly resolve each conflict.</p>
        </div>
        <button type="button" onClick={onPreview} disabled={!canApply || previewPending}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:bg-disabled-background disabled:text-disabled-foreground" data-testid="build-apply-preview">
          {previewPending && <Loader2 size={15} className="animate-spin" />}{previewPending ? 'Building…' : 'Build apply preview'}
        </button>
      </div>
      {!canApply && blockers.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
          <div className="text-xs font-semibold">Complete these steps before building a preview:</div>
          <ul className="mt-2 space-y-1.5 text-xs leading-5">
            {blockers.map((blocker) => <li key={blocker}>• {blockerLabel(blocker)}</li>)}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {blockers.some((blocker) => blocker === 'MATCH_REQUIRED' || blocker === 'TAX_YEAR_REQUIRED') && onResolveMatch && (
              <button type="button" onClick={onResolveMatch} className="rounded border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-amber-100">Link this K-1</button>
            )}
            {blockers.includes('OPEN_ISSUES') && onResolveIssues && (
              <button type="button" onClick={onResolveIssues} className="rounded border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-amber-100">Review open issues</button>
            )}
            {blockers.includes('REVIEW_NOT_FINALIZED') && onFinalizeReview && (
              <button type="button" onClick={onFinalizeReview} className="rounded border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-amber-100">Go to finalize review</button>
            )}
          </div>
        </div>
      )}
    </section>
  }

  const unresolvedConflicts = preview.decisions.filter((decision) => decision.conflict && !choices[decision.id])
  const groups = [
    ['CALCULATION', 'Calculation fields'],
    ['OFFICIAL', 'Official form fields'],
  ] as const
  return <section className="overflow-hidden rounded-lg border border-indigo-300 bg-white shadow-sm" aria-labelledby="preview-title">
    <div className="flex items-start justify-between gap-3 border-b border-indigo-200 bg-indigo-950 px-4 py-3 text-white">
      <div><div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-indigo-300">Revision-bound preview</div><h2 id="preview-title" className="mt-1 font-semibold">Choose what enters the tracker</h2></div>
      <button type="button" onClick={onPreview} disabled={previewPending || applyPending} className="text-xs font-semibold text-indigo-200 hover:text-white">Refresh preview</button>
    </div>
    <div className="max-h-[34rem] divide-y divide-slate-200 overflow-y-auto">
      {groups.map(([kind, title]) => {
        const decisions = preview.decisions.filter((decision) => decision.destinationKind === kind)
        if (!decisions.length) return null
        return <div key={kind} className="p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{title} · {decisions.length}</h3>
          <div className="space-y-2">
            {decisions.map((decision) => {
              const authoritative = decision.existingValue != null && ['capital_contributions', 'box_19_distributions'].includes(decision.destinationKey)
              return <div key={decision.id} className={`grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_12rem] md:items-center ${decision.conflict ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`} data-testid={`apply-decision-${decision.destinationKey}`}>
              <div>
                <div className="text-xs font-semibold capitalize text-slate-900">{destinationLabel(decision)}</div>
                <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{decision.conflict ? 'Conflict' : 'New or unchanged'}</div>
              </div>
              <div><div className="text-[10px] font-bold uppercase text-slate-500">Existing</div><div className="mt-1 break-words font-mono text-xs text-slate-800">{valueLabel(decision.existingValue)}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-500">Extracted</div><div className="mt-1 break-words font-mono text-xs text-slate-800">{valueLabel(decision.extractedValue)}</div></div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Decision
                <select aria-label={`${destinationLabel(decision)} decision`} value={choices[decision.id] ?? ''} disabled={authoritative}
                  onChange={(event) => onChoice(decision.id, event.target.value as K1ApplicationDecision)}
                  className="mt-1 min-h-9 w-full rounded border border-slate-400 bg-white px-2 text-xs font-semibold text-slate-900 focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus">
                  {decision.conflict && <option value="">Choose…</option>}
                  {!authoritative && <option value="USE_EXTRACTED">Use extracted</option>}
                  <option value="KEEP_EXISTING">Keep existing</option>
                </select>
                {authoritative && <span className="mt-1 block normal-case font-medium tracking-normal text-amber-800">Dated activity is authoritative; the PDF total remains evidence.</span>}
              </label>
            </div>})}
          </div>
        </div>
      })}
    </div>
    <div className="flex flex-col gap-3 border-t border-indigo-200 bg-indigo-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-indigo-900">
        {unresolvedConflicts.length > 0
          ? <span className="inline-flex items-center gap-1 font-semibold text-amber-900"><ShieldAlert size={14} />Resolve {unresolvedConflicts.length} conflict{unresolvedConflicts.length === 1 ? '' : 's'} to continue.</span>
          : 'All decisions are ready. Apply writes values, provenance, recalculation, and signoff invalidation in one transaction.'}
      </div>
      <button type="button" onClick={onApply} disabled={unresolvedConflicts.length > 0 || applyPending || previewPending}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:bg-disabled-background disabled:text-disabled-foreground" data-testid="apply-k1-button">
        {applyPending && <Loader2 size={15} className="animate-spin" />}{applyPending ? 'Applying…' : 'Apply to tracker'}
      </button>
    </div>
  </section>
}
