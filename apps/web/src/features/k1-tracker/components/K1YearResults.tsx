import type { K1TrackerYearDetail } from '../../../../../../packages/types/src/k1-tracker'
import { JournalEntryPanel } from './JournalEntryPanel'
import { LiabilitiesPanel } from './LiabilitiesPanel'
import { OutsideBasisPanel } from './OutsideBasisPanel'
import { ReconciliationPanel } from './ReconciliationPanel'
import { SignOffPanel } from './SignOffPanel'
import { YearStatusPanel } from './YearStatusPanel'
import { YearSummaryCards } from './YearSummaryCards'

export function K1YearResults({ detail, canEdit, pending, onSignoff }: {
  detail: K1TrackerYearDetail
  canEdit: boolean
  pending: boolean
  onSignoff: () => void
}) {
  const checksPassing = detail.calculation.checks.every((check) => check.status === 'PASS')
  return <section aria-label="K-1 calculated results" className="space-y-5">
    <div className="border border-gray-200 bg-white p-5"><h3 className="text-lg font-semibold text-gray-950">Calculated results</h3><p className="mt-1 text-sm text-gray-600">Basis, reconciliation, journal, and sign-off remain on this annual entry page.</p><div className="mt-4"><YearSummaryCards detail={detail} /></div></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]"><div className="space-y-5"><OutsideBasisPanel calculation={detail.calculation} detail={detail} /><LiabilitiesPanel calculation={detail.calculation} detail={detail} /><ReconciliationPanel calculation={detail.calculation} detail={detail} /></div><aside className="space-y-5"><YearStatusPanel detail={detail} /><JournalEntryPanel calculation={detail.calculation} detail={detail} /><SignOffPanel state={detail.signoff} checksPassing={checksPassing} canEdit={canEdit} pending={pending} onSignoff={onSignoff} /></aside></div>
  </section>
}
