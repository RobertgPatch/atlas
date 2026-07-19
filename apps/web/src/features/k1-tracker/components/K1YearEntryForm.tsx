import { useEffect, useMemo, useState } from 'react'
import { CurrencyInput } from '../../../components/shared/CurrencyField'
import { formatCurrency, normalizeCurrencyInput } from '../../../components/shared/currencyInput'
import type { K1TrackerCalculation, K1TrackerFieldChange, K1TrackerYearDetail } from '../../../../../../packages/types/src/k1-tracker'
import { K1_EDITABLE_FIELDS, K1_FIELD_GROUPS } from '../k1FieldGroups'

type FieldKey = K1TrackerFieldChange['fieldKey']

const displayCurrency = (value: string | null | undefined) => value == null
  ? 'Not available'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value))

const initialAmounts = (detail: K1TrackerYearDetail): Record<string, string> => Object.fromEntries(
  K1_EDITABLE_FIELDS.map((field) => {
    const source = detail.values.find((value) => value.fieldKey === field.key)
    return [field.key, source?.amount == null ? '' : formatCurrency(source.amount)]
  }),
)

const carryforwardFor = (detail: K1TrackerYearDetail, key: FieldKey): string | undefined => {
  const values: Partial<Record<FieldKey, unknown>> = {
    opening_outside_basis: detail.calculation.basis.beginningOutsideBasis,
    opening_suspended_loss: detail.calculation.lossLimitation.priorSuspendedLoss,
    liability_nonrecourse_beginning: detail.calculation.liabilities.nonrecourseBeginning,
    liability_qualified_nonrecourse_beginning: detail.calculation.liabilities.qualifiedNonrecourseBeginning,
    liability_recourse_beginning: detail.calculation.liabilities.recourseBeginning,
    section_l_beginning_capital: detail.calculation.sectionL.reportedBeginning,
  }
  return typeof values[key] === 'string' ? values[key] : undefined
}

