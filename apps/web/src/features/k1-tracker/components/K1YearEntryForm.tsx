import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react'
import { formatCurrency, normalizeCurrencyInput } from '../../../components/shared/currencyInput'
import type {
  K1TrackerCalculation,
  K1TrackerCodeEntry,
  K1TrackerFieldChange,
  K1TrackerOfficialFormData,
  K1TrackerOfficialFormFieldKey,
  K1TrackerOfficialFormValue,
  K1TrackerWritableFieldKey,
  K1TrackerYearDetail,
} from '../../../../../../packages/types/src/k1-tracker'
import { K1_EDITABLE_FIELDS } from '../k1FieldGroups'
import { isReconciliationBlocker } from '../reconciliationGuidance'
import type { K1FormIdentityContext } from '../k1FormLayout'
import { emptyOfficialValueFor, K1_OFFICIAL_FORM_FIELD_BY_KEY, K1_OFFICIAL_FORM_FIELDS } from '../k1OfficialFormFields'
import { K1FormHeader } from './K1FormHeader'
import { type K1FormFieldStateGetter } from './K1FormFieldCell'
import { K1FormIdentityPanel } from './K1FormIdentityPanel'
import { K1MagicPatternFormBody } from './K1MagicPatternFormBody'
import { K1PartThreeGrid } from './K1PartThreeGrid'
import type { K1OfficialFormFieldStateGetter } from './K1OfficialFormField'
import { K1SupplementalWorkpaper } from './K1SupplementalWorkpaper'

type FieldKey = K1TrackerFieldChange['fieldKey']

const displayCurrency = (value: string | null | undefined) => value == null
  ? 'Not available'
  : new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value))

const editableFieldByKey = new Map(K1_EDITABLE_FIELDS.map((field) => [field.key, field]))

const line11Entries = (value: K1TrackerOfficialFormValue | undefined): K1TrackerCodeEntry[] =>
  Array.isArray(value) ? value : []

const line11Amount = (detail: K1TrackerYearDetail): string | null => {
  const tracked = detail.values.find((value) => value.fieldKey === 'box_11_other_income_loss')?.amount
  if (tracked != null) return tracked
  const coded = line11Entries(detail.officialFormData?.box_11_entries)
    .find((entry) => entry.code.trim().toUpperCase() === 'ZZ')?.value
  return coded?.trim() || null
}

const initialAmounts = (detail: K1TrackerYearDetail): Record<string, string> => Object.fromEntries(
  K1_EDITABLE_FIELDS.map((field) => {
    const source = detail.values.find((value) => value.fieldKey === field.key)
    const amount = field.key === 'box_11_other_income_loss' ? line11Amount(detail) : source?.amount
    return [field.key, amount == null ? '' : formatCurrency(amount)]
  }),
)

const initialOfficialFormData = (detail: K1TrackerYearDetail): K1TrackerOfficialFormData => {
  const source: K1TrackerOfficialFormData = {
    tax_period_beginning: `${detail.taxYear}-01-01`,
    tax_period_ending: `${detail.taxYear}-12-31`,
    ...(detail.officialFormData ?? {}),
  }
  if (!source.tax_period_beginning) source.tax_period_beginning = `${detail.taxYear}-01-01`
  if (!source.tax_period_ending) source.tax_period_ending = `${detail.taxYear}-12-31`
  if (Object.prototype.hasOwnProperty.call(source, 'part_ii_j_decrease_exchange')) {
    source.part_ii_j_decrease_sale = source.part_ii_j_decrease_sale === true
      || source.part_ii_j_decrease_exchange === true
    delete source.part_ii_j_decrease_exchange
  }
  const trackedLine11 = detail.values.find((value) => value.fieldKey === 'box_11_other_income_loss')?.amount
  const existingLine11 = line11Entries(source.box_11_entries)
  if (trackedLine11 != null && !existingLine11.some((entry) => entry.code.trim().toUpperCase() === 'ZZ')) {
    source.box_11_entries = [...existingLine11, { code: 'ZZ', value: trackedLine11 }]
  }
  return Object.fromEntries(Object.entries(source).map(([key, value]) => {
    const definition = K1_OFFICIAL_FORM_FIELD_BY_KEY.get(key as K1TrackerOfficialFormFieldKey)
    return [key, definition?.kind === 'money' && typeof value === 'string' && value.trim() ? formatCurrency(value) : value]
  })) as K1TrackerOfficialFormData
}

