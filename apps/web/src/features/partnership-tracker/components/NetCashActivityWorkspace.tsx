import type { K1TrackerCashFlowEvent } from '../../../../../../packages/types/src/k1-tracker'
import type { CreatePartnershipCashFlowRequest, PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'
import { DatedCashFlowPanel } from './DatedCashFlowPanel'

export function NetCashActivityWorkspace({
  detail,
  canEdit,
}: {
  detail: PartnershipTrackerDetail
  canEdit: boolean
}) {
  const partnershipId = detail.summary.partnership.id
  const actions = usePartnershipTrackerActions()

  const createCashFlows = async (entries: CreatePartnershipCashFlowRequest[]) => {
    await actions.createCashFlows.mutateAsync({ id: partnershipId, body: { entries } })
  }

  const deleteCashFlow = async (event: K1TrackerCashFlowEvent) => {
    await actions.deleteCashFlow.mutateAsync({
      id: partnershipId,
      cashFlowId: event.id,
      expectedUpdatedAt: event.updatedAt,
    })
  }

  return (
    <div className="space-y-5">
      <section className="border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-jackson-hover">Operational ledger</p>
        <h3 className="mt-1 font-semibold text-gray-950">Cash activity across all dates</h3>
        <p className="mt-1 text-sm text-gray-500">
          Record exact-dated capital calls and distributions independently from K-1 tax years. Every entry feeds the Investment Tracker.
        </p>
      </section>
      <DatedCashFlowPanel
        events={detail.cashFlowEvents}
        canEdit={canEdit}
        pending={(actions.createCashFlows?.isPending ?? false) || (actions.deleteCashFlow?.isPending ?? false)}
        onCreate={createCashFlows}
        onDelete={deleteCashFlow}
      />
    </div>
  )
}