export function K1YearEntryForm({ detail, canEdit, pending, onCalculate, onSave, onDirtyChange }: {
  detail: K1TrackerYearDetail
  canEdit: boolean
  pending: boolean
  onCalculate: (changes: K1TrackerFieldChange[]) => Promise<K1TrackerCalculation | undefined>
  onSave: (changes: K1TrackerFieldChange[]) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}) {
  const initial = useMemo(() => initialAmounts(detail), [detail])
  const sourceByField = useMemo(() => new Map(detail.values.map((value) => [value.fieldKey, value])), [detail.values])
  const datedFields = useMemo<Set<FieldKey>>(() => new Set((detail.cashFlowEvents?.map((event) => event.kind === 'CAPITAL_CALL' ? 'capital_contributions' : 'box_19_distributions') ?? []) as FieldKey[]), [detail.cashFlowEvents])
  const legacyLine13 = sourceByField.get('box_13_other_deductions')
  const usesSplitLine13 = sourceByField.has('box_13_other_portfolio_deductions') || sourceByField.has('box_13_management_fees')
  const [amounts, setAmounts] = useState<Record<string, string>>(initial)
  const [override, setOverride] = useState(false)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<string>()
  const [draft, setDraft] = useState<K1TrackerCalculation>()

  const dirty = Object.keys(initial).some((key) => amounts[key] !== initial[key]) || override || Boolean(reason)
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false) }, [dirty, onDirtyChange])

  const buildChanges = (): K1TrackerFieldChange[] | undefined => {
    if (override && !reason.trim()) { setNotice('State why this source value is being overridden.'); return undefined }
    const changes: K1TrackerFieldChange[] = []
    for (const field of K1_EDITABLE_FIELDS) {
      if (datedFields.has(field.key)) continue
      const next = normalizeCurrencyInput(amounts[field.key] ?? '', field.allowNegative)
      const prior = normalizeCurrencyInput(initial[field.key] ?? '', field.allowNegative)
      if (next.error) { setNotice(`${field.label}: ${next.error}`); return undefined }
      if (next.value !== prior.value) {
        changes.push({ fieldKey: field.key, amount: next.value, sourceType: override ? 'MANUAL_OVERRIDE' : 'MANUAL_ENTRY', overrideReason: override ? reason.trim() : undefined })
      }
    }
    if (!changes.length) { setNotice('Change at least one value before previewing or saving.'); return undefined }
    return changes
  }

  const preview = async () => {
    const changes = buildChanges()
    if (!changes) return
    try {
      const result = await onCalculate(changes)
      setDraft(result)
      setNotice(result ? 'Draft calculation refreshed. Review the results below before saving.' : 'Draft calculation completed.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to refresh the draft calculation.') }
  }
  const save = async () => {
    const changes = buildChanges()
    if (!changes) return
    try { await onSave(changes); setNotice('Manual K-1 revisions saved and dependent years recalculated.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save revisions.') }
  }
  const revert = () => { setAmounts(initial); setOverride(false); setReason(''); setDraft(undefined); setNotice(undefined) }

  return <form onSubmit={(event) => { event.preventDefault(); void save() }} className="border border-gray-200 bg-white">
    <div className="border-b border-gray-200 px-5 py-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{detail.taxYear} K-1 annual entry</p><h3 className="mt-1 text-lg font-semibold text-gray-950">Manual K-1 inputs</h3><p className="mt-1 text-sm text-gray-600">All supported annual values are on this page. Each save appends an auditable revision.</p>{datedFields.size > 0 && <p className="mt-3 border-l-2 border-jackson-gold bg-jackson-light px-3 py-2 text-sm text-gray-700">Capital contributions and distributions with dated activity are read-only here. Update their individual rows above; the annual totals and XIRR will recalculate automatically.</p>}</div>
    {legacyLine13 && !usesSplitLine13 && <p className="mx-5 mt-4 border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">Historical combined Line 13 value: {displayCurrency(legacyLine13.amount)} ({legacyLine13.sourceType.replaceAll('_', ' ')}). It remains effective until either new Line 13 field is saved.</p>}
    {notice && <p role="status" className="mx-5 mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}
    <div className="divide-y divide-gray-200">
      {K1_FIELD_GROUPS.map((group) => <section key={group.id} aria-labelledby={`${group.id}-heading`} className="px-5 py-6"><h4 id={`${group.id}-heading`} className="text-base font-semibold text-gray-950">{group.title}</h4><p className="mt-1 text-sm text-gray-600">{group.description}</p><p className="mt-2 text-xs text-sky-800">Sign guidance: {group.signHint}</p><div className="mt-4 grid gap-x-5 gap-y-4 md:grid-cols-2">{group.fields.map((field) => { const source = sourceByField.get(field.key); const carryforward = !source && field.carryforward ? carryforwardFor(detail, field.key) : undefined; const isDated = datedFields.has(field.key); return <label key={field.key} className="block"><span className="text-sm font-medium text-gray-800">{field.label}</span><CurrencyInput aria-label={field.label} disabled={!canEdit || isDated} allowNegative={field.allowNegative} value={amounts[field.key] ?? ''} onChange={(value) => setAmounts((current) => ({ ...current, [field.key]: value }))} placeholder={carryforward ? formatCurrency(carryforward) : '$0.00'} />{isDated ? <span className="mt-1 block text-xs font-medium text-jackson-hover">Calculated from dated cash activity</span> : source ? <span className="mt-1 block text-xs text-gray-500">{source.sourceType.replaceAll('_', ' ')}</span> : carryforward ? <span className="mt-1 block text-xs text-gray-500">Carried from the prior year: {displayCurrency(carryforward)}</span> : null}</label> })}</div></section>)}
    </div>
    {canEdit && <section className="border-t border-gray-200 px-5 py-5"><label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} className="mt-1" /><span><span className="font-medium">Manual override</span><br /><span className="text-xs text-gray-500">Use when replacing a prior sourced value with a reasoned correction.</span></span></label>{override && <label className="mt-4 block"><span className="text-sm font-medium text-gray-800">Override reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" /></label>}</section>}
    {draft && <section aria-live="polite" className="grid gap-4 border-t border-amber-200 bg-amber-50 px-5 py-4 sm:grid-cols-3"><div><p className="text-xs text-amber-800">Draft ending basis</p><p className="font-semibold text-gray-950">{displayCurrency(draft.basis.endingOutsideBasis as string | null)}</p></div><div><p className="text-xs text-amber-800">Draft status</p><p className="font-semibold text-gray-950">{draft.summary.status.replaceAll('_', ' ')}</p></div><div><p className="text-xs text-amber-800">Checks needing attention</p><p className="font-semibold text-gray-950">{draft.checks.filter((check) => check.status !== 'PASS').length}</p></div></section>}
    {canEdit && <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 bg-white px-5 py-4"><button type="button" onClick={revert} disabled={!dirty || pending} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50">Revert</button><button type="button" onClick={() => void preview()} disabled={pending} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50">Preview calculation</button><button type="submit" disabled={pending} className="rounded-md bg-jackson-gold px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save revisions</button></div>}
  </form>
}
