import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { K1TrackerCalculation, K1TrackerFieldChange, K1TrackerYearDetail } from '../../../../../packages/types/src/k1-tracker'

type FieldKey = K1TrackerFieldChange['fieldKey']
type EditorStep = { id: string; title: string; help: string; signHint: string; fields: FieldKey[] }

const EDITOR_STEPS: EditorStep[] = [
  { id: 'source', title: 'Source', help: 'Opening balances and prior suspended losses carry forward when no source value is entered.', signHint: 'Leave a carried amount blank unless a source document requires an override.', fields: ['opening_outside_basis', 'opening_suspended_loss'] },
  { id: 'capital', title: 'Capital', help: 'Keep outside-basis contributions separate from Section L capital account movements.', signHint: 'Contributions and increases are positive. Withdrawals are negative in Section L.', fields: ['capital_contributions', 'section_l_beginning_capital', 'section_l_capital_contributed', 'section_l_current_year_net_income_loss', 'section_l_other_increase_decrease', 'section_l_withdrawals_distributions', 'section_l_ending_capital'] },
  { id: 'income', title: 'Income / gains', help: 'Enter the signed K-1 amounts as shown by the source.', signHint: 'Income and gains are positive; losses on these lines are negative.', fields: ['box_1_ordinary_income_loss', 'box_2_net_rental_real_estate_income_loss', 'box_3_other_net_rental_income_loss', 'box_4c_guaranteed_payments', 'box_5_interest_income', 'box_6a_ordinary_dividends', 'box_7_royalties', 'box_8_net_short_term_capital_gain_loss', 'box_9a_net_long_term_capital_gain_loss', 'box_10_net_section_1231_gain_loss', 'box_11_other_income_loss', 'box_18b_tax_exempt_income'] },
  { id: 'decreases', title: 'Losses / deductions', help: 'These entries reduce basis and are evaluated by the loss and distribution limits.', signHint: 'Enter deductions and distributions as positive decrease amounts.', fields: ['box_12_section_179_deduction', 'box_13_other_deductions', 'box_18a_nondeductible_expenses', 'box_21_foreign_taxes', 'box_19_distributions'] },
  { id: 'liabilities', title: 'Liabilities', help: 'Enter the three Item K liability classes. Missing beginning values carry forward from the prior year.', signHint: 'Balances are positive amounts; the tracker calculates the increase or relief.', fields: ['liability_nonrecourse_beginning', 'liability_nonrecourse_ending', 'liability_qualified_nonrecourse_beginning', 'liability_qualified_nonrecourse_ending', 'liability_recourse_beginning', 'liability_recourse_ending'] },
  { id: 'review', title: 'Review', help: 'Book balances and reconciling items explain the difference between Section L and tax basis.', signHint: 'Use signed book and reconciling amounts exactly as supported by the workpapers.', fields: ['book_capital_account', 'book_interest_income', 'book_dividend_income', 'book_realized_capital_gain_loss', 'book_other_partnership_income_loss', 'recon_section_704c', 'recon_section_754', 'recon_timing_differences', 'recon_other_permanent_differences'] },
]

const fieldLabel = (key: string) => key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const currency = (value: unknown) => typeof value === 'string' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value)) : 'not available'
const carryforwardFor = (detail: K1TrackerYearDetail, key: FieldKey): string | undefined => {
  const calculation = detail.calculation
  if (!calculation) return undefined
  const values: Partial<Record<FieldKey, unknown>> = {
    opening_outside_basis: calculation.basis.beginningOutsideBasis,
    opening_suspended_loss: calculation.lossLimitation.priorSuspendedLoss,
    liability_nonrecourse_beginning: calculation.liabilities.nonrecourseBeginning,
    liability_qualified_nonrecourse_beginning: calculation.liabilities.qualifiedNonrecourseBeginning,
    liability_recourse_beginning: calculation.liabilities.recourseBeginning,
    section_l_beginning_capital: calculation.sectionL.reportedBeginning,
  }
  return typeof values[key] === 'string' ? values[key] as string : undefined
}

