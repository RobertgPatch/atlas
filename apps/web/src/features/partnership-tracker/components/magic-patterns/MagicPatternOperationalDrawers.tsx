import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type {
  CreatePartnershipCashFlowRequest,
  PartnershipNavEntry,
} from '../../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerCashFlowKind } from '../../../../../../../packages/types/src/k1-tracker'
import { normalizeCurrencyInput } from '../../../../components/shared/currencyInput'
import { PartnershipTrackerApiError } from '../../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../../hooks/usePartnershipTracker'
import { formatInKindActivityNote } from './MagicPatternOperationalUtils'
import {
  MagicButton,
  MagicDrawer,
  mpInputClass,
  mpLabelClass,
} from './MagicPatternPrimitives'

const today = () => new Date().toISOString().slice(0, 10)

interface CashActivityDraft {
  id: number
  kind: K1TrackerCashFlowKind
  activityDate: string
  amount: string
  settlement: 'cash' | 'in-kind'
  ticker: string
  securityName: string
  shares: string
  basisPerShare: string
  fmvPerShare: string
  source: string
  note: string
}

let nextCashActivityDraftId = 0

const cashActivityDraft = (
  template?: Pick<CashActivityDraft, 'activityDate' | 'source' | 'kind'>,
): CashActivityDraft => ({
  id: ++nextCashActivityDraftId,
  kind: template?.kind ?? 'CAPITAL_CALL',
  activityDate: template?.activityDate ?? today(),
  amount: '',
  settlement: 'cash',
  ticker: '',
  securityName: '',
  shares: '',
  basisPerShare: '',
  fmvPerShare: '',
  source: template?.source ?? '',
  note: '',
})

const activityOptions: Array<{ kind: K1TrackerCashFlowKind; label: string; description: string }> = [
  { kind: 'CAPITAL_CALL', label: 'Capital call', description: 'Money paid into the fund.' },
  {
    kind: 'DISTRIBUTION',
    label: 'Non-recallable distribution',
    description: 'Permanent return of capital. Counts toward DPI and TVPI.',
  },
  {
    kind: 'RECALLABLE_DISTRIBUTION',
    label: 'Recallable distribution',
    description: 'May be called again — increases the effective commitment and is excluded from DPI/TVPI.',
  },
]

function RadioLine({
  checked,
  name,
  value,
  label,
  description,
  disabled = false,
  onChange,
}: {
  checked: boolean
  name: string
  value: string
  label: string
  description?: string
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-sm leading-5 text-slate-500">{description}</span> : null}
      </span>
    </label>
  )
}