const officialFallbacks = (identity?: K1FormIdentityContext): Partial<Record<K1TrackerOfficialFormFieldKey, string>> => ({
  part_i_a_partnership_ein: identity?.partnershipEin ?? '',
  part_i_b_partnership_name_address: [identity?.partnershipName, identity?.partnershipAddress].filter(Boolean).join('\n'),
  part_ii_f_partner_name_address: identity?.partnerName ?? '',
})

const normalizeOfficialFormData = (raw: K1TrackerOfficialFormData): { value: K1TrackerOfficialFormData; error?: string } => {
  const normalized: K1TrackerOfficialFormData = {}
  for (const definition of K1_OFFICIAL_FORM_FIELDS) {
    const current = raw[definition.key]
    if (Array.isArray(current)) {
      const entries: K1TrackerCodeEntry[] = []
      for (const entry of current) {
        const code = entry.code.trim().toUpperCase()
        let value = entry.value.trim()
        if (definition.key === 'box_11_entries' && code === 'ZZ' && value) {
          const money = normalizeCurrencyInput(value, true)
          if (money.error) return { value: normalized, error: 'Line 11 ZZ - Other income (loss): use a valid signed amount.' }
          value = money.value ?? ''
        }
        if (code || value) entries.push({ code, value })
      }
      if (entries.length) normalized[definition.key] = entries
      continue
    }
    if (typeof current === 'boolean') {
      if (current) normalized[definition.key] = true
      continue
    }
    if (typeof current !== 'string' || !current.trim()) continue
    const text = current.trim()
    if (definition.kind === 'money') {
      const money = normalizeCurrencyInput(text, definition.allowNegative ?? false)
      if (money.error) return { value: normalized, error: `${definition.label}: ${money.error}` }
      if (money.value != null) normalized[definition.key] = money.value
      continue
    }
    if (definition.kind === 'percentage') {
      if (!/^\d+(?:\.\d{1,6})?$/.test(text) || Number(text) > 100) {
        return { value: normalized, error: `${definition.label}: use a percentage from 0 through 100 with up to six decimals.` }
      }
    }
    normalized[definition.key] = text
  }
  return { value: normalized }
}

const sameOfficialFormData = (left: K1TrackerOfficialFormData, right: K1TrackerOfficialFormData): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

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

