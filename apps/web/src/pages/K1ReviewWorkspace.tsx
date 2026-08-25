import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  Link2,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react'

import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { Button } from '../components/shared/Button'
import { PageHeader } from '../components/shared/PageHeader'
import { StatusBadge } from '../components/shared/StatusBadge'
import { EntityTypeahead } from '../features/review/components/EntityTypeahead'
import { ParsedFieldRow } from '../features/review/components/ParsedFieldRow'
import { PartnershipTypeahead } from '../features/review/components/PartnershipTypeahead'
import { PdfPanel } from '../features/review/components/PdfPanel'
import { useFieldEdits } from '../features/review/hooks/useFieldEdits'
import {
  K1ApiError,
  K1ReviewError,
  useApplyK1,
  useFinalizeK1,
  useK1ApplyPreview,
  useResolveIssue,
  useResolveMatch,
  useReviewSession,
  useSaveCorrections,
} from '../features/review/hooks/useReviewSession'
import { useUnsavedChangesGuard } from '../features/review/hooks/useUnsavedChangesGuard'
import { getK1FieldDisplay, groupK1ReviewFields } from '../features/review/k1FieldDisplay'
import { useRetryK1Extraction } from '../features/k1/hooks/useK1Queries'
import type { K1ApplicationDecision, K1ApplyResponse } from '../../../../packages/types/src/k1-ingestion'
import type { K1FieldValue, K1ReviewSession, K1Status } from '../../../../packages/types/src/review-finalization'

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

const resolveApiUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

const statusToBadge: Record<
  K1Status,
  'uploaded' | 'processing' | 'needs_review' | 'ready_for_approval' | 'finalized'
> = {
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  NEEDS_REVIEW: 'needs_review',
  READY_FOR_APPROVAL: 'ready_for_approval',
  FINALIZED: 'finalized',
}

type CompletionStage = 'idle' | 'saving' | 'linking' | 'accepting' | 'finalizing' | 'applying' | 'done'

const completionLabel: Record<CompletionStage, string> = {
  idle: 'Save verified K-1 to tax basis',
  saving: 'Saving corrections…',
  linking: 'Confirming partnership…',
  accepting: 'Recording verification…',
  finalizing: 'Finalizing review…',
  applying: 'Saving to tax basis…',
  done: 'Saved to tax basis',
}

const friendlyError = (code: string): string => ({
  K1_REVIEW_INCOMPLETE: 'A required extracted value is still missing. Complete the highlighted field and try again.',
  K1_REVIEW_NOT_FINALIZED: 'The review changed while it was being saved. Reload the latest values and try again.',
  INCEPTION_YEAR_CONFLICT: 'This cannot be the inception year because an earlier tax-basis year already exists for this partnership.',
  FINALIZE_PRECONDITION_FAILED: 'A required field or destination is still missing. Complete the highlighted item and try again.',
  APPLICATION_DECISIONS_INCOMPLETE: 'The tax-basis save could not include every extracted field. Reload and try again.',
  ROLE_REQUIRED_ADMIN: 'An administrator must save a verified K-1 to tax basis.',
  K1_ALREADY_APPLIED: 'This K-1 has already been saved to tax basis.',
  DATED_ACTIVITY_IS_AUTHORITATIVE: 'Dated cash activity is authoritative for contributions and distributions and was kept unchanged.',
}[code] ?? 'The K-1 could not be saved. Reload the latest review and try again.')

const isEmpty = (value: unknown): boolean => value == null || (typeof value === 'string' && value.trim() === '')

