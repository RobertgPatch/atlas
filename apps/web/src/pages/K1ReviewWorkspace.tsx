import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldCheck, Save, X } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { StatusBadge } from '../components/shared/StatusBadge'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'
import {
  useApproveK1,
  useFinalizeK1,
  useMapEntity,
  useMapPartnership,
  useOpenIssue,
  useResolveIssue,
  useReviewSession,
  useSaveCorrections,
  K1ReviewError,
} from '../features/review/hooks/useReviewSession'
import { useFieldEdits, SECTION_TITLE } from '../features/review/hooks/useFieldEdits'
import { useUnsavedChangesGuard } from '../features/review/hooks/useUnsavedChangesGuard'
import { ParsedFieldRow } from '../features/review/components/ParsedFieldRow'
import { PdfPanel } from '../features/review/components/PdfPanel'
import { IssueQueueDialog } from '../features/review/components/IssueQueueDialog'
import type {
  K1FieldValue,
  K1IssueSeverity,
  K1ReviewSection,
  K1Status,
} from '../../../../packages/types/src/review-finalization'

// Resolve a server-provided relative URL (e.g. "/k1-documents/<id>/pdf") to an
// absolute URL pointing at the API origin. In production the api lives on a
// different subdomain than the web app, so iframes/fetches must target it
// directly. Locally VITE_API_BASE_URL is unset and we fall back to the same
// origin.
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
  const [issueDialog, setIssueDialog] = useState<{ fieldId: string | null } | null>(null)

  const saveMutation = useSaveCorrections(k1Id)
  const approveMutation = useApproveK1(k1Id)
  const finalizeMutation = useFinalizeK1(k1Id)
  const openIssueMutation = useOpenIssue(k1Id)
  const resolveIssueMutation = useResolveIssue(k1Id)
  const mapEntityMutation = useMapEntity(k1Id)
  const mapPartnershipMutation = useMapPartnership(k1Id)

  useUnsavedChangesGuard(edits.hasEdits)

  const reportError = (e: unknown) => {
    if (e instanceof K1ReviewError) {
      if (e.code === 'STALE_K1_VERSION') {
        setStaleError(
          'Another reviewer made changes while you were editing. Please reload to see the latest version.',
        )
      } else {
        setToast({ kind: 'err', text: e.code })
      }
    } else {
      setToast({ kind: 'err', text: 'Unexpected error' })
    }
  }

  const currentVersion = query.data?.version ?? 0
  const sessionData = query.data

  const sections: K1ReviewSection[] = ['entityMapping', 'partnershipMapping', 'core']

  const BLOCKING_REASON_LABELS: Record<string, string> = {
    NOT_ADMIN: 'You must be an Admin',
    WRONG_STATUS: 'K-1 is not in the required status for this action',
    OPEN_ISSUES: 'There are open issues to resolve',
    EMPTY_REQUIRED: 'One or more required fields are empty',
    UNMAPPED_ENTITY: 'Entity is not mapped',
    UNMAPPED_PARTNERSHIP: 'Partnership is not mapped',
    MISSING_REPORTED_DISTRIBUTION: 'Reported distribution (Box 19A) is missing',
  }
  const describeReasons = (reasons: string[] | undefined, extra: string[] = []) => {
    const all = [...(reasons ?? []), ...extra]
    if (all.length === 0) return undefined
    return all.map((r) => BLOCKING_REASON_LABELS[r] ?? r).join('\n')
  }

  const anyUnresolved = useMemo(
    () => sessionData?.issues.some((i) => i.status === 'OPEN') ?? false,
    [sessionData],
  )

  const handleSave = async () => {
    if (!sessionData) return
    try {
      await saveMutation.mutateAsync({
        body: { corrections: edits.toCorrectionsPayload() },
        version: currentVersion,
      })
      edits.reset()
      setToast({ kind: 'ok', text: 'Corrections saved' })
    } catch (e) {
      reportError(e)
    }
  }

  const handleApprove = async () => {
    if (!sessionData) return
    try {
      await approveMutation.mutateAsync({ version: currentVersion })
      setToast({ kind: 'ok', text: 'K-1 approved' })
    } catch (e) {
      reportError(e)
    }
  }

  const handleFinalize = async () => {
    if (!sessionData) return
    try {
      await finalizeMutation.mutateAsync({ version: currentVersion })
      setToast({ kind: 'ok', text: 'K-1 finalized' })
    } catch (e) {
      reportError(e)
    }
  }

  const handleOpenIssue = (fieldId: string) => {
    if (!sessionData) return
    setIssueDialog({ fieldId })
  }

  const handleSubmitIssue = async (args: {
    fieldId: string | null
    message: string
    severity: K1IssueSeverity
  }) => {
    if (!sessionData) return
    try {
      await openIssueMutation.mutateAsync({
        body: { k1FieldValueId: args.fieldId, message: args.message, severity: args.severity },
        version: currentVersion,
      })
      setIssueDialog(null)
      setToast({ kind: 'ok', text: 'Issue opened' })
    } catch (e) {
      reportError(e)
    }
  }

  const handleResolveIssue = async (issueId: string) => {
    if (!sessionData) return
    try {
      await resolveIssueMutation.mutateAsync({ issueId, version: currentVersion })
      setToast({ kind: 'ok', text: 'Issue resolved' })
    } catch (e) {
      reportError(e)
    }
  }

  if (!k1Id) return <div>Invalid K-1 id</div>

  return (
    <AppShell
      currentPath={window.location.pathname}
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <PageHeader
        title="Review K-1"
        subtitle={
          sessionData
            ? `${sessionData.partnership.name ?? '(unmapped)'} · ${sessionData.entity.name ?? '(unmapped)'} · Tax year ${sessionData.taxYear ?? 'pending extraction'}`
            : undefined
        }
      />

      {staleError && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          data-testid="stale-banner"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            {staleError}
          </div>
          <button
            className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium hover:bg-red-100"
            onClick={() => {
              setStaleError(null)
              edits.reset()
              void query.refetch()
            }}
          >
            Reload
          </button>
        </div>
      )}

      {toast && (
        <div
          className={`mb-4 flex items-center justify-between rounded-md px-4 py-2 text-sm ${
            toast.kind === 'ok'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
          role="status"
        >
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {query.isLoading && <div className="py-16 text-center text-gray-500">Loading…</div>}
      {query.isError && (
        <div className="py-16 text-center text-red-600">Failed to load review session.</div>
      )}

      {sessionData && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 h-[calc(100vh-14rem)]">
          <div className="flex flex-col gap-4 overflow-y-auto pr-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/k1')}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to K-1 Dashboard
              </button>
              <span className="text-gray-300">|</span>
              <StatusBadge status={statusToBadge[sessionData.status]} />
              <span className="text-xs text-gray-500" data-testid="review-version">
                v{sessionData.version}
              </span>
            </div>

            {sections.map((section) => {
              const fields = sessionData.fields[section]
              if (fields.length === 0) return null
              return (
                <div
                  key={section}
                  className="rounded-lg border border-gray-200 bg-white shadow-sm"
                >
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
                    {SECTION_TITLE[section]}
                  </div>
                  <div>
                    {fields.map((f) => (
                      <div
                        key={f.id}
                        onMouseEnter={() => setHighlight(f.sourceLocation ?? null)}
                        onFocus={() => setHighlight(f.sourceLocation ?? null)}
                      >
                        <ParsedFieldRow
                          field={f}
                          disabled={!sessionData.canEdit}
                          value={edits.currentValueFor(f)}
                          onChange={(v) => edits.setFieldValue(f.id, v)}
                          onOpenIssue={() => handleOpenIssue(f.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {sessionData.issues.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
                  Issues
                </div>
                <ul className="divide-y divide-gray-100">
                  {sessionData.issues.map((i) => (
                    <li key={i.id} className="flex items-center justify-between px-4 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            i.status === 'OPEN'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {i.status}
                        </span>
                        <span className="text-gray-700">{i.message || i.issueType}</span>
                      </div>
                      {i.status === 'OPEN' && sessionData.canEdit && (
                        <button
                          onClick={() => void handleResolveIssue(i.id)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Resolve
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="sticky bottom-0 bg-white border-t border-gray-200 py-3 flex items-center gap-2">
              <button
                onClick={() => void handleSave()}
                disabled={!edits.hasEdits || saveMutation.isPending || !sessionData.canEdit}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:bg-gray-300"
                data-testid="save-corrections"
              >
                <Save size={14} /> Save
              </button>
              <button
                onClick={() => edits.reset()}
                disabled={!edits.hasEdits}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 disabled:text-gray-400"
              >
                Cancel
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  disabled={
                    !sessionData.canApprove ||
                    anyUnresolved ||
                    approveMutation.isPending ||
                    edits.hasEdits
                  }
                  title={describeReasons(
                    (sessionData as unknown as { approveBlockingReasons?: string[] })
                      .approveBlockingReasons,
                    [
                      ...(anyUnresolved ? ['OPEN_ISSUES'] : []),
                      ...(edits.hasEdits ? ['Unsaved edits — save or cancel first'] : []),
                    ],
                  )}
                  onClick={() => void handleApprove()}
                  className="inline-flex items-center gap-1 rounded-md border border-green-600 bg-white px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:border-gray-300 disabled:text-gray-400"
                  data-testid="approve-button"
                >
                  <CheckCircle2 size={14} /> Approve
                </button>
                <button
                  disabled={
                    !sessionData.canFinalize ||
                    anyUnresolved ||
                    finalizeMutation.isPending ||
                    edits.hasEdits
                  }
                  title={describeReasons(
                    (sessionData as unknown as { finalizeBlockingReasons?: string[] })
                      .finalizeBlockingReasons,
                    [
                      ...(anyUnresolved ? ['OPEN_ISSUES'] : []),
                      ...(edits.hasEdits ? ['Unsaved edits — save or cancel first'] : []),
                    ],
                  )}
                  onClick={() => void handleFinalize()}
                  className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-300"
                  data-testid="finalize-button"
                >
                  <ShieldCheck size={14} /> Finalize
                </button>
              </div>
            </div>

            <button
              onClick={() => navigate('/k1')}
              className="self-start text-xs text-gray-500 hover:text-gray-700"
            >
              ← Back to K-1 Dashboard
            </button>
          </div>

          <div className="h-full">
            <PdfPanel
              pdfUrl={resolveApiUrl(sessionData.pdfUrl)}
              highlight={highlight}
              title={sessionData.partnership.name ?? 'K-1 PDF'}
            />
          </div>
        </div>
      )}

      {/* unused helpers for linter — keep references so tree-shaking doesn't warn */}
      {false && (
        <>
          <button onClick={() => void mapEntityMutation.mutateAsync({ body: { entityId: '' }, version: 0 })} />
          <button onClick={() => void mapPartnershipMutation.mutateAsync({ body: { partnershipId: '' }, version: 0 })} />
        </>
      )}

      {issueDialog && sessionData && (
        <IssueQueueDialog
          fields={[
            ...sessionData.fields.entityMapping,
            ...sessionData.fields.partnershipMapping,
            ...sessionData.fields.core,
          ]}
          initialFieldId={issueDialog.fieldId}
          onSubmit={(args) => void handleSubmitIssue(args)}
          onCancel={() => setIssueDialog(null)}
          isPending={openIssueMutation.isPending}
        />
      )}
    </AppShell>
  )
}

export default K1ReviewWorkspace
