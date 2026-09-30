import type { ApplicationPreview } from '../../../../../../packages/types/src/liquidity-statements'
import { csvButton } from './LiquidityCsvDialog'
import { formatCurrencyWithCents } from '../utils/formatters'

const money=(value:string)=>{
  const amount=Number(value)
  return Number.isFinite(amount)?formatCurrencyWithCents(amount,'USD'):'Unavailable'
}

export function LiquidityCsvApplicationPreview({ preview, busy, onApply, onBack }: { preview: ApplicationPreview; busy: boolean; onApply: () => void; onBack: () => void }) {
  return <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
    <h3 className="font-semibold">Review the changes before applying</h3>
    {preview.accounts.map(account => <div key={account.accountId} className="space-y-1 rounded-lg bg-white p-3 text-sm">
      <p>Holdings as of {account.asOfDate}</p>
      <p>{account.added} added · {account.changed} changed · {account.removed} removed</p>
      <p>Account value: {money(account.previousValue)} → {money(account.nextValue)}</p>
      <p>{account.willBecomeCurrent ? 'This snapshot will become the current holdings for this account.' : 'This snapshot will be saved in history; current holdings will stay as they are.'}</p>
      {account.basisCoverage.status !== 'COMPLETE' && <p>Cost basis is incomplete. Known basis subtotal: {account.basisCoverage.knownSubtotal==null?'Unavailable':money(account.basisCoverage.knownSubtotal)}.</p>}
      {account.gainCoverage.status !== 'COMPLETE' && <p>Gain/loss coverage is incomplete. Known gain/loss subtotal: {account.gainCoverage.knownSubtotal==null?'Unavailable':money(account.gainCoverage.knownSubtotal)}.</p>}
      {account.basisCoverage.estimatedRows>0&&<p>{account.basisCoverage.estimatedRows} basis value{account.basisCoverage.estimatedRows===1?' is':'s are'} estimated or cash-at-par.</p>}
      {account.controls.length>0&&<details><summary>Control comparisons</summary><ul className="list-disc pl-5">{account.controls.map(control=><li key={control.fieldPath}>Reported {money(control.reported)}; source {control.originalObserved==null?'unknown':money(control.originalObserved)} ({control.originalStatus.toLowerCase()}); reviewed {control.effectiveObserved==null?'unknown':money(control.effectiveObserved)} ({control.effectiveStatus.toLowerCase()})</li>)}</ul></details>}
      <p>Reconciliation: {account.reconciliation.replaceAll('_', ' ').toLowerCase()}</p>
    </div>)}
    {!!preview.excludedAccounts?.length&&<section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><h4 className="font-semibold">Excluded account snapshots</h4><ul className="list-disc pl-5">{preview.excludedAccounts.map(account=><li key={account.occurrenceId}>{account.displayName}: {account.positionCount} holdings unchanged · {account.reason}</li>)}</ul></section>}
    <p className="text-sm">Absent holdings are removed from these accounts’ current view. Other accounts are unaffected. The original statement and previous snapshots remain in history.</p>
    <div className="flex gap-3"><button className={csvButton} disabled={busy || !preview.canApply} onClick={onApply}>{busy ? 'Applying…' : 'Apply snapshot'}</button><button type="button" disabled={busy} onClick={onBack}>Back to review</button></div>
  </section>
}
