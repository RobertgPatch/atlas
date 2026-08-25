import { CheckCircle2, Loader2 } from 'lucide-react'
import type { K1TrackerSignoffState } from '../../../../../packages/types/src/k1-tracker'
import { isK1TrackerYearReconciled } from '../reconciliationGuidance'

const historyLabel = {
  PREPARED: 'prepared',
  REVIEWED: 'signed off',
  INVALIDATED: 'invalidated',
} as const

export function SignOffPanel({ state, checksPassing, canEdit, pending, onSignoff }: { state: K1TrackerSignoffState; checksPassing: boolean; canEdit: boolean; pending: boolean; onSignoff: () => void }) {
  const signedOff = isK1TrackerYearReconciled(state)

  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-gray-950">Sign-off</h3>
    <div className="mt-3 space-y-2 text-sm">
      <p className={signedOff ? 'text-emerald-700' : 'text-gray-500'}>{signedOff ? `Signed off by ${state.reviewedByEmail ?? 'the CPA'}` : 'Not signed off'}</p>
      {state.invalidatedAt && !signedOff && <p className="text-amber-700">Sign-off invalidated: {state.invalidationReason ?? 'data changed'}</p>}
    </div>
    {canEdit && <div className="mt-4">
      <button type="button" disabled={pending || signedOff || !checksPassing} onClick={onSignoff} className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${signedOff ? 'cursor-default bg-emerald-600 text-white' : 'bg-primary text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-disabled-background disabled:text-disabled-foreground'}`}>
        {pending
          ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Signing off…</>
          : signedOff
            ? <><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Signed off</>
            : 'Sign off year'}
      </button>
    </div>}
    {(state.history?.length ?? 0) > 0 && <ul className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">{state.history!.map((item) => <li key={`${item.action}-${item.at}`}>{historyLabel[item.action]} · {item.byEmail ?? 'system'} · {new Date(item.at).toLocaleString()}</li>)}</ul>}
    {!checksPassing && <p className="mt-3 flex gap-1 text-xs text-amber-700"><CheckCircle2 className="h-3.5 w-3.5" />Resolve all checks marked Required before sign-off. Calculated warnings may be signed off after review.</p>}
  </div>
}