export const K1ReviewWorkspace = () => {
  const { id } = useParams<{ id: string }>()
  const k1Id = id ?? ''
  const navigate = useNavigate()
  const { session } = useSession()
  const query = useReviewSession(k1Id)
  const edits = useFieldEdits()

  const [highlight, setHighlight] = useState<K1FieldValue['sourceLocation']>(null)
  const [staleError, setStaleError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null)
  const [selectedPartnershipId, setSelectedPartnershipId] = useState<string | null>(null)
  const [selectedPartnershipName, setSelectedPartnershipName] = useState<string | null>(null)
  const [selectedTaxYear, setSelectedTaxYear] = useState('')
  const [inceptionYear, setInceptionYear] = useState(false)
  const [destinationEditorOpen, setDestinationEditorOpen] = useState(false)
  const [completionStage, setCompletionStage] = useState<CompletionStage>('idle')
  const [appliedResult, setAppliedResult] = useState<K1ApplyResponse | null>(null)
  const [issueTargetFieldId, setIssueTargetFieldId] = useState<string | null>(null)

  const saveMutation = useSaveCorrections(k1Id)
  const finalizeMutation = useFinalizeK1(k1Id)
  const resolveIssueMutation = useResolveIssue(k1Id)
  const resolveMatchMutation = useResolveMatch(k1Id)
  const applyPreviewMutation = useK1ApplyPreview(k1Id)
  const applyMutation = useApplyK1(k1Id)
  const retryExtractionMutation = useRetryK1Extraction()

  const sessionData = query.data
  const currentVersion = sessionData?.version ?? 0
  const completing = !['idle', 'done'].includes(completionStage)

  useUnsavedChangesGuard(edits.hasEdits && !completing)

  const allFields = useMemo(
    () => sessionData
      ? [...sessionData.fields.entityMapping, ...sessionData.fields.partnershipMapping, ...sessionData.fields.core]
      : [],
    [sessionData],
  )
  const fieldsById = useMemo(() => new Map(allFields.map((field) => [field.id, field])), [allFields])
  const reviewFieldGroups = useMemo(() => groupK1ReviewFields(allFields), [allFields])
  const reviewFlags = useMemo(
    () => sessionData?.issues.filter((issue) => issue.status === 'OPEN' && issue.issueType !== 'MATCHING') ?? [],
    [sessionData],
  )
  const flaggedFieldIds = useMemo(
    () => new Set(reviewFlags.flatMap((issue) => issue.k1FieldValueId ? [issue.k1FieldValueId] : [])),
    [reviewFlags],
  )
  const missingRequiredFields = allFields.filter((field) => field.required && isEmpty(edits.currentValueFor(field)))

  useEffect(() => {
    if (!sessionData) return
    const exactEntities = sessionData.matchCandidates?.filter((candidate) => candidate.type === 'ENTITY' && candidate.score >= 0.99) ?? []
    const exactPartnerships = sessionData.matchCandidates?.filter((candidate) => candidate.type === 'PARTNERSHIP' && candidate.score >= 0.99) ?? []
    const exactEntity = exactEntities.length === 1 ? exactEntities[0] : undefined
    const exactPartnership = exactPartnerships.length === 1 ? exactPartnerships[0] : undefined
    const entityId = sessionData.entity.id ?? exactEntity?.recordId ?? null
    const partnershipId = sessionData.partnership.id ?? exactPartnership?.recordId ?? null
    // The durable review session is the source of truth for the destination after each mutation/refetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedEntityId(entityId)
    setSelectedEntityName(sessionData.entity.name ?? (entityId === exactEntity?.recordId ? exactEntity.maskedLabel.split(' · ')[0]! : null))
    setSelectedPartnershipId(partnershipId)
    setSelectedPartnershipName(sessionData.partnership.name ?? (partnershipId === exactPartnership?.recordId ? exactPartnership.maskedLabel.split(' · ')[0]! : null))
    setSelectedTaxYear(sessionData.taxYear == null ? '' : String(sessionData.taxYear))
    setDestinationEditorOpen(!sessionData.entity.id || !sessionData.partnership.id || !sessionData.taxYear)
  }, [sessionData])

  const reportError = (error: unknown) => {
    if (error instanceof K1ReviewError || error instanceof K1ApiError) {
      if (error.code.startsWith('STALE_') || error.code.includes('PREVIEW_EXPIRED') || error.code.includes('TARGET_CHANGED')) {
        setStaleError('The K-1 or tax-basis record changed while you were reviewing it. Reload the latest values and try again.')
        return
      }
      setToast({ kind: 'err', text: friendlyError(error.code) })
      return
    }
    setToast({ kind: 'err', text: 'The K-1 could not be saved. Reload the page and try again.' })
  }

  const refreshSession = async (fallback: K1ReviewSession): Promise<K1ReviewSession> => {
    const refreshed = await query.refetch()
    return refreshed.data ?? fallback
  }

  const handleViewIssueField = (field: K1FieldValue) => {
    setIssueTargetFieldId(field.id)
    setHighlight(field.sourceLocations?.[0] ?? field.sourceLocation ?? null)
    const target = document.getElementById(`k1-review-field-${field.id}`)
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    target?.focus({ preventScroll: true })
  }

  const openTaxBasisHistory = () => {
    if (!sessionData) return
    const params = new URLSearchParams()
    if (sessionData.partnership.id) params.set('partnership', sessionData.partnership.id)
    if (sessionData.taxYear) params.set('year', String(sessionData.taxYear))
    params.set('area', 'k1')
    navigate(`/partnership-tracker?${params.toString()}`)
  }

  const handleComplete = async () => {
    if (!sessionData || completing || sessionData.appliedAt) return
    const taxYear = Number(selectedTaxYear)
    if (!selectedEntityId || !selectedPartnershipId || !Number.isInteger(taxYear)) {
      setDestinationEditorOpen(true)
      setToast({ kind: 'err', text: 'Choose the entity, partnership, and tax year where this K-1 belongs.' })
      return
    }
    if (missingRequiredFields.length) {
      setToast({ kind: 'err', text: `Complete ${missingRequiredFields.length} required field${missingRequiredFields.length === 1 ? '' : 's'} before saving.` })
      handleViewIssueField(missingRequiredFields[0])
      return
    }

    let working = sessionData
    let version = currentVersion
    let completed = false
    setToast(null)

    try {
      if (edits.hasEdits) {
        setCompletionStage('saving')
        const saved = await saveMutation.mutateAsync({ body: { corrections: edits.toCorrectionsPayload() }, version })
        version = saved.version
        edits.reset()
        working = await refreshSession({ ...working, version })
        version = working.version
      }

      const matchingIssueOpen = working.issues.some((issue) => issue.status === 'OPEN' && issue.issueType === 'MATCHING')
      const targetChanged = working.entity.id !== selectedEntityId
        || working.partnership.id !== selectedPartnershipId
        || working.taxYear !== taxYear
      if (matchingIssueOpen || targetChanged) {
        setCompletionStage('linking')
        const matched = await resolveMatchMutation.mutateAsync({
          expectedDocumentVersion: version,
          entityId: selectedEntityId,
          partnershipId: selectedPartnershipId,
          taxYear,
          reviewedEvidence: true,
        })
        version = matched.documentVersion
        working = await refreshSession({
          ...working,
          version,
          entity: { ...working.entity, id: selectedEntityId },
          partnership: { ...working.partnership, id: selectedPartnershipId },
          taxYear,
        })
        version = working.version
      }

      const openReviewIssues = working.issues.filter((issue) => issue.status === 'OPEN' && issue.issueType !== 'MATCHING')
      if (openReviewIssues.length) setCompletionStage('accepting')
      for (const issue of openReviewIssues) {
        try {
          const resolved = await resolveIssueMutation.mutateAsync({
            issueId: issue.id,
            version,
            body: issue.k1FieldValueId
              ? { acceptExtractedValue: true, acknowledgement: 'Verified against the source PDF.' }
              : { acknowledgement: 'Verified against the source PDF.' },
          })
          version = resolved.version
        } catch (error) {
          if (error instanceof K1ReviewError && error.code === 'ISSUE_ALREADY_RESOLVED') {
            version = error.currentVersion ?? version
            continue
          }
          throw error
        }
      }

      if (working.status !== 'READY_FOR_APPROVAL') {
        setCompletionStage('finalizing')
        const finalized = await finalizeMutation.mutateAsync({ version })
        version = finalized.version
      }

      setCompletionStage('applying')
      const preview = await applyPreviewMutation.mutateAsync({ expectedDocumentVersion: version })
      const decisions = preview.decisions.map((decision) => {
        const datedActivityIsAuthoritative = decision.existingValue != null
          && ['capital_contributions', 'box_19_distributions'].includes(decision.destinationKey)
        return {
          decisionId: decision.id,
          decision: (datedActivityIsAuthoritative ? 'KEEP_EXISTING' : 'USE_EXTRACTED') as K1ApplicationDecision,
        }
      })
      const result = await applyMutation.mutateAsync({
        applicationId: preview.applicationId,
        expectedDocumentVersion: preview.expectedDocumentVersion,
        expectedTrackerRevision: preview.expectedTrackerRevision,
        inceptionYear,
        decisions,
      })
      setAppliedResult(result)
      setCompletionStage('done')
      completed = true
      setToast({ kind: 'ok', text: `K-1 verified and saved to ${taxYear} tax basis.` })
    } catch (error) {
      reportError(error)
    } finally {
      if (!completed) setCompletionStage('idle')
    }
  }

  const handleReprocessExtraction = async () => {
    if (!sessionData) return
    if (!window.confirm('Re-run AWS extraction for this K-1? Your current extraction remains in its audit history.')) return
    try {
      await retryExtractionMutation.mutateAsync({ k1DocumentId: sessionData.k1DocumentId, expectedDocumentVersion: currentVersion })
      navigate('/k1')
    } catch (error) {
      reportError(error)
    }
  }

  if (!k1Id) return <div>Invalid K-1 id</div>

  const extractionReady = sessionData?.activeAttempt?.status === 'SUCCEEDED'
  const adminBlocked = sessionData?.applyBlockingReasons?.includes('NOT_ADMIN') ?? false
  const destinationReady = Boolean(selectedEntityId && selectedPartnershipId && Number.isInteger(Number(selectedTaxYear)))
  const completionBlocked = !extractionReady || adminBlocked || !destinationReady || missingRequiredFields.length > 0
  const applied = Boolean(appliedResult || sessionData?.appliedAt)

  return (
    <AppShell
      currentPath={window.location.pathname}
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => { void authClient.logout().finally(() => sessionStore.setUnauthenticated()) }}
    >
      <PageHeader title="Verify extracted K-1" subtitle={sessionData
        ? `${sessionData.partnership.name ?? sessionData.partnership.rawName ?? 'Unmatched partnership'} · Tax year ${sessionData.taxYear ?? 'pending'}`
        : undefined} />

      {staleError && <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="stale-banner">
        <div className="flex items-center gap-2"><AlertTriangle size={16} />{staleError}</div>
        <button className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium hover:bg-red-100" onClick={() => { setStaleError(null); edits.reset(); void query.refetch() }}>Reload</button>
      </div>}

      {toast && <div className={`mb-4 flex items-center justify-between rounded-md border px-4 py-2 text-sm ${toast.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
        <span>{toast.text}</span><button onClick={() => setToast(null)} aria-label="dismiss"><X size={14} /></button>
      </div>}

      {query.isLoading && <div className="py-16 text-center text-gray-500">Loading…</div>}
      {query.isError && <div className="py-16 text-center text-red-600">Failed to load the extracted K-1.</div>}

      {sessionData && <div className="grid h-[calc(100vh-14rem)] min-h-[36rem] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.04fr)_minmax(22rem,0.96fr)]">
        <div className="min-h-0 overflow-y-auto pr-2">
          <div className="space-y-4 pb-24">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate('/k1')} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"><ArrowLeft className="h-3.5 w-3.5" />K-1 uploads</button>
              <span className="text-gray-300">|</span><StatusBadge status={statusToBadge[sessionData.status]} />
            </div>

            <section className={`overflow-hidden rounded-xl border shadow-sm ${applied ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-white'}`} aria-labelledby="verify-k1-heading">
              <div className={`px-5 py-5 ${applied ? '' : 'bg-[linear-gradient(115deg,#f8fafc_0%,#ffffff_55%,#ecfdf5_100%)]'}`}>
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${applied ? 'bg-emerald-700 text-white' : 'bg-slate-950 text-cyan-300'}`}>{applied ? <CheckCircle2 className="h-5 w-5" /> : <FileCheck2 className="h-5 w-5" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{applied ? 'Complete' : 'One review, one save'}</p>
                    <h2 id="verify-k1-heading" className="mt-1 text-lg font-semibold text-slate-950">{applied ? 'K-1 saved to tax basis' : 'Check the extracted values against the PDF'}</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{applied
                      ? 'The verified values and source evidence are attached to this partnership year. No additional reconciliation step is required for the scan.'
                      : 'Correct anything that AWS read incorrectly. When the values look right, use the single save button below. Matching, review flags, finalization, and tax-basis application happen automatically.'}</p>
                  </div>
                  {applied && <Button type="button" onClick={openTaxBasisHistory} size="sm" className="shrink-0">Open K-1 history <ArrowRight className="h-4 w-4" /></Button>}
                </div>
              </div>
              {!applied && <div className="grid grid-cols-3 border-t border-slate-200 bg-white text-center text-xs">
                <div className="px-3 py-2.5"><strong className="block font-mono text-sm text-slate-950">{allFields.length}</strong><span className="text-slate-500">fields extracted</span></div>
                <div className="border-x border-slate-200 px-3 py-2.5"><strong className={`block font-mono text-sm ${reviewFlags.length ? 'text-amber-800' : 'text-emerald-700'}`}>{reviewFlags.length}</strong><span className="text-slate-500">to double-check</span></div>
                <div className="px-3 py-2.5"><strong className={`block font-mono text-sm ${missingRequiredFields.length ? 'text-red-700' : 'text-emerald-700'}`}>{missingRequiredFields.length}</strong><span className="text-slate-500">required missing</span></div>
              </div>}
            </section>

            {!applied && <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" aria-labelledby="tax-basis-destination-heading">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${destinationReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}><Link2 className="h-4 w-4" /></div>
                  <div className="min-w-0"><h2 id="tax-basis-destination-heading" className="text-sm font-semibold text-slate-950">Tax-basis destination</h2><p className="truncate text-xs text-slate-600">{selectedPartnershipName ?? sessionData.partnership.rawName ?? 'Choose partnership'} · {selectedEntityName ?? 'Choose owner'} · {selectedTaxYear || 'Choose year'}</p></div>
                </div>
                <button type="button" onClick={() => setDestinationEditorOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" aria-expanded={destinationEditorOpen}>{destinationEditorOpen ? 'Hide' : 'Change'} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${destinationEditorOpen ? 'rotate-180' : ''}`} /></button>
              </div>
              {destinationEditorOpen && <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Entity receiving the K-1</label><EntityTypeahead value={selectedEntityId} displayName={selectedEntityName} onChange={(entityId, entityName) => { setSelectedEntityId(entityId); setSelectedEntityName(entityName); setSelectedPartnershipId(null); setSelectedPartnershipName(null) }} disabled={!sessionData.canEdit} /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-700">Partnership that issued the K-1</label><PartnershipTypeahead entityId={selectedEntityId} value={selectedPartnershipId} displayName={selectedPartnershipName} onChange={(partnershipId, partnershipName) => { setSelectedPartnershipId(partnershipId); setSelectedPartnershipName(partnershipName) }} disabled={!sessionData.canEdit} /></div>
                <div><label htmlFor="review-tax-year" className="mb-1 block text-xs font-medium text-slate-700">Tax year</label><input id="review-tax-year" inputMode="numeric" value={selectedTaxYear} disabled={!sessionData.canEdit} onChange={(event) => setSelectedTaxYear(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-200" /></div>
                <p className="self-end text-xs leading-5 text-slate-600">There is no separate linking step. This destination is confirmed when you save the verified K-1.</p>
              </div>}
              <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
                <label className={`flex items-start gap-3 rounded-md border px-3 py-3 transition-colors ${inceptionYear ? 'border-cyan-500 bg-cyan-50' : 'border-slate-300 bg-white'} ${sessionData.canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                  <input
                    type="checkbox"
                    checked={inceptionYear}
                    disabled={!sessionData.canEdit}
                    onChange={(event) => setInceptionYear(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-950">This K-1 is the partnership’s inception year</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">Use zero beginning balances for outside basis, suspended losses, and Section L capital when the reviewed K-1 does not provide them. Existing extracted values are preserved.</span>
                  </span>
                </label>
              </div>
            </section>}

            {!applied && reviewFlags.length > 0 && <section className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3" aria-labelledby="double-check-heading">
              <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div className="min-w-0 flex-1"><h2 id="double-check-heading" className="text-sm font-semibold text-amber-950">Double-check {reviewFlags.length} extracted value{reviewFlags.length === 1 ? '' : 's'}</h2><p className="mt-1 text-xs leading-5 text-amber-900">These are AWS confidence flags, not separate tasks. Verify or correct the linked values below; the final save acknowledges them automatically.</p>
                <div className="mt-2 flex flex-wrap gap-2">{reviewFlags.map((issue) => {
                  const field = issue.k1FieldValueId ? fieldsById.get(issue.k1FieldValueId) : undefined
                  if (!field) return <span key={issue.id} className="rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-xs text-amber-900">{issue.message ?? 'Extraction note'}</span>
                  const display = getK1FieldDisplay(field)
                  return <button key={issue.id} type="button" onClick={() => handleViewIssueField(field)} className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100">Check {display.title}</button>
                })}</div>
              </div></div>
            </section>}

            {reviewFieldGroups.map((group) => <section key={group.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby={`k1-group-${group.id}`}>
              <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 sm:px-6"><h2 id={`k1-group-${group.id}`} className="text-sm font-semibold text-gray-900">{group.title}</h2><p className="mt-0.5 text-xs text-gray-600">{group.description}</p></div>
              <div>{group.fields.map((field) => <div key={field.id} id={`k1-review-field-${field.id}`} tabIndex={-1} onMouseEnter={() => setHighlight(field.sourceLocations?.[0] ?? field.sourceLocation ?? null)} onFocus={() => setHighlight(field.sourceLocations?.[0] ?? field.sourceLocation ?? null)} className={`scroll-mt-4 rounded-sm outline-none transition-shadow ${issueTargetFieldId === field.id ? 'relative z-10 ring-2 ring-cyan-500 ring-inset' : flaggedFieldIds.has(field.id) ? 'border-l-4 border-amber-400' : ''}`}>
                <ParsedFieldRow field={field} disabled={!sessionData.canEdit || applied} value={edits.currentValueFor(field)} onChange={(value) => edits.setFieldValue(field.id, value)} onEvidenceSelect={() => setHighlight(field.sourceLocations?.[0] ?? field.sourceLocation ?? null)} />
              </div>)}</div>
            </section>)}

            <details className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold text-slate-700">AWS extraction details</summary>
              <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-600">Attempt {sessionData.activeAttempt?.attemptNumber ?? '—'} · {sessionData.activeAttempt?.status ?? 'Unknown'} · {sessionData.activeAttempt?.provider ?? 'AWS'}</p>{sessionData.canEdit && !applied && <button type="button" onClick={() => void handleReprocessExtraction()} disabled={retryExtractionMutation.isPending} className="inline-flex min-h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:border-cyan-500 hover:bg-cyan-50 disabled:opacity-50"><RotateCcw className="h-3 w-3" />Re-run extraction</button>}</div>
            </details>

            {applied && <section className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center" aria-label="K-1 history navigation">
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-950">Continue with the saved K-1</h2><p className="mt-1 text-xs leading-5 text-slate-600">Open this partnership year to review the extracted values alongside any manual inputs.</p></div>
              <Button type="button" onClick={openTaxBasisHistory} size="sm" className="shrink-0 self-start sm:self-auto">Open K-1 history <ArrowRight className="h-4 w-4" /></Button>
            </section>}
          </div>

          {!applied && <div id="k1-review-actions" className="sticky bottom-0 z-20 -mt-20 flex flex-col gap-3 border-t border-slate-300 bg-white/95 px-4 py-3 shadow-[0_-8px_22px_rgba(15,23,42,0.12)] backdrop-blur sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-xs leading-5 text-slate-600">By saving, you confirm the values match the PDF. Existing K-1 values for this year are updated; dated cash activity remains authoritative.</p>
            {edits.hasEdits && <button type="button" onClick={() => edits.reset()} disabled={completing} className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Discard corrections</button>}
            <Button type="button" onClick={() => void handleComplete()} disabled={completionBlocked} pending={completing} className="px-5" data-testid="save-verified-k1">
              {completing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <CheckCircle2 className="h-4 w-4" />}{completionBlocked && missingRequiredFields.length ? `Complete ${missingRequiredFields.length} required field${missingRequiredFields.length === 1 ? '' : 's'}` : completionLabel[completionStage]}
            </Button>
          </div>}
        </div>

        <div className="h-full min-h-0"><PdfPanel pdfUrl={resolveApiUrl(sessionData.pdfUrl)} highlight={highlight} title={sessionData.partnership.name ?? sessionData.partnership.rawName ?? 'K-1 PDF'} /></div>
      </div>}
    </AppShell>
  )
}

export default K1ReviewWorkspace