export function EditYearDrawer({ detail, pending, onClose, onCalculate, onSave }: { detail: K1TrackerYearDetail; pending: boolean; onClose: () => void; onCalculate: (changes: K1TrackerFieldChange[]) => Promise<K1TrackerCalculation | undefined>; onSave: (changes: K1TrackerFieldChange[]) => Promise<void> }) {
  const initial = useMemo(() => Object.fromEntries(detail.values.map((value) => [value.fieldKey, value.amount ?? ''])), [detail.values])
  const sourceByField = useMemo(() => new Map(detail.values.map((value) => [value.fieldKey, value])), [detail.values])
  const [amounts, setAmounts] = useState<Record<string, string>>(initial)
  const [activeStep, setActiveStep] = useState(0)
  const [override, setOverride] = useState(false)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<string>()
  const [draft, setDraft] = useState<K1TrackerCalculation>()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const changedRef = useRef(false)
  const step = EDITOR_STEPS[activeStep]!
  const changed = JSON.stringify(amounts) !== JSON.stringify(initial) || override || Boolean(reason)
  const requestClose = useCallback(() => { if (changedRef.current) setConfirmDiscard(true); else onClose() }, [onClose])

  useEffect(() => { changedRef.current = changed }, [changed])
  useEffect(() => {
    closeButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [requestClose])
  const changes = (): K1TrackerFieldChange[] => Object.entries(amounts)
    .filter(([key, amount]) => amount !== (initial[key] ?? ''))
    .map(([fieldKey, amount]) => ({ fieldKey: fieldKey as FieldKey, amount: amount.trim() || null, sourceType: override ? 'MANUAL_OVERRIDE' : 'MANUAL_ENTRY', overrideReason: override ? reason : undefined }))
  const validate = () => {
    if (override && !reason.trim()) { setNotice('State why this source value is being overridden.'); return false }
    if (!changes().length) { setNotice('Change at least one value before previewing or saving.'); return false }
    return true
  }
  const calculate = async () => {
    if (!validate()) return
    try { const result = await onCalculate(changes()); setDraft(result); setNotice(result ? 'Draft calculation refreshed. Review the effect, then save revisions.' : 'Draft calculation completed. Save revisions when ready.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to refresh the draft calculation.') }
  }
  const save = async () => {
    if (!validate()) return
    try { await onSave(changes()); onClose() } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save revisions. Reload this year before retrying if another Admin changed it.') }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/40" role="dialog" aria-modal="true" aria-label={`Edit ${detail.taxYear} tracker year`}><div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4"><div><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{detail.taxYear} K1 tracker</p><h2 className="text-lg font-semibold text-gray-950">Edit sourced inputs</h2></div><button ref={closeButton} type="button" onClick={requestClose} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label="Close editor"><X className="h-5 w-5" /></button></div><div className="space-y-5 p-5"><p className="text-sm text-gray-600">Each save appends a revision. Existing workbook and finalized K-1 values remain traceable after a manual override.</p><div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Year editor steps">{EDITOR_STEPS.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={index === activeStep} onClick={() => setActiveStep(index)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${index === activeStep ? 'bg-atlas-gold text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{item.title}</button>)}</div>{notice && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}<section aria-label={`${step.title} inputs`} className="rounded-xl border border-gray-200 p-4"><h3 className="text-base font-semibold text-gray-950">{step.title}</h3><p className="mt-1 text-sm text-gray-600">{step.help}</p><p className="mt-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">Sign guidance: {step.signHint}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{step.fields.map((key) => { const source = sourceByField.get(key); const carryforward = !source ? carryforwardFor(detail, key) : undefined; return <label key={key} className="block"><span className="text-xs font-medium text-gray-700">{fieldLabel(key)}</span><input aria-label={fieldLabel(key)} inputMode="decimal" value={amounts[key] ?? ''} onChange={(event) => setAmounts((current) => ({ ...current, [key]: event.target.value }))} placeholder={carryforward ?? '0.00'} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-atlas-gold" />{source ? <span className="mt-1 block text-xs text-gray-500">{source.sourceType.replaceAll('_', ' ')}{source.sourceSheet ? ` - ${source.sourceSheet}${source.sourceCell ? `!${source.sourceCell}` : ''}` : ''}</span> : carryforward ? <span className="mt-1 block text-xs text-gray-500">Carried from prior calculation: {currency(carryforward)}</span> : null}</label> })}</div></section><label className="flex items-start gap-2 text-sm text-gray-700"><input aria-label="Replace an existing source" type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} className="mt-1" /><span><span className="font-medium">Manual override</span><br /><span className="text-xs text-gray-500">Use only when replacing a workbook or finalized K-1 value with a reasoned correction.</span></span></label>{override && <label className="block"><span className="text-xs font-medium text-gray-700">Override reason</span><textarea aria-label="Override reason" value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" /></label>}{draft && <div className="grid gap-3 rounded-xl border border-atlas-gold/30 bg-amber-50 p-4 sm:grid-cols-3" aria-live="polite"><div><p className="text-xs text-amber-800">Draft ending basis</p><p className="font-semibold text-gray-950">{currency(draft.basis.endingOutsideBasis)}</p></div><div><p className="text-xs text-amber-800">Draft status</p><p className="font-semibold text-gray-950">{draft.summary.status.replaceAll('_', ' ')}</p></div><div><p className="text-xs text-amber-800">Checks needing attention</p><p className="font-semibold text-gray-950">{draft.checks.filter((check) => check.status !== 'PASS').length}</p></div></div>}</div><div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-4"><button type="button" disabled={activeStep === 0} onClick={() => setActiveStep((current) => current - 1)} className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Back</button><div className="flex gap-3">{activeStep < EDITOR_STEPS.length - 1 && <button type="button" onClick={() => setActiveStep((current) => current + 1)} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800"><span>Next</span><ChevronRight className="h-4 w-4" /></button>}<button type="button" disabled={pending} onClick={() => void calculate()} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50">Preview calculation</button><button type="button" disabled={pending} onClick={() => void save()} className="rounded-md bg-atlas-gold px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Save revisions</button></div></div>{confirmDiscard && <div className="fixed inset-0 z-10 flex items-center justify-center bg-gray-950/30 p-5" role="alertdialog" aria-modal="true" aria-label="Discard unsaved changes"><div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"><h3 className="font-semibold text-gray-950">Discard unsaved changes?</h3><p className="mt-2 text-sm text-gray-600">Your draft values have not been saved.</p><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-md px-3 py-2 text-sm font-medium text-gray-700">Keep editing</button><button type="button" onClick={onClose} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white">Discard</button></div></div></div>}</div></div>
}
