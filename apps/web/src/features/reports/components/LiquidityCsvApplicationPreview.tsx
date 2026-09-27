import type { ApplicationPreview } from '../../../../../../packages/types/src/liquidity-statements'
import { csvButton } from './LiquidityCsvDialog'

export function LiquidityCsvApplicationPreview({ preview, busy, onApply, onBack }: { preview: ApplicationPreview; busy: boolean; onApply: () => void; onBack: () => void }) {
  return <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
    <h3 className="font-semibold">Review the changes before applying</h3>
    {preview.accounts.map(account => <div key={account.accountId} className="space-y-1 rounded-lg bg-white p-3 text-sm">
      <p>Holdings as of {account.asOfDate}</p>
      <p>{account.added} added · {account.changed} changed · {account.removed} removed</p>
      <p>Account value: {account.previousValue} → {account.nextValue}</p>
      <p>{account.willBecomeCurrent ? 'This snapshot will become the current holdings for this account.' : 'This snapshot will be saved in history; current holdings will stay as they are.'}</p>
      {account.basisCoverage.status !== 'COMPLETE' && <p>Cost basis is incomplete. Known basis subtotal: {account.basisCoverage.knownSubtotal}.</p>}
      <p>Reconciliation: {account.reconciliation.replaceAll('_', ' ').toLowerCase()}</p>
    </div>)}
    <p className="text-sm">Absent holdings are removed from these accounts’ current view. Other accounts are unaffected. The original CSV and previous snapshots remain in history.</p>
    <div className="flex gap-3"><button className={csvButton} disabled={busy || !preview.canApply} onClick={onApply}>{busy ? 'Applying…' : 'Apply snapshot'}</button><button type="button" disabled={busy} onClick={onBack}>Back to review</button></div>
  </section>
}
