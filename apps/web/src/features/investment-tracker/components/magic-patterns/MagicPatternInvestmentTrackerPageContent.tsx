import { AlertTriangle, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MagicPatternCapitalActivityPortfolio } from '../../../partnership-tracker/components/magic-patterns/MagicPatternCapitalActivityPortfolio'
import { MagicPatternPartnershipRecordDialog } from '../../../partnership-tracker/components/magic-patterns/MagicPatternPartnershipRecordDialog'
import { MagicPatternPartnershipWorkspace } from '../../../partnership-tracker/components/magic-patterns/MagicPatternPartnershipWorkspace'
import {
  MagicButton,
  MagicCard,
} from '../../../partnership-tracker/components/magic-patterns/MagicPatternPrimitives'
import { usePartnershipTrackerDetail } from '../../../partnership-tracker/hooks/usePartnershipTracker'
import {
  canonicalInvestmentTrackerArea,
  selectedInvestmentTrackerYear,
  updateInvestmentTrackerQuery,
} from '../../investmentTrackerQueryState'

export function MagicPatternInvestmentTrackerPageContent({ canEdit }: { canEdit: boolean }) {
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const selectedId = params.get('partnership') ?? undefined
  const detail = usePartnershipTrackerDetail(selectedId)
  const area = canonicalInvestmentTrackerArea(params.get('area'))
  const selectedYear = selectedInvestmentTrackerYear(params.get('year'))

  const updateUrl = useCallback((changes: Record<string, string | undefined>) => {
    setParams(updateInvestmentTrackerQuery(params, changes), { replace: true })
  }, [params, setParams])

  const openPartnership = (partnershipId: string) => {
    updateUrl({ partnership: partnershipId, area: 'overview', year: undefined })
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
        onDeleted={() => updateUrl({ partnership: undefined, area: undefined, year: undefined })}
      />
    )
  }

  return (
    <div
      className="-m-4 min-h-[calc(100vh-4rem)] bg-[#e7edf4] p-4 pb-10 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8"
      data-design-variant="magic-patterns-investment-tracker"
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-5 border-b border-[#bfcbd9] pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#17263a]">Investment tracker</h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#3e5169]">
            Create and manage partnerships, review portfolio-wide activity, and open any owner record from the investment register.
          </p>
        </div>
        {canEdit ? (
          <MagicButton type="button" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Add partnership
          </MagicButton>
        ) : null}
      </header>

      <MagicPatternCapitalActivityPortfolio onOpen={openPartnership} />

      {adding ? (
        <MagicPatternPartnershipRecordDialog
          open
          mode="create"
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false)
            openPartnership(id)
          }}
        />
      ) : null}
    </div>
  )
}
