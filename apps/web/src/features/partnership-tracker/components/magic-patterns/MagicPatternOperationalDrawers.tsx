import { useMemo, useState } from 'react'
import type { PartnershipNavEntry } from '../../../../../../../packages/types/src/partnership-tracker'
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
  existingYears,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  partnershipId: string
  fundName: string
  existingYears: number[]
  onSaved?: () => void
}) {
  const actions = usePartnershipTrackerActions()
  const [kind, setKind] = useState<K1TrackerCashFlowKind>('CAPITAL_CALL')
  const [activityDate, setActivityDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [settlement, setSettlement] = useState<'cash' | 'in-kind'>('cash')
  const [ticker, setTicker] = useState('')
  const [securityName, setSecurityName] = useState('')
  const [shares, setShares] = useState('')
  const [basisPerShare, setBasisPerShare] = useState('')
  const [fmvPerShare, setFmvPerShare] = useState('')
  const [source, setSource] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()

  const inKindValue = useMemo(() => Number(shares) * Number(fmvPerShare), [fmvPerShare, shares])
  const totalBasis = useMemo(() => Number(shares) * Number(basisPerShare), [basisPerShare, shares])
  const pending = actions.createYear.isPending || actions.createCashFlow.isPending

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    const taxYear = Number(activityDate.slice(0, 4))
    if (!Number.isInteger(taxYear)) return setError('Select the activity date.')

    let resolvedAmount: string
    let activityNote = note.trim()
    if (settlement === 'in-kind') {
      if (!ticker.trim() || Number(shares) <= 0 || Number(fmvPerShare) <= 0 || Number(basisPerShare) < 0) {
        return setError('Enter the security identifier, share count, carried basis, and fair market value.')
      }
      resolvedAmount = inKindValue.toFixed(2)
      activityNote = formatInKindActivityNote({
        ticker,
        securityName,
        shares: Number(shares),
        costBasisPerShare: Number(basisPerShare),
        fmvPerShare: Number(fmvPerShare),
        source,
        note,
      })
    } else {
      const parsed = normalizeCurrencyInput(amount, false)
      if (parsed.error || parsed.value == null || Number(parsed.value) <= 0) {
        return setError(parsed.error ?? 'Enter an amount greater than zero.')
      }
      resolvedAmount = parsed.value
      if (source.trim()) activityNote = activityNote ? `Source: ${source.trim()} — ${activityNote}` : `Source: ${source.trim()}`
    }

    try {
      if (!existingYears.includes(taxYear)) {
        await actions.createYear.mutateAsync({ id: partnershipId, year: taxYear })
      }
      await actions.createCashFlow.mutateAsync({
        id: partnershipId,
        year: taxYear,
        body: { kind, activityDate, amount: resolvedAmount, note: activityNote || null },
      })
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
      description={`${fundName} · amounts in USD`}
      footer={
        <>
          <MagicButton type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</MagicButton>
          <MagicButton type="submit" form="magic-cash-activity-form" disabled={pending}>
            {pending ? 'Recording…' : 'Record activity'}
          </MagicButton>
        </>
      }
    >
      <form id="magic-cash-activity-form" onSubmit={submit} className="flex flex-col gap-6">
        <fieldset>
          <legend className="text-sm font-semibold text-slate-950">Activity type</legend>
          <p className="mt-1 text-sm text-slate-500">Capital calls read as outflows; distributions read as inflows.</p>
          <div className="mt-3 space-y-3">
            {activityOptions.map((option) => (
              <RadioLine
                key={option.kind}
                checked={kind === option.kind}
                name="magic-activity-kind"
                value={option.kind}
                label={option.label}
                description={option.description}
                onChange={() => {
                  setKind(option.kind)
                  if (option.kind === 'CAPITAL_CALL') setSettlement('cash')
                }}
              />
            ))}
          </div>
        </fieldset>

        {kind !== 'CAPITAL_CALL' ? (
          <fieldset>
            <legend className="text-sm font-semibold text-slate-950">Received as</legend>
            <p className="mt-1 text-sm text-slate-500">Distributions can settle in cash or in kind as securities with a carried-over cost basis.</p>
            <div className="mt-3 flex flex-wrap gap-6">
              <RadioLine checked={settlement === 'cash'} name="magic-settlement" value="cash" label="Cash" onChange={() => setSettlement('cash')} />
              <RadioLine checked={settlement === 'in-kind'} name="magic-settlement" value="in-kind" label="Securities (in kind)" onChange={() => setSettlement('in-kind')} />
            </div>
          </fieldset>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={mpLabelClass}>
            Activity date <span className="text-red-700">*</span>
            <input type="date" required value={activityDate} onChange={(event) => setActivityDate(event.target.value)} className={mpInputClass} />
          </label>
          {settlement === 'cash' ? (
            <label className={mpLabelClass}>
              Amount (USD) <span className="text-red-700">*</span>
              <span className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-slate-500">$</span>
                <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={`${mpInputClass} pl-7`} />
              </span>
              <span className="mt-1 block text-xs font-normal leading-4 text-slate-500">Enter the absolute amount — direction comes from the activity type.</span>
            </label>
          ) : null}
        </div>

        {settlement === 'in-kind' ? (
          <fieldset className="rounded-md border border-slate-300 bg-slate-50 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Securities received</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={mpLabelClass}>Ticker / identifier <span className="text-red-700">*</span><input required value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder="NVDA" className={mpInputClass} /></label>
              <label className={mpLabelClass}>Security name<input value={securityName} onChange={(event) => setSecurityName(event.target.value)} placeholder="NVIDIA Corporation" className={mpInputClass} /></label>
              <label className={mpLabelClass}>Shares / units <span className="text-red-700">*</span><input type="number" min="0" step="any" required value={shares} onChange={(event) => setShares(event.target.value)} className={mpInputClass} /></label>
              <label className={mpLabelClass}>Cost basis per share <span className="text-red-700">*</span><input type="number" min="0" step="0.01" required value={basisPerShare} onChange={(event) => setBasisPerShare(event.target.value)} className={mpInputClass} /></label>
              <label className={mpLabelClass}>FMV per share on distribution date <span className="text-red-700">*</span><input type="number" min="0" step="0.01" required value={fmvPerShare} onChange={(event) => setFmvPerShare(event.target.value)} className={mpInputClass} /></label>
              <dl className="self-end rounded-md border border-slate-200 bg-white p-3 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Distribution value</dt><dd className="font-mono font-semibold tabular-nums text-slate-950">${Number.isFinite(inKindValue) ? inKindValue.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}</dd></div>
                <div className="mt-2 flex justify-between gap-3"><dt className="text-slate-500">Total cost basis</dt><dd className="font-mono tabular-nums text-slate-800">${Number.isFinite(totalBasis) ? totalBasis.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}</dd></div>
              </dl>
            </div>
          </fieldset>
        ) : null}

        <fieldset>
          <legend className="text-sm font-semibold text-slate-950">Settlement state</legend>
          <p className="mt-1 text-sm text-slate-500">Unsettled activity is tracked separately and excluded from the position until it settles.</p>
          <div className="mt-3 flex flex-wrap gap-6">
            <RadioLine checked name="magic-settlement-state" value="settled" label="Settled" onChange={() => undefined} />
            <RadioLine checked={false} disabled name="magic-settlement-state" value="pending" label="Announced — awaiting settlement" onChange={() => undefined} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Atlas currently persists settled activity; announced items remain read-only until the settlement workflow is available.</p>
        </fieldset>

        <label className={mpLabelClass}>Source<input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Manager notice 06/12/2026" className={mpInputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">Provenance for the audit trail. Left blank, the ledger reads “Source not recorded”.</span></label>
        <label className={mpLabelClass}>Note<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Context a reviewer would need in a year's time…" className={`${mpInputClass} py-2`} /></label>
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
