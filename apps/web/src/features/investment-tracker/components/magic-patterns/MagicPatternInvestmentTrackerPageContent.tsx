import { AlertTriangle, FileText, Keyboard, Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { K1UploadDialog } from '../../../k1/components/K1UploadDialog'
import { useK1Batch } from '../../../k1/hooks/useK1Queries'
import { MagicPatternCapitalActivityPortfolio } from '../../../partnership-tracker/components/magic-patterns/MagicPatternCapitalActivityPortfolio'
import { MagicPatternPartnershipRecordDialog } from '../../../partnership-tracker/components/magic-patterns/MagicPatternPartnershipRecordDialog'
import { MagicPatternPartnershipWorkspace } from '../../../partnership-tracker/components/magic-patterns/MagicPatternPartnershipWorkspace'
import {
  MagicButton,
  MagicCard,
  MagicModal,
} from '../../../partnership-tracker/components/magic-patterns/MagicPatternPrimitives'
import { usePartnershipTrackerDetail } from '../../../partnership-tracker/hooks/usePartnershipTracker'
import {
  canonicalInvestmentTrackerArea,
  selectedInvestmentTrackerYear,
  updateInvestmentTrackerQuery,
} from '../../investmentTrackerQueryState'

// Keep the K-1-first creation flow intact while it is not ready for use.
const K1_PARTNERSHIP_CREATION_ENABLED = false

export function MagicPatternInvestmentTrackerPageContent({ canEdit }: { canEdit: boolean }) {
  const [params, setParams] = useSearchParams()
  const exportTarget = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState<'choose' | 'manual' | 'k1' | null>(null)
  const [pendingImportBatchId, setPendingImportBatchId] = useState<string | null>(null)
  const selectedId = params.get('partnership') ?? undefined
  const detail = usePartnershipTrackerDetail(selectedId)
  const pendingImport = useK1Batch(pendingImportBatchId)
  const area = canonicalInvestmentTrackerArea(params.get('area'))
  const selectedYear = selectedInvestmentTrackerYear(params.get('year'))
  const importedPartnershipId = pendingImport.data?.items.find((item) => item.partnershipId)?.partnershipId

  const updateUrl = useCallback((changes: Record<string, string | undefined>) => {
    setParams(updateInvestmentTrackerQuery(params, changes), { replace: true })
  }, [params, setParams])

  const openPartnership = useCallback((partnershipId: string) => {
    updateUrl({ partnership: partnershipId, area: 'capital-activity', year: undefined })
  }, [updateUrl])

  if (selectedId && area === 'k1-history') {
    const destination = new URLSearchParams({ partnership: selectedId })
    if (selectedYear) destination.set('year', String(selectedYear))
    return <Navigate replace to={`/k1?${destination}`} />
  }

  if (selectedId && detail.isLoading) {
    return (
      <div className="-m-4 min-h-[calc(100vh-4rem)] bg-[#e7edf4] p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
        <MagicCard className="grid min-h-80 place-items-center" data-testid="investment-partnership-loading">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400 motion-reduce:animate-none" />
        </MagicCard>
      </div>
    )
  }

  if (selectedId && (detail.isError || !detail.data)) {
    return (
      <div className="-m-4 min-h-[calc(100vh-4rem)] bg-[#e7edf4] p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
        <MagicCard className="border-red-200 bg-red-50 p-6" data-testid="investment-partnership-error">
          <div className="flex gap-3 text-red-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <h1 className="font-semibold">Failed to load partnership</h1>
              <p className="mt-1 text-sm">The selected partnership could not be loaded. It may have been deleted or your access may have changed.</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <MagicButton type="button" variant="secondary" onClick={() => void detail.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </MagicButton>
            <MagicButton
              type="button"
              variant="ghost"
              onClick={() => updateUrl({ partnership: undefined, area: undefined, year: undefined })}
            >
              Investment tracker
            </MagicButton>
          </div>
        </MagicCard>
      </div>
    )
  }

  if (selectedId && detail.data) {
    return (
      <MagicPatternPartnershipWorkspace
        detail={detail.data}
        canEdit={canEdit}
        area={area}
        selectedYear={selectedYear}
        onAreaChange={(nextArea) => updateUrl({
          area: nextArea,
          year: nextArea === 'k1-history' ? params.get('year') ?? undefined : undefined,
        })}
        onYearChange={(year) => updateUrl({ area: 'k1-history', year: String(year) })}
        onBack={() => updateUrl({ partnership: undefined, area: undefined, year: undefined })}
      />
    )
  }

  return (
    <div
      ref={exportTarget}
      className="-m-4 min-h-[calc(100vh-4rem)] bg-[#e7edf4] p-4 pb-10 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8"
      data-design-variant="magic-patterns-investment-tracker"
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-5 border-b border-[#bfcbd9] pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#17263a]">All Partnerships</h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#3e5169]">
            Review investment performance and capital activity across all partnerships. Filter by fund and owner, or open a partnership profile from the register.
          </p>
        </div>
        {canEdit ? (
          <MagicButton
            data-pdf-exclude
            type="button"
            onClick={() => setAdding(K1_PARTNERSHIP_CREATION_ENABLED ? 'choose' : 'manual')}
          >
            <Plus className="h-4 w-4" />
            Add partnership
          </MagicButton>
        ) : null}
      </header>

      {pendingImportBatchId ? (
        importedPartnershipId ? (
          <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              The K-1 was linked to a partnership record.
            </span>
            <MagicButton
              type="button"
              onClick={() => {
                setPendingImportBatchId(null)
                openPartnership(importedPartnershipId)
              }}
            >
              Open partnership
            </MagicButton>
          </div>
        ) : pendingImport.isError ? (
          <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <span>The K-1 import status could not be refreshed.</span>
            <MagicButton type="button" variant="secondary" onClick={() => void pendingImport.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </MagicButton>
          </div>
        ) : pendingImport.data && ['ACTION_REQUIRED', 'PARTIAL_FAILURE'].includes(pendingImport.data.status) ? (
          <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span>The first page did not identify one partnership safely. No partnership or annual K-1 was created.</span>
            <MagicButton type="button" variant="secondary" onClick={() => setPendingImportBatchId(null)}>
              Dismiss
            </MagicButton>
          </div>
        ) : (
          <div role="status" className="mb-5 flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <Loader2 className="h-4 w-4 animate-spin text-sky-700 motion-reduce:animate-none" />
            Reading the K-1 and checking for an existing partnership…
          </div>
        )
      ) : null}

      <MagicPatternCapitalActivityPortfolio canEdit={canEdit} onOpen={openPartnership} exportTarget={exportTarget} />

      {K1_PARTNERSHIP_CREATION_ENABLED && adding === 'choose' ? (
        <MagicModal
          open
          size="md"
          title="Add a partnership"
          description="Choose how you want to create the owner record."
          onClose={() => setAdding(null)}
          footer={(
            <MagicButton type="button" variant="secondary" onClick={() => setAdding(null)}>
              Cancel
            </MagicButton>
          )}
        >
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setAdding('k1')}
              className="group rounded-lg border border-sky-300 bg-sky-50 p-4 text-left outline-none transition hover:border-sky-500 hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sky-700 text-white">
                  <FileText className="h-5 w-5" />
                </span>
                <span>
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                    Use a K-1 PDF
                    <span className="rounded-full bg-sky-700 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white">Recommended</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    Read the fund identity, address, owner, and tax year from the document. Existing records are reused automatically.
                  </span>
                  <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-sky-800">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Conflicting matches stop for review
                  </span>
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAdding('manual')}
              className="rounded-lg border border-slate-300 bg-white p-4 text-left outline-none transition hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-200 text-slate-700">
                  <Keyboard className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-950">Enter details manually</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    Use the full form for a new fund or an additional owner of a fund already on file.
                  </span>
                </span>
              </span>
            </button>
          </div>
        </MagicModal>
      ) : null}

      {adding === 'manual' ? (
        <MagicPatternPartnershipRecordDialog
          open
          mode="create"
          onClose={() => setAdding(null)}
          onCreated={(id) => {
            setAdding(null)
            openPartnership(id)
          }}
        />
      ) : null}

      <K1UploadDialog
        open={K1_PARTNERSHIP_CREATION_ENABLED && adding === 'k1'}
        createPartnershipIfMissing
        onClose={() => setAdding(null)}
        onUploaded={() => undefined}
        onBatchCreated={(batch) => setPendingImportBatchId(batch.id)}
      />
    </div>
  )
}
