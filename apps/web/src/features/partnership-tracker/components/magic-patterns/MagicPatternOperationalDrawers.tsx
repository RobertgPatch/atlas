import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type {
  CreatePartnershipCashFlowRequest,
  CreatePartnershipNavEntryRequest,
  PartnershipNavEntry,
} from '../../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerCashFlowEvent, K1TrackerCashFlowKind } from '../../../../../../../packages/types/src/k1-tracker'
import { normalizeCurrencyInput } from '../../../../components/shared/currencyInput'
import { PartnershipTrackerApiError } from '../../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../../hooks/usePartnershipTracker'
import { extractActivitySource, formatInKindActivityNote, parseInKindActivityNote } from './MagicPatternOperationalUtils'
import {
  MagicButton,
  MagicDrawer,
  mpInputClass,
  mpLabelClass,
} from './MagicPatternPrimitives'

const today = () => new Date().toISOString().slice(0, 10)

const valuationSources = [
  ['manager_statement', 'Manager statement'],
  ['valuation_409a', '409A valuation'],
  ['k1', 'Schedule K-1'],
  ['manual', 'Manual entry'],
] as const

type ValuationSource = (typeof valuationSources)[number][0]
type ActivityDraftKind = K1TrackerCashFlowKind | 'VALUATION'

interface CashActivityDraft {
  feesAndCarry: string
  isFinalLiquidation: boolean
  id: number
  kind: ActivityDraftKind
  activityDate: string
  amount: string
  settlement: 'cash' | 'in-kind'
  ticker: string
  securityName: string
  shares: string
  basisPerShare: string
  fmvPerShare: string
  source: string
  valuationSource: ValuationSource
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
  feesAndCarry: '',
  isFinalLiquidation: false,
  settlement: 'cash',
  ticker: '',
  securityName: '',
  shares: '',
  basisPerShare: '',
  fmvPerShare: '',
  source: template?.source ?? '',
  valuationSource: 'manager_statement',
  note: '',
})

const cashActivityDraftFromEntry = (entry: K1TrackerCashFlowEvent): CashActivityDraft => {
  const inKind = parseInKindActivityNote(entry.note)
  const parsedNote = extractActivitySource(entry.note)
  return {
    id: ++nextCashActivityDraftId,
    kind: entry.kind,
    activityDate: entry.activityDate,
    amount: entry.amount,
    feesAndCarry: entry.feesAndCarry ?? '0',
    isFinalLiquidation: entry.isFinalLiquidation ?? false,
    settlement: inKind ? 'in-kind' : 'cash',
    ticker: inKind?.ticker ?? '',
    securityName: inKind?.hasExplicitName ? inKind.name : '',
    shares: inKind ? String(inKind.shares) : '',
    basisPerShare: inKind ? String(inKind.costBasisPerShare) : '',
    fmvPerShare: inKind ? String(inKind.fmvPerShare) : '',
    source: inKind?.source ?? (parsedNote.source === 'Source not recorded' ? '' : parsedNote.source),
    valuationSource: 'manager_statement',
    note: inKind?.note ?? (parsedNote.note === '—' ? '' : parsedNote.note),
  }
}

