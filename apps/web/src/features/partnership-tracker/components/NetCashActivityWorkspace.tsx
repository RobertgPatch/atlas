import { Loader2 } from 'lucide-react'
import type { K1TrackerCashFlowEvent } from '../../../../../../packages/types/src/k1-tracker'
import type { CreatePartnershipCashFlowRequest, PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { usePartnershipTrackerActions, usePartnershipTrackerYear } from '../hooks/usePartnershipTracker'
import { DatedCashFlowPanel } from './DatedCashFlowPanel'
import { YearRail } from './YearRail'

const errorText = (error: unknown) => error instanceof Error
  ? error.message
  : 'Net cash activity could not be loaded.'

export function NetCashActivityWorkspace({ detail, selectedYear, canEdit, onSelectYear }: {
  detail: PartnershipTrackerDetail
  selectedYear?: number
  canEdit: boolean
  onSelectYear: (year: number) => void
}) {
  const partnershipId = detail.summary.partnership.id
  const effectiveYear = selectedYear ?? detail.years.at(-1)?.taxYear
  const year = usePartnershipTrackerYear(partnershipId, effectiveYear)
  const actions = usePartnershipTrackerActions()
  const selected = year.data

  const createCashFlows = async (entries: CreatePartnershipCashFlowRequest[]) => {
    if (effectiveYear == null) return
    await actions.createCashFlows.mutateAsync({ id: partnershipId, year: effectiveYear, body: { entries } })
  }

  const deleteCashFlow = async (event: K1TrackerCashFlowEvent) => {
    if (effectiveYear == null) return
    await actions.deleteCashFlow.mutateAsync({
      id: partnershipId,
      year: effectiveYear,
      cashFlowId: event.id,
      expectedUpdatedAt: event.updatedAt,
    })
  }

  return <div className="space-y-5">
    <section className="border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-950">Net cash activity</h3>
        <p className="mt-1 text-sm text-gray-500">Track exact-dated capital calls and distributions independently from the values reported on K-1 documents.</p>
      </div>
      <YearRail years={detail.years} selectedYear={effectiveYear} onSelect={onSelectYear} onPrefetch={() => undefined} />
    </section>

    {!detail.years.length
      ? <section className="border border-dashed border-gray-300 bg-white p-12 text-center"><h3 className="font-semibold text-gray-900">No tax years yet</h3><p className="mt-2 text-sm text-gray-500">Add a year from the K1 Entry tab before recording net cash activity.</p></section>
      : year.isLoading
        ? <div className="flex min-h-64 items-center justify-center border border-gray-200 bg-white" aria-label="Loading net cash activity"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        : year.isError
          ? <p role="alert" className="bg-red-50 p-5 text-sm text-red-700">{errorText(year.error)}</p>
          : selected
            ? <DatedCashFlowPanel
                taxYear={selected.taxYear}
                events={selected.cashFlowEvents ?? []}
                canEdit={canEdit}
                pending={(actions.createCashFlows?.isPending ?? false) || (actions.deleteCashFlow?.isPending ?? false)}
                onCreate={createCashFlows}
                onDelete={deleteCashFlow}
              />
            : null}
  </div>
}