export function MagicPatternCashActivityDrawer({
  open,
  onClose,
  partnershipId,
  fundName,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  partnershipId: string
  fundName: string
  onSaved?: () => void
}) {
  const actions = usePartnershipTrackerActions()
  const [drafts, setDrafts] = useState<CashActivityDraft[]>(() => [cashActivityDraft()])
  const [settlementStatus, setSettlementStatus] = useState<'ANNOUNCED' | 'SETTLED'>('SETTLED')
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [error, setError] = useState<string>()
  const pending = actions.createCashFlows.isPending

  const updateDraft = (id: number, changes: Partial<CashActivityDraft>) => {
    setError(undefined)
    setDrafts((current) => current.map((draft) => {
      if (draft.id !== id) return draft
      const next = { ...draft, ...changes }
      if (next.kind === 'CAPITAL_CALL') next.settlement = 'cash'
      return next
    }))
    setRowErrors((current) => {
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const resolveDraft = (draft: CashActivityDraft): CreatePartnershipCashFlowRequest | string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.activityDate)) return 'Select the activity date.'

    let resolvedAmount: string
    let activityNote = draft.note.trim()
    if (draft.settlement === 'in-kind') {
      if (!draft.ticker.trim() || Number(draft.shares) <= 0 || Number(draft.fmvPerShare) <= 0 || draft.basisPerShare.trim() === '' || Number(draft.basisPerShare) < 0) {
        return 'Enter the security identifier, share count, carried basis, and fair market value.'
      }
      resolvedAmount = (Number(draft.shares) * Number(draft.fmvPerShare)).toFixed(2)
      activityNote = formatInKindActivityNote({
        ticker: draft.ticker,
        securityName: draft.securityName,
        shares: Number(draft.shares),
        costBasisPerShare: Number(draft.basisPerShare),
        fmvPerShare: Number(draft.fmvPerShare),
        source: draft.source,
        note: draft.note,
      })
    } else {
      const parsed = normalizeCurrencyInput(draft.amount, false)
      if (parsed.error || parsed.value == null || Number(parsed.value) <= 0) {
        return parsed.error ?? 'Enter an amount greater than zero.'
      }
      resolvedAmount = parsed.value
      if (draft.source.trim()) {
        activityNote = activityNote
          ? `Source: ${draft.source.trim()} — ${activityNote}`
          : `Source: ${draft.source.trim()}`
      }
    }

    return {
      kind: draft.kind,
      activityDate: draft.activityDate,
      amount: resolvedAmount,
      ...(settlementStatus === 'ANNOUNCED' ? { settlementStatus } : {}),
      note: activityNote || null,
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    const entries: CreatePartnershipCashFlowRequest[] = []
    const nextErrors: Record<number, string> = {}
    for (const draft of drafts) {
      const resolved = resolveDraft(draft)
      if (typeof resolved === 'string') nextErrors[draft.id] = resolved
      else entries.push(resolved)
    }
    setRowErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return setError('Review the highlighted activities before recording the batch.')

    try {
      await actions.createCashFlows.mutateAsync({
        id: partnershipId,
        body: { entries },
      })
      setDrafts([cashActivityDraft()])
      setSettlementStatus('SETTLED')
      setRowErrors({})
      onSaved?.()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The capital activity could not be recorded.')
    }
  }

  return (
    <MagicDrawer
      open={open}
      onClose={onClose}
      title="Record capital activity"
      description={`${fundName} - add up to 20 activities and record them together`}
      footer={
        <>
          <MagicButton type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</MagicButton>
          <MagicButton type="submit" form="magic-cash-activity-form" disabled={pending}>
            {pending
              ? 'Recording...'
              : drafts.length === 1
                ? 'Record activity'
                : `Record ${drafts.length} activities`}
          </MagicButton>
        </>
      }
    >
      <form id="magic-cash-activity-form" onSubmit={submit} className="flex flex-col gap-5">
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-5 text-blue-950">
          Capital calls and distributions are validated first, then saved together as one batch.
        </div>

        {drafts.map((draft, index) => {
          const option = activityOptions.find((item) => item.kind === draft.kind)
          const inKindValue = Number(draft.shares) * Number(draft.fmvPerShare)
          const totalBasis = Number(draft.shares) * Number(draft.basisPerShare)

          return (
            <section
              key={draft.id}
              aria-labelledby={`cash-activity-${draft.id}`}
              className="rounded-lg border border-slate-300 bg-white shadow-sm"
            >
              <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h3 id={`cash-activity-${draft.id}`} className="text-sm font-semibold text-slate-950">
                    Activity {index + 1}
                  </h3>
                  <p className="mt-0.5 text-xs leading-4 text-slate-500">{option?.description}</p>
                </div>
                {drafts.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove activity ${index + 1}`}
                    onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : null}
              </header>

              <div className="flex flex-col gap-4 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className={mpLabelClass}>
                    Activity type <span className="text-red-700">*</span>
                    <select
                      required
                      value={draft.kind}
                      onChange={(event) => updateDraft(draft.id, { kind: event.target.value as K1TrackerCashFlowKind })}
                      className={mpInputClass}
                    >
                      {activityOptions.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className={mpLabelClass}>
                    {settlementStatus === 'ANNOUNCED' ? 'Announcement date' : 'Activity date'} <span className="text-red-700">*</span>
                    <input type="date" required value={draft.activityDate} onChange={(event) => updateDraft(draft.id, { activityDate: event.target.value })} className={mpInputClass} />
                  </label>
                  {draft.kind !== 'CAPITAL_CALL' ? (
                    <label className={mpLabelClass}>
                      Received as <span className="text-red-700">*</span>
                      <select value={draft.settlement} onChange={(event) => updateDraft(draft.id, { settlement: event.target.value as CashActivityDraft['settlement'] })} className={mpInputClass}>
                        <option value="cash">Cash</option>
                        <option value="in-kind">Securities (in kind)</option>
                      </select>
                    </label>
                  ) : null}
                  {draft.settlement === 'cash' ? (
                    <label className={mpLabelClass}>
                      Amount (USD) <span className="text-red-700">*</span>
                      <span className="relative block">
                        <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-slate-500">$</span>
                        <input required inputMode="decimal" value={draft.amount} onChange={(event) => updateDraft(draft.id, { amount: event.target.value })} className={`${mpInputClass} pl-7`} />
                      </span>
                      <span className="mt-1 block text-xs font-normal leading-4 text-slate-500">Enter the absolute amount; direction comes from the activity type.</span>
                    </label>
                  ) : null}
                </div>

                {draft.settlement === 'in-kind' ? (
                  <fieldset className="rounded-md border border-slate-300 bg-slate-50 p-4">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Securities received</legend>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className={mpLabelClass}>Ticker / identifier <span className="text-red-700">*</span><input required value={draft.ticker} onChange={(event) => updateDraft(draft.id, { ticker: event.target.value })} placeholder="NVDA" className={mpInputClass} /></label>
                      <label className={mpLabelClass}>Security name<input value={draft.securityName} onChange={(event) => updateDraft(draft.id, { securityName: event.target.value })} placeholder="NVIDIA Corporation" className={mpInputClass} /></label>
                      <label className={mpLabelClass}>Shares / units <span className="text-red-700">*</span><input type="number" min="0" step="any" required value={draft.shares} onChange={(event) => updateDraft(draft.id, { shares: event.target.value })} className={mpInputClass} /></label>
                      <label className={mpLabelClass}>Cost basis per share <span className="text-red-700">*</span><input type="number" min="0" step="0.01" required value={draft.basisPerShare} onChange={(event) => updateDraft(draft.id, { basisPerShare: event.target.value })} className={mpInputClass} /></label>
                      <label className={mpLabelClass}>FMV per share on distribution date <span className="text-red-700">*</span><input type="number" min="0" step="0.01" required value={draft.fmvPerShare} onChange={(event) => updateDraft(draft.id, { fmvPerShare: event.target.value })} className={mpInputClass} /></label>
                      <dl className="self-end rounded-md border border-slate-200 bg-white p-3 text-xs">
                        <div className="flex justify-between gap-3"><dt className="text-slate-500">Distribution value</dt><dd className="font-mono font-semibold tabular-nums text-slate-950">${Number.isFinite(inKindValue) ? inKindValue.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}</dd></div>
                        <div className="mt-2 flex justify-between gap-3"><dt className="text-slate-500">Total cost basis</dt><dd className="font-mono tabular-nums text-slate-800">${Number.isFinite(totalBasis) ? totalBasis.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}</dd></div>
                      </dl>
                    </div>
                  </fieldset>
                ) : null}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className={mpLabelClass}>Source<input value={draft.source} onChange={(event) => updateDraft(draft.id, { source: event.target.value })} placeholder="Manager notice 06/12/2026" className={mpInputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">Provenance for the audit trail.</span></label>
                  <label className={mpLabelClass}>Note<textarea rows={3} value={draft.note} onChange={(event) => updateDraft(draft.id, { note: event.target.value })} placeholder="Context a reviewer would need later" className={`${mpInputClass} py-2`} /></label>
                </div>
                {rowErrors[draft.id] ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{rowErrors[draft.id]}</p> : null}
              </div>
            </section>
          )
        })}

        <MagicButton
          type="button"
          variant="secondary"
          disabled={drafts.length >= 20}
          onClick={() => setDrafts((current) => {
            const last = current.at(-1)
            const kind = last?.kind === 'CAPITAL_CALL' ? 'DISTRIBUTION' : 'CAPITAL_CALL'
            return [...current, cashActivityDraft({ activityDate: last?.activityDate ?? today(), source: last?.source ?? '', kind })]
          })}
          className="self-start"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add another activity
        </MagicButton>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-950">Settlement state</legend>
          <p className="mt-1 text-sm text-slate-500">Unsettled activity is tracked separately and excluded from the position until it settles.</p>
          <div className="mt-3 flex flex-wrap gap-6">
            <RadioLine checked={settlementStatus === 'SETTLED'} name="magic-settlement-state" value="settled" label="Settled" onChange={() => setSettlementStatus('SETTLED')} />
            <RadioLine checked={settlementStatus === 'ANNOUNCED'} name="magic-settlement-state" value="pending" label="Announced - awaiting settlement" onChange={() => setSettlementStatus('ANNOUNCED')} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Announced items remain in the ledger but do not affect paid-in capital, distributions, or performance until you record their settlement.</p>
        </fieldset>

        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      </form>
    </MagicDrawer>
  )
}

const valuationSources = [
  ['manager_statement', 'Manager statement'],
  ['valuation_409a', '409A valuation'],
  ['k1', 'Schedule K-1'],
  ['manual', 'Manual entry'],
] as const

type ValuationSource = (typeof valuationSources)[number][0]

function valuationDraft(entry?: PartnershipNavEntry): { source: ValuationSource; note: string } {
  if (!entry) return { source: 'manager_statement', note: '' }
  const taggedLabel = entry.note?.match(/^\[([^\]]+)\]/)?.[1]
  const taggedSource = valuationSources.find(([, label]) => label === taggedLabel)?.[0]
  return {
    source: taggedSource ?? entry.sourceType,
    note: entry.note?.replace(/^\[[^\]]+\]\s*/, '') ?? '',
  }
}

export function MagicPatternValuationDrawer({
  open,
  onClose,
  partnershipId,
  fundName,
  entry,
}: {
  open: boolean
  onClose: () => void
  partnershipId: string
  fundName: string
  entry?: PartnershipNavEntry
}) {
  const actions = usePartnershipTrackerActions()
  const initialDraft = valuationDraft(entry)
  const [valuationDate, setValuationDate] = useState(entry?.valuationDate ?? today())
  const [amount, setAmount] = useState(entry?.amount ?? '')
  const [source, setSource] = useState<ValuationSource>(initialDraft.source)
  const [note, setNote] = useState(initialDraft.note)
  const [error, setError] = useState<string>()
  const pending = actions.createNav.isPending || actions.updateNav.isPending

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    const parsed = normalizeCurrencyInput(amount, false)
    if (parsed.error || parsed.value == null || Number(parsed.value) < 0) return setError(parsed.error ?? 'Enter the reported value.')
    const sourceLabel = valuationSources.find(([value]) => value === source)?.[1] ?? 'Manual entry'
    const taggedNote = note.trim() ? `[${sourceLabel}] ${note.trim()}` : `[${sourceLabel}]`
    try {
      if (entry) {
        await actions.updateNav.mutateAsync({ id: partnershipId, entryId: entry.id, body: { amount: parsed.value, valuationDate, note: taggedNote, expectedUpdatedAt: entry.updatedAt } })
      } else {
        await actions.createNav.mutateAsync({ id: partnershipId, body: { amount: parsed.value, valuationDate, note: taggedNote } })
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof PartnershipTrackerApiError && caught.code === 'DUPLICATE_NAV_DATE' ? 'A valuation already exists for this exact date. Edit that entry instead.' : caught instanceof PartnershipTrackerApiError && caught.isStale ? 'This valuation changed while you were editing. Review the refreshed history.' : 'The valuation could not be saved.')
    }
  }

  return (
    <MagicDrawer
      open={open}
      onClose={onClose}
      title={entry ? 'Edit valuation' : 'Add NAV / FMV valuation'}
      description={`${fundName} · amounts in USD`}
      footer={
        <>
          <MagicButton type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</MagicButton>
          <MagicButton type="submit" form="magic-valuation-form" disabled={pending}>{pending ? 'Saving…' : entry ? 'Save valuation' : 'Add valuation'}</MagicButton>
        </>
      }
    >
      <form id="magic-valuation-form" onSubmit={submit} className="flex flex-col gap-5">
        <label className={mpLabelClass}>Valuation date <span className="text-red-700">*</span><input type="date" required value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} className={mpInputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">The period the value applies to — not the date it was received.</span></label>
        <label className={mpLabelClass}>NAV / FMV (USD) <span className="text-red-700">*</span><span className="relative block"><span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-slate-500">$</span><input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={`${mpInputClass} pl-7`} /></span><span className="mt-1 block text-xs font-normal text-slate-500">The newest valuation drives TVPI and IRR.</span></label>
        <label className={mpLabelClass}>Source<select value={source} onChange={(event) => setSource(event.target.value as typeof source)} className={mpInputClass}>{valuationSources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {source === 'k1' ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>Tax-sourced valuation.</strong> K-1 ending capital is a tax-basis figure, not a manager NAV.</p> : null}
        <label className={mpLabelClass}>Note<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Statement reference, adjustments, or reconciliation context…" className={`${mpInputClass} py-2`} /></label>
        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      </form>
    </MagicDrawer>
  )
}