const activityOptions: Array<{ kind: ActivityDraftKind; label: string; description: string }> = [
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
  {
    kind: 'VALUATION',
    label: 'Valuation',
    description: 'Record dated NAV or fair market value. The latest valuation feeds TVPI and IRR.',
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
        className="mt-0.5 h-4 w-4 border-slate-300 text-blue-600 focus:ring-focus"
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
  entry,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  partnershipId: string
  fundName: string
  entry?: K1TrackerCashFlowEvent
  onSaved?: () => void
}) {
  const actions = usePartnershipTrackerActions()
  const [drafts, setDrafts] = useState<CashActivityDraft[]>(() => [entry ? cashActivityDraftFromEntry(entry) : cashActivityDraft()])
  const [settlementStatus, setSettlementStatus] = useState<'ANNOUNCED' | 'SETTLED'>(entry?.settlementStatus ?? 'SETTLED')
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [error, setError] = useState<string>()
  const pending = actions.createCashFlows.isPending || actions.updateCashFlow.isPending || actions.createNav.isPending

  const updateDraft = (id: number, changes: Partial<CashActivityDraft>) => {
    setError(undefined)
    setDrafts((current) => current.map((draft) => {
      if (draft.id !== id) return changes.isFinalLiquidation ? { ...draft, isFinalLiquidation: false } : draft
      const next = { ...draft, ...changes }
      if (next.kind === 'CAPITAL_CALL' || next.kind === 'VALUATION') next.settlement = 'cash'
      if (next.kind !== 'DISTRIBUTION') next.isFinalLiquidation = false
      return next
    }))
    setRowErrors((current) => {
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const resolveDraft = (draft: CashActivityDraft):
    | { type: 'cash-flow'; body: CreatePartnershipCashFlowRequest }
    | { type: 'valuation'; body: CreatePartnershipNavEntryRequest }
    | string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.activityDate)) return 'Select the activity date.'

    if (draft.kind === 'VALUATION') {
      const parsed = normalizeCurrencyInput(draft.amount, false)
      if (parsed.error || parsed.value == null || Number(parsed.value) < 0) {
        return parsed.error ?? 'Enter the reported NAV or fair market value.'
      }
      const valuationSourceLabel = valuationSources.find(([value]) => value === draft.valuationSource)?.[1] ?? 'Manual entry'
      const taggedNote = draft.note.trim()
        ? `[${valuationSourceLabel}] ${draft.note.trim()}`
        : `[${valuationSourceLabel}]`
      return {
        type: 'valuation',
        body: {
          amount: parsed.value,
          valuationDate: draft.activityDate,
          note: taggedNote,
        },
      }
    }

    const feesAndCarry = draft.feesAndCarry.trim().replace(/[$,\s]/g, '') || '0'
    if (!/^\d{1,16}(\.\d{1,4})?$/.test(feesAndCarry)) return 'Enter nonnegative fees and carry with at most four decimal places.'

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
      const amount = parsed.value ?? (draft.kind === 'CAPITAL_CALL' && draft.amount.trim() === '' && Number(feesAndCarry) > 0 ? '0.00' : null)
      if (parsed.error || amount == null || (Number(amount) === 0 && (draft.kind !== 'CAPITAL_CALL' || Number(feesAndCarry) === 0))) {
        return parsed.error ?? (draft.kind === 'CAPITAL_CALL'
          ? 'Enter an amount greater than zero, or enter fees and carry for a zero capital call.'
          : 'Enter an amount greater than zero.')
      }
      resolvedAmount = amount
      if (draft.source.trim()) {
        activityNote = activityNote
          ? `Source: ${draft.source.trim()} — ${activityNote}`
          : `Source: ${draft.source.trim()}`
      }
    }

    return {
      type: 'cash-flow',
      body: {
        kind: draft.kind,
        activityDate: draft.activityDate,
        amount: resolvedAmount,
        ...(Number(feesAndCarry) > 0 ? { feesAndCarry } : {}),
        ...(draft.isFinalLiquidation ? { isFinalLiquidation: true } : {}),
        ...(settlementStatus === 'ANNOUNCED' ? { settlementStatus } : {}),
        note: activityNote || null,
      },
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    const cashFlowEntries: CreatePartnershipCashFlowRequest[] = []
    const valuationEntries: CreatePartnershipNavEntryRequest[] = []
    const nextErrors: Record<number, string> = {}
    const valuationDates = new Set<string>()
    for (const draft of drafts) {
      const resolved = resolveDraft(draft)
      if (typeof resolved === 'string') nextErrors[draft.id] = resolved
      else if (resolved.type === 'cash-flow') cashFlowEntries.push(resolved.body)
      else if (valuationDates.has(resolved.body.valuationDate)) nextErrors[draft.id] = 'Only one valuation can be recorded for a date.'
      else {
        valuationDates.add(resolved.body.valuationDate)
        valuationEntries.push(resolved.body)
      }
    }
    setRowErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return setError(entry ? 'Review the highlighted activity before saving.' : 'Review the highlighted activities before recording the batch.')

    try {
      if (entry) {
        const body = cashFlowEntries[0]
        if (!body) return setError('Select a capital call or distribution to save this correction.')
        await actions.updateCashFlow.mutateAsync({
          id: partnershipId,
          cashFlowId: entry.id,
          body: {
            ...body,
            feesAndCarry: body.feesAndCarry ?? '0',
            isFinalLiquidation: body.isFinalLiquidation ?? false,
            settlementStatus,
            expectedUpdatedAt: entry.updatedAt,
          },
        })
      } else if (cashFlowEntries.length > 0) {
        await actions.createCashFlows.mutateAsync({
          id: partnershipId,
          body: { entries: cashFlowEntries },
        })
      }
      for (const body of valuationEntries) {
        await actions.createNav.mutateAsync({ id: partnershipId, body })
      }
      setDrafts([cashActivityDraft()])
      setSettlementStatus('SETTLED')
      setRowErrors({})
      onSaved?.()
      onClose()
    } catch (caught) {
      const apiMessage = caught instanceof PartnershipTrackerApiError
        && caught.payload && typeof caught.payload === 'object' && 'message' in caught.payload
        ? String((caught.payload as { message: unknown }).message)
        : undefined
      setError(caught instanceof PartnershipTrackerApiError && caught.isStale
        ? 'This activity changed while you were editing. Review the refreshed ledger and try again.'
        : caught instanceof PartnershipTrackerApiError && caught.code === 'DUPLICATE_NAV_DATE'
        ? 'A valuation already exists for this date. Edit that entry instead.'
        : apiMessage ?? (caught instanceof PartnershipTrackerApiError
          ? `The activity could not be ${entry ? 'saved' : 'recorded'}.`
          : caught instanceof Error ? caught.message : `The activity could not be ${entry ? 'saved' : 'recorded'}.`))
    }
  }

  return (
    <MagicDrawer
      open={open}
      onClose={onClose}
      title={entry ? 'Edit capital activity' : 'Record activity'}
      description={entry ? `${fundName} · correct the activity and save it to the audit trail` : `${fundName} - add up to 20 activities and record them together`}
      footer={
        <>
          <MagicButton type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</MagicButton>
          <MagicButton type="submit" form="magic-cash-activity-form" disabled={pending}>
            {pending
              ? entry ? 'Saving...' : 'Recording...'
              : entry
                ? 'Save changes'
                : drafts.length === 1
                ? 'Record activity'
                : `Record ${drafts.length} activities`}
          </MagicButton>
        </>
      }
    >
      <form id="magic-cash-activity-form" onSubmit={submit} className="flex flex-col gap-5">
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-5 text-blue-950">
          {entry
            ? 'Correct the activity type, date, amount, fees, settlement state, source, or notes. Performance figures will be recalculated after saving.'
            : 'Add capital calls, distributions, and valuations from one place. Each entry is validated before it is saved to the appropriate activity history.'}
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
                    {entry ? 'Capital activity' : `Activity ${index + 1}`}
                  </h3>
                  <p className="mt-0.5 text-xs leading-4 text-slate-500">{option?.description}</p>
                </div>
                {drafts.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove activity ${index + 1}`}
                    onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"
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
                      onChange={(event) => updateDraft(draft.id, { kind: event.target.value as ActivityDraftKind })}
                      className={mpInputClass}
                    >
                      {activityOptions.filter((item) => !entry || item.kind !== 'VALUATION').map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className={mpLabelClass}>
                    {draft.kind === 'VALUATION' ? 'Valuation date' : settlementStatus === 'ANNOUNCED' ? 'Announcement date' : 'Activity date'} <span className="text-red-700">*</span>
                    <input type="date" required value={draft.activityDate} onChange={(event) => updateDraft(draft.id, { activityDate: event.target.value })} className={mpInputClass} />
                  </label>
                  {draft.kind !== 'CAPITAL_CALL' && draft.kind !== 'VALUATION' ? (
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
                      {draft.kind === 'VALUATION' ? 'NAV / FMV (USD)' : 'Amount (USD)'} {draft.kind !== 'CAPITAL_CALL' ? <span className="text-red-700">*</span> : null}
                      <span className="relative block">
                        <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-slate-500">$</span>
                        <input required={draft.kind !== 'CAPITAL_CALL'} inputMode="decimal" value={draft.amount} onChange={(event) => updateDraft(draft.id, { amount: event.target.value })} className={`${mpInputClass} pl-7`} />
                      </span>
                      <span className="mt-1 block text-xs font-normal leading-4 text-slate-500">{draft.kind === 'VALUATION' ? 'The newest valuation drives TVPI and IRR.' : draft.kind === 'CAPITAL_CALL' ? 'Enter the gross capital contribution before fees. Leave blank to record only fees and carry.' : 'Enter the gross distribution before fees and carry. Net returns subtract the fees below.'}</span>
                    </label>
                  ) : null}
                </div>

                {draft.kind !== 'VALUATION' ? <label className={mpLabelClass}>
                  Fees &amp; carry (USD)
                  <input inputMode="decimal" value={draft.feesAndCarry} onChange={(event) => updateDraft(draft.id, { feesAndCarry: event.target.value })} placeholder="0" className={mpInputClass} />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Enter actual fees and carry as a positive deduction from net performance. Blank means zero.</span>
                </label> : null}

                {draft.kind === 'DISTRIBUTION' ? <label className="flex items-start gap-3 rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                  <input type="checkbox" checked={draft.isFinalLiquidation} onChange={(event) => {
                    if (event.target.checked) setSettlementStatus('SETTLED')
                    updateDraft(draft.id, { isFinalLiquidation: event.target.checked })
                  }} className="mt-0.5 h-4 w-4 rounded border-slate-400 text-blue-600 focus:ring-focus" />
                  <span><span className="block font-semibold">Final Liquidation</span><span className="mt-1 block text-xs font-normal leading-5 text-slate-600">Mark this settled distribution as the final liquidation. Its activity date will populate the Investment Performance table.</span></span>
                </label> : null}

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
                  {draft.kind === 'VALUATION' ? (
                    <label className={mpLabelClass}>Source<select value={draft.valuationSource} onChange={(event) => updateDraft(draft.id, { valuationSource: event.target.value as ValuationSource })} className={mpInputClass}>{valuationSources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">The source appears in valuation history.</span></label>
                  ) : (
                    <label className={mpLabelClass}>Source<input value={draft.source} onChange={(event) => updateDraft(draft.id, { source: event.target.value })} placeholder="Manager notice 06/12/2026" className={mpInputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">Provenance for the audit trail.</span></label>
                  )}
                  <label className={mpLabelClass}>Note<textarea rows={3} value={draft.note} onChange={(event) => updateDraft(draft.id, { note: event.target.value })} placeholder="Context a reviewer would need later" className={`${mpInputClass} py-2`} /></label>
                </div>
                {draft.kind === 'VALUATION' && draft.valuationSource === 'k1' ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>Tax-sourced valuation.</strong> K-1 ending capital is a tax-basis figure, not a manager NAV.</p> : null}
                {rowErrors[draft.id] ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{rowErrors[draft.id]}</p> : null}
              </div>
            </section>
          )
        })}

        {!entry ? <MagicButton
          type="button"
          variant="secondary"
          disabled={drafts.length >= 20}
          onClick={() => setDrafts((current) => {
            const last = current.at(-1)
            const kind: ActivityDraftKind = last?.kind === 'CAPITAL_CALL' ? 'DISTRIBUTION' : 'CAPITAL_CALL'
            return [...current, cashActivityDraft({ activityDate: last?.activityDate ?? today(), source: last?.source ?? '', kind })]
          })}
          className="self-start"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add another activity
        </MagicButton> : null}
        {drafts.some((draft) => draft.kind !== 'VALUATION') ? <fieldset>
          <legend className="text-sm font-semibold text-slate-950">Settlement state</legend>
          <p className="mt-1 text-sm text-slate-500">Unsettled activity is tracked separately and excluded from the position until it settles.</p>
          <div className="mt-3 flex flex-wrap gap-6">
            <RadioLine checked={settlementStatus === 'SETTLED'} name="magic-settlement-state" value="settled" label="Settled" onChange={() => setSettlementStatus('SETTLED')} />
            <RadioLine checked={settlementStatus === 'ANNOUNCED'} name="magic-settlement-state" value="pending" label="Announced - awaiting settlement" disabled={drafts.some((draft) => draft.isFinalLiquidation)} onChange={() => setSettlementStatus('ANNOUNCED')} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Announced items remain in the ledger but do not affect paid-in capital, distributions, or performance until you record their settlement.</p>
        </fieldset> : null}

        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      </form>
    </MagicDrawer>
  )
}

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