export function K1YearEntryForm({
  detail,
  identity,
  canEdit,
  pending,
  onCalculate,
  onSave,
  onReconcile,
  onDirtyChange,
  appearance = 'default',
  datedActivityLocation = 'above',
}: {
  detail: K1TrackerYearDetail
  identity?: K1FormIdentityContext
  canEdit: boolean
  pending: boolean
  onCalculate: (changes: K1TrackerFieldChange[]) => Promise<K1TrackerCalculation | undefined>
  onSave: (changes: K1TrackerFieldChange[], officialFormData?: K1TrackerOfficialFormData) => Promise<void>
  onReconcile?: () => Promise<void>
  onDirtyChange: (dirty: boolean) => void
  appearance?: 'default' | 'workspace' | 'magic-pattern'
  datedActivityLocation?: 'above' | 'capital-activity-tab'
}) {
  const workspace = appearance === 'workspace'
  const magicPattern = appearance === 'magic-pattern'
  const initial = useMemo(() => initialAmounts(detail), [detail])
  const initialOfficial = useMemo(() => initialOfficialFormData(detail), [detail])
  const fallbackByOfficialField = useMemo(() => officialFallbacks(identity), [identity])
  const sourceByField = useMemo(() => new Map(detail.values.map((value) => [value.fieldKey, value])), [detail.values])
  const conflictByField = useMemo(() => new Map((detail.sourceConflicts ?? []).map((conflict) => [conflict.fieldKey, conflict.message])), [detail.sourceConflicts])
  const datedFields = useMemo<Set<FieldKey>>(
    () => new Set((detail.cashFlowEvents?.map((event) => event.kind === 'CAPITAL_CALL'
      ? 'capital_contributions'
      : 'box_19_distributions') ?? []) as FieldKey[]),
    [detail.cashFlowEvents],
  )
  const legacyLine13 = sourceByField.get('box_13_other_deductions')
  const usesSplitLine13 = sourceByField.has('box_13_other_portfolio_deductions') || sourceByField.has('box_13_management_fees')
  const [amounts, setAmounts] = useState<Record<string, string>>(initial)
  const [officialFormData, setOfficialFormData] = useState<K1TrackerOfficialFormData>(initialOfficial)
  const [override, setOverride] = useState(false)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<string>()
  const [draft, setDraft] = useState<K1TrackerCalculation>()
  const [warningsAcknowledgedRevision, setWarningsAcknowledgedRevision] = useState<number | null>(null)
  const warningsAcknowledged = warningsAcknowledgedRevision === detail.revision

  const reconciliationBlockers = detail.calculation.checks.filter(isReconciliationBlocker)
  const reconciliationWarnings = detail.calculation.checks.filter((check) => check.status === 'WARNING')
  const canReconcile = reconciliationBlockers.length === 0
    && detail.sourceConflicts.length === 0
    && (reconciliationWarnings.length === 0 || warningsAcknowledged)

  const officialDirty = !sameOfficialFormData(officialFormData, initialOfficial)
  const dirty = Object.keys(initial).some((key) => amounts[key] !== initial[key]) || officialDirty || override || Boolean(reason)
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  const buildChanges = (): K1TrackerFieldChange[] | undefined => {
    if (override && !reason.trim()) {
      setNotice('State why this source value is being overridden.')
      return undefined
    }

    const changes: K1TrackerFieldChange[] = []
    for (const field of K1_EDITABLE_FIELDS) {
      if (datedFields.has(field.key)) continue
      const next = normalizeCurrencyInput(amounts[field.key] ?? '', field.allowNegative)
      const prior = normalizeCurrencyInput(initial[field.key] ?? '', field.allowNegative)
      if (next.error) {
        setNotice(`${field.label}: ${next.error}`)
        return undefined
      }
      if (next.value !== prior.value) {
        changes.push({
          fieldKey: field.key,
          amount: next.value,
          sourceType: override ? 'MANUAL_OVERRIDE' : 'MANUAL_ENTRY',
          overrideReason: override ? reason.trim() : undefined,
        })
      }
    }
    return changes
  }

  const preview = async () => {
    const changes = buildChanges()
    if (!changes) return
    const normalizedOfficial = normalizeOfficialFormData(officialFormData)
    if (normalizedOfficial.error) { setNotice(normalizedOfficial.error); return }
    if (!changes.length) {
      setDraft(detail.calculation)
      setNotice(officialDirty
        ? 'Official K-1 form details do not change Jackson basis calculations. Save revisions to retain them.'
        : 'Change at least one value before previewing or saving.')
      return
    }
    try {
      const result = await onCalculate(changes)
      setDraft(result)
      setNotice(result
        ? 'Draft calculation refreshed. Review the results below before saving.'
        : 'Draft calculation completed.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to refresh the draft calculation.')
    }
  }

  const save = async (): Promise<boolean> => {
    const changes = buildChanges()
    if (!changes) return false
    const normalizedOfficial = normalizeOfficialFormData(officialFormData)
    if (normalizedOfficial.error) { setNotice(normalizedOfficial.error); return false }
    if (!changes.length && !officialDirty) {
      setNotice('Change at least one value before previewing or saving.')
      return true
    }
    try {
      if (officialDirty) await onSave(changes, normalizedOfficial.value)
      else await onSave(changes)
      setNotice(changes.length
        ? 'Manual K-1 revisions saved and dependent years recalculated.'
        : 'Official K-1 form details saved. Jackson basis calculations were unchanged.')
      return true
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save revisions.')
      return false
    }
  }

  const reconcile = async () => {
    if (reconciliationBlockers.length > 0 || detail.sourceConflicts.length > 0) {
      setNotice(`Complete ${reconciliationBlockers.length + detail.sourceConflicts.length} required reconciliation item${reconciliationBlockers.length + detail.sourceConflicts.length === 1 ? '' : 's'} before marking this year reconciled.`)
      return
    }
    if (reconciliationWarnings.length > 0 && !warningsAcknowledged) {
      setNotice('Review and acknowledge the calculated warnings before marking this year reconciled.')
      return
    }
    if (dirty && !(await save())) return
    if (!onReconcile) return
    try {
      await onReconcile()
      setNotice(`${detail.taxYear} was marked reconciled.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reconcile this K-1 year.'
      setNotice(message === 'SIGNOFF_GATE_FAILED'
        ? 'Required reconciliation checks are still open. Complete the checklist and try again.'
        : message)
    }
  }

  const revert = () => {
    setAmounts(initial)
    setOfficialFormData(initialOfficial)
    setOverride(false)
    setReason('')
    setDraft(undefined)
    setNotice(undefined)
  }

  const fieldStateFor: K1FormFieldStateGetter = (fieldKey: K1TrackerWritableFieldKey) => {
    const field = editableFieldByKey.get(fieldKey)
    if (!field) throw new Error(`Missing canonical K-1 field definition for ${fieldKey}`)
    const source = sourceByField.get(fieldKey)
    return {
      field,
      value: amounts[fieldKey] ?? '',
      onChange: (value) => {
        setAmounts((current) => ({ ...current, [fieldKey]: value }))
        if (fieldKey === 'box_11_other_income_loss') {
          setOfficialFormData((current) => {
            const entries = line11Entries(current.box_11_entries)
            const zzIndex = entries.findIndex((entry) => entry.code.trim().toUpperCase() === 'ZZ')
            if (!value.trim()) {
              return { ...current, box_11_entries: entries.filter((_, index) => index !== zzIndex) }
            }
            if (zzIndex < 0) return { ...current, box_11_entries: [...entries, { code: 'ZZ', value }] }
            return {
              ...current,
              box_11_entries: entries.map((entry, index) => index === zzIndex ? { code: 'ZZ', value } : entry),
            }
          })
        }
      },
      canEdit,
      derivedFromCashActivity: datedFields.has(fieldKey),
      source,
      carryforward: !source && field.carryforward ? carryforwardFor(detail, fieldKey) : undefined,
      conflictMessage: conflictByField.get(fieldKey),
    }
  }

  const officialFieldStateFor: K1OfficialFormFieldStateGetter = (fieldKey) => {
    const field = K1_OFFICIAL_FORM_FIELD_BY_KEY.get(fieldKey)
    if (!field) throw new Error(`Missing official K-1 field definition for ${fieldKey}`)
    const hasValue = Object.prototype.hasOwnProperty.call(officialFormData, fieldKey)
    return {
      field,
      value: hasValue ? officialFormData[fieldKey] ?? emptyOfficialValueFor(field) : fallbackByOfficialField[fieldKey] ?? emptyOfficialValueFor(field),
      onChange: (value: K1TrackerOfficialFormValue) => setOfficialFormData((current) => {
        if (value === true && fieldKey === 'k1_status_final') {
          return { ...current, k1_status_final: true, k1_status_amended: false }
        }
        if (value === true && fieldKey === 'k1_status_amended') {
          return { ...current, k1_status_final: false, k1_status_amended: true }
        }
        return { ...current, [fieldKey]: value }
      }),
      canEdit,
      source: detail.officialFormSources?.[fieldKey]
        ?? (fieldKey === 'part_ii_j_decrease_sale'
          ? detail.officialFormSources?.part_ii_j_decrease_exchange
          : undefined),
    }
  }

  return <form
    aria-label={`${detail.taxYear} Schedule K-1 data entry`}
    onSubmit={(event) => {
      event.preventDefault()
      void save()
    }}
    className={workspace
      ? 'min-w-0 overflow-clip rounded-lg border border-slate-300 bg-white shadow-sm'
      : magicPattern
        ? 'min-w-0 overflow-clip border border-gray-950 bg-white'
        : 'min-w-0 overflow-clip border-2 border-gray-950 bg-white shadow-[0_12px_32px_rgba(17,24,39,0.10)]'}
  >
    <K1FormHeader taxYear={detail.taxYear} hasDatedActivity={datedFields.size > 0} officialFieldStateFor={officialFieldStateFor} appearance={appearance} datedActivityLocation={datedActivityLocation} />

    {legacyLine13 && !usesSplitLine13 && !magicPattern && <p className="border-b border-gray-500 bg-gray-100 px-4 py-2.5 text-xs leading-relaxed text-gray-700 sm:px-5">
      <span className="font-bold text-gray-950">Historical combined line 13:</span> {displayCurrency(legacyLine13.amount)} ({legacyLine13.sourceType.replaceAll('_', ' ')}). It remains effective until either new line 13 field is saved.
    </p>}

    {notice && <p role="status" aria-live="polite" className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-950 sm:px-5">{notice}</p>}

    {magicPattern ? <K1MagicPatternFormBody fieldStateFor={fieldStateFor} officialFieldStateFor={officialFieldStateFor} officialFormData={officialFormData} endingOutsideBasis={detail.calculation.basis.endingOutsideBasis} /> : <div className="grid min-w-0 grid-cols-1 items-start xl:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.38fr)]" data-testid="k1-form-body">
      <K1FormIdentityPanel fieldStateFor={fieldStateFor} officialFieldStateFor={officialFieldStateFor} appearance={workspace ? 'workspace' : 'default'} />
      <K1PartThreeGrid fieldStateFor={fieldStateFor} officialFieldStateFor={officialFieldStateFor} officialFormData={officialFormData} appearance={workspace ? 'workspace' : 'default'} />
    </div>}

    {magicPattern ? <K1SupplementalWorkpaper fieldStateFor={fieldStateFor} appearance="magic-pattern" showOpeningBasis={false} /> : <div className={workspace ? 'border-t border-slate-300 p-3 sm:p-4' : 'border-t-4 border-double border-gray-950 p-3 sm:p-5'}>
      <K1SupplementalWorkpaper fieldStateFor={fieldStateFor} />
    </div>}

    {canEdit && !magicPattern && <section aria-labelledby="k1-override-heading" className={workspace ? 'border-t border-slate-200 bg-slate-50 px-4 py-3' : 'border-t-2 border-gray-950 bg-white px-4 py-4 sm:px-5'}>
      <label className="flex min-h-11 items-start gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={override}
          onChange={(event) => setOverride(event.target.checked)}
          className="mt-1 h-4 w-4 accent-primary focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"
        />
        <span>
          <span id="k1-override-heading" className="font-bold text-gray-950">Manual override</span><br />
          <span className="text-xs text-gray-500">Use when replacing a prior sourced value with a reasoned correction.</span>
        </span>
      </label>
      {override && <label className="mt-4 block max-w-3xl">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-gray-800">Override reason</span>
        <textarea
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          className="mt-1 w-full border border-gray-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
        />
      </label>}
    </section>}

    {draft && !magicPattern && <section aria-live="polite" className={workspace ? 'grid gap-4 border-t border-amber-300 bg-amber-50 px-4 py-3 sm:grid-cols-3' : 'grid gap-4 border-t-2 border-amber-500 bg-amber-50 px-4 py-4 sm:grid-cols-3 sm:px-5'}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-800">Draft ending basis</p>
        <p className="mt-1 font-mono font-bold tabular-nums text-gray-950">{displayCurrency(draft.basis.endingOutsideBasis as string | null)}</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-800">Draft status</p>
        <p className="mt-1 font-bold text-gray-950">{draft.summary.status.replaceAll('_', ' ')}</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-800">Checks needing attention</p>
        <p className="mt-1 font-mono font-bold tabular-nums text-gray-950">{draft.checks.filter((check) => check.status !== 'PASS').length}</p>
      </div>
    </section>}

    {magicPattern && onReconcile && <section aria-labelledby="k1-reconciliation-gate-heading" className={`border-t px-4 py-3 sm:px-5 ${reconciliationBlockers.length || detail.sourceConflicts.length ? 'border-amber-300 bg-amber-50' : reconciliationWarnings.length ? 'border-sky-200 bg-sky-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <div className="flex items-start gap-3">
        {reconciliationBlockers.length || detail.sourceConflicts.length
          ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
        <div className="min-w-0 flex-1">
          <h4 id="k1-reconciliation-gate-heading" className="text-xs font-bold text-slate-950">
            {reconciliationBlockers.length || detail.sourceConflicts.length
              ? `${reconciliationBlockers.length + detail.sourceConflicts.length} required item${reconciliationBlockers.length + detail.sourceConflicts.length === 1 ? '' : 's'} remain`
              : reconciliationWarnings.length
                ? 'Required inputs are complete'
                : 'Ready to reconcile'}
          </h4>
          {reconciliationBlockers.length || detail.sourceConflicts.length
            ? <p className="mt-1 text-xs leading-5 text-amber-900">Use the Reconciliation checklist beside the form. Each item identifies the missing value and takes you to the correct field.</p>
            : reconciliationWarnings.length
              ? <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs leading-5 text-sky-950"><input type="checkbox" checked={warningsAcknowledged} onChange={(event) => setWarningsAcknowledgedRevision(event.target.checked ? detail.revision : null)} className="mt-1 h-4 w-4 accent-primary" /><span>I reviewed the {reconciliationWarnings.length} calculated warning{reconciliationWarnings.length === 1 ? '' : 's'} and confirmed the source values are correct.</span></label>
              : <p className="mt-1 text-xs leading-5 text-emerald-900">All required checks pass. Marking reconciled will lock this revision's sign-off until a value changes.</p>}
        </div>
        {(reconciliationBlockers.length > 0 || detail.sourceConflicts.length > 0) && <button type="button" onClick={() => document.getElementById('k1-open-checks-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"><ListChecks className="h-3.5 w-3.5" />View checklist</button>}
      </div>
    </section>}

    {canEdit && (magicPattern ? <div data-testid="k1-form-actions" className="sticky -bottom-4 z-10 flex flex-col-reverse gap-2 border-t border-gray-950 bg-white/95 px-4 py-3 shadow-[0_-6px_16px_rgba(15,23,42,0.08)] backdrop-blur sm:-bottom-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:-bottom-8">
      <button type="submit" disabled={pending} className="min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50">Save draft</button>
      {onReconcile && <button type="button" onClick={() => void reconcile()} disabled={pending || !canReconcile} title={!canReconcile ? 'Complete the reconciliation checklist first.' : undefined} className="min-h-9 rounded-md border border-primary bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-600">
        {reconciliationBlockers.length || detail.sourceConflicts.length
          ? `Complete ${reconciliationBlockers.length + detail.sourceConflicts.length} required item${reconciliationBlockers.length + detail.sourceConflicts.length === 1 ? '' : 's'}`
          : reconciliationWarnings.length && !warningsAcknowledged
            ? `Review ${reconciliationWarnings.length} warning${reconciliationWarnings.length === 1 ? '' : 's'}`
            : 'Mark reconciled'}
      </button>}
    </div> : <div data-testid="k1-form-actions" className={workspace ? 'sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-6px_16px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:justify-end' : 'sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t-2 border-gray-950 bg-white/95 px-4 py-3 shadow-[0_-8px_18px_rgba(17,24,39,0.12)] backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-5'}>
      <button type="button" onClick={revert} disabled={!dirty || pending} className={workspace ? 'min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50' : 'min-h-11 border border-gray-500 px-4 py-2 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50'}>Revert</button>
      <button type="button" onClick={() => void preview()} disabled={pending} className={workspace ? 'min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50' : 'min-h-11 border border-gray-950 bg-white px-4 py-2 text-sm font-bold text-gray-950 transition-colors hover:bg-gray-950 hover:text-white focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50'}>Preview calculation</button>
      <button type="submit" disabled={pending} className={workspace ? 'min-h-9 rounded-md border border-primary bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50' : 'min-h-11 bg-primary px-4 py-2 text-sm font-black text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50'}>Save revisions</button>
    </div>)}
  </form>
}
