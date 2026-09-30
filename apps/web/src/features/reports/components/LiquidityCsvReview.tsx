/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { positionFields, type AccountBinding, type ApplicationPreview, type CsvDetail, type CsvDraft, type CsvField, type CsvPosition, type ExcludedAccountDecision, type ReviewChange, type SourceAccount, type StatementDraft, type StatementField, type StatementLocation, type StatementPosition } from '../../../../../../packages/types/src/liquidity-statements'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'
import { LiquidityCsvMapping } from './LiquidityCsvMapping'
import { LiquidityCsvApplicationPreview } from './LiquidityCsvApplicationPreview'
import { csvButton, csvInput, statementFormatGuidance } from './LiquidityCsvDialog'
import { formatCurrencyWithCents } from '../utils/formatters'
import { LiquidityStatementFindings,statementIssueDescription } from './LiquidityStatementFindings'
import { LiquidityStatementEvidence } from './LiquidityStatementEvidence'
import { LiquidityStatementAccountSelection } from './LiquidityStatementAccountSelection'

const assetCategories = [
  ['equity', 'Equity'],
  ['fund', 'ETF / Fund'],
  ['cash', 'Cash'],
  ['bond', 'Bond / Fixed income'],
  ['option', 'Option'],
  ['other', 'Other'],
] as const
const supportedAssetCategories = new Set<string>(assetCategories.map(([value]) => value))
const reviewValue = (field: 'quantity' | 'marketValue' | 'costBasis' | 'unrealizedGainLoss', value: CsvField['value']) => {
  if (value == null) return 'Unavailable'
  if (field === 'quantity') return String(value)
  const amount = Number(value)
  return Number.isFinite(amount) ? formatCurrencyWithCents(amount, 'USD') : 'Unavailable'
}
const reviewMoney = (value: string | boolean | null | undefined) => {
  if (typeof value !== 'string') return 'Unavailable'
  const amount = Number(value)
  return Number.isFinite(amount) ? formatCurrencyWithCents(amount, 'USD') : 'Unavailable'
}
export const reviewIssueDescription=statementIssueDescription

type ReviewField = CsvField | StatementField
type ReviewPosition = CsvPosition | StatementPosition
const fieldLocation=(field:ReviewField)=>{
  const evidence=field.evidence[0] as StatementLocation|undefined
  if(!evidence)return ''
  return evidence.kind==='XLSX'?`${evidence.sheetName}!${evidence.address}`:`record ${evidence.record}, line ${evidence.lineStart}`
}
export function csvFieldExplanation(field: ReviewField, position: ReviewPosition) {
  const labels:Record<string,string>={BASIS_FROM_VALUE_GAIN:'Cost basis = market value minus unrealized gain/loss',BASIS_FROM_PERCENT_ESTIMATE:'Estimated cost basis = market value divided by one plus gain/loss ratio',CASH_AT_PAR:'Cost basis = market value for a $1 cash-like holding',CASH_VALUE_BASIS:'Cost basis = market value for a cash holding without quantity',GAIN_FROM_VALUE_BASIS:'Gain/loss = market value minus cost basis',PERCENT_FROM_GAIN_BASIS:'Gain/loss ratio = unrealized gain/loss divided by cost basis'}
  const located=fieldLocation(field)
  if(!field.derivation)return `${field.origin.toLowerCase()}: ${field.raw.join(' | ') || field.reason || 'No source value'}${located?` (${located})`:''}`
  const operands=field.derivation.operands.map(path=>(position as unknown as Record<string,ReviewField>)[path.split('.').at(-1)!]).map(value=>value?.value??null)
  return `${labels[field.derivation.rule]??field.derivation.rule.replaceAll('_',' ').toLowerCase()}. Inputs: ${operands.join(', ')}. Result: ${field.value}.${located?` Source: ${located}.`:''}`
}

export function LiquidityCsvReview({ detail, accounts, onChanged }: { detail: CsvDetail; accounts: SourceAccount[]; onChanged: () => Promise<unknown> }) {
  const [bindings, setBindings] = useState<AccountBinding[]>(detail.accountBindings)
  const [excludedAccounts,setExcludedAccounts]=useState<ExcludedAccountDecision[]>(detail.excludedAccounts??[])
  const [changes, setChanges] = useState<ReviewChange[]>([])
  const [acknowledged, setAcknowledged] = useState<string[]>(detail.issues.filter(i => i.acknowledged).map(i => i.id))
  const [preview, setPreview] = useState<ApplicationPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [correctionPath, setCorrectionPath] = useState('')
  const [correctionValue, setCorrectionValue] = useState('')
  const [pages, setPages] = useState<Record<string, number>>({})
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [evidenceTarget,setEvidenceTarget]=useState<number|null>(null)
  const [reprocessReason,setReprocessReason]=useState('Reprocess the retained original with the latest tested adapter')
  const { summary } = detail
  const formatGuidance=statementFormatGuidance(summary.status,detail.fileKind??'CSV',summary.safeErrorCode)
  const draft=detail.canonicalDraft as CsvDraft|StatementDraft|null
  const statementDraft=draft?.schemaVersion==='3.0.0'?draft:null
  const blockingFindings=detail.issues.filter(issue=>issue.severity==='BLOCKING')
  const appliedHistory=(detail.priorApplications??[]).filter(application=>application.status==='APPLIED')
  const lastApplied=appliedHistory.at(-1)
  const correctionActive=!!lastApplied&&lastApplied.runId!==detail.activeRunId&&summary.status!=='APPLIED'
  const eligible = accounts.filter(a => a.entityId === summary.entityId && a.custodian === summary.custodian)
  async function perform(action: () => Promise<unknown>) {
    setError(''); setBusy(true)
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Reload the draft and try again.') } finally { setBusy(false) }
  }
  function patchBinding(occurrenceId: string, patch: Partial<AccountBinding>) {
    setExcludedAccounts(previous=>previous.filter(excluded=>excluded.occurrenceId!==occurrenceId))
    setBindings(previous => {
      const existing = previous.find(b => b.occurrenceId === occurrenceId)
      return [...previous.filter(b => b.occurrenceId !== occurrenceId), { occurrenceId, completeAccount: true, emptyAccountConfirmed: false, accountId: '', expectedAccountVersion: 1, ...existing, ...patch }]
    })
  }
  function excludeAccount(decision:ExcludedAccountDecision){
    setBindings(previous=>previous.filter(binding=>binding.occurrenceId!==decision.occurrenceId))
    setExcludedAccounts(previous=>[...previous.filter(excluded=>excluded.occurrenceId!==decision.occurrenceId),decision])
  }
  function setAssetCategory(fieldPath: string, originalValue: string, value: string) {
    setChanges(previous => value === originalValue
      ? previous.filter(change => change.fieldPath !== fieldPath)
      : [...previous.filter(change => change.fieldPath !== fieldPath), {
        fieldPath,
        value,
        reason: 'Asset category selected during CSV review',
      }])
  }
  const currentBindings = () => bindings.map(b => ({ ...b, acknowledgedIssueIds: acknowledged }))
  const editable = ['NEEDS_REVIEW', 'READY_TO_APPLY'].includes(summary.status)
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{summary.custodian} · {summary.status.replaceAll('_', ' ').toLowerCase()}</h3>
      <button type="button" disabled={busy} onClick={() => void perform(async () => {
        const result = await api.source(summary.id)
        const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'
        window.open(result.url.startsWith('/v1/') ? `${base}${result.url.slice(3)}` : result.url, '_blank', 'noopener,noreferrer')
      })}>Download original statement</button>
    </div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {appliedHistory.length>0&&<section className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"><h4 className="font-semibold">Preserved approval history</h4><p>{appliedHistory.length} applied approval{appliedHistory.length===1?'':'s'} {appliedHistory.length===1?'remains':'remain'} immutable. Reprocessing creates a new draft and does not copy prior review edits.</p><ul className="mt-1 list-disc pl-5">{appliedHistory.map(application=><li key={application.id}>{application.appliedAt?new Date(application.appliedAt).toLocaleString():'Applied'} · {application.snapshotIds.length} snapshot{application.snapshotIds.length===1?'':'s'}</li>)}</ul></section>}
    {correctionActive&&<p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">This is a new correction draft from the retained original. Earlier approvals remain active until this draft is applied. Prior field edits are historical and were not copied.</p>}
    {formatGuidance && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{formatGuidance}</p>}
    {blockingFindings.length > 0 && <section role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><h4 className="font-semibold">Resolve these items before applying the snapshot</h4><ul className="mt-1 list-disc space-y-1 pl-5">{blockingFindings.map(issue=><li key={issue.id}>{reviewIssueDescription(issue)}</li>)}</ul></section>}
    {summary.safeErrorCode && <p role="alert">The upload could not be processed ({summary.safeErrorCode}). Current holdings are unchanged.</p>}
    {['UPLOAD_PENDING', 'VALIDATING', 'QUEUED', 'PARSING'].includes(summary.status) && <p role="status">Processing your upload. You can close this window and return to the draft.</p>}
    {summary.status === 'FAILED' && summary.safeErrorCode === 'TRANSIENT_FAILURE' && <button className={csvButton} disabled={busy} onClick={() => void perform(async () => { await api.retry(summary.id, summary.version); await onChanged() })}>Retry processing</button>}
    {summary.status==='APPLIED'&&<section className="space-y-2 rounded-lg border border-slate-200 p-3"><h4 className="font-semibold">Create a new correction draft</h4><p className="text-sm text-slate-600">The protected original will be parsed into a new run. Existing snapshots, approvals, hashes and history are not rewritten.</p><label className="block text-sm">Reason<input className={csvInput} value={reprocessReason} onChange={event=>setReprocessReason(event.target.value)}/></label><button type="button" className={csvButton} disabled={busy||!reprocessReason.trim()} onClick={()=>void perform(async()=>{await api.reprocess(summary.id,summary.version,reprocessReason);await onChanged()})}>Reprocess with latest adapter</button></section>}
    {(summary.status === 'NEEDS_MAPPING' || summary.status === 'FAILED' && summary.safeErrorCode === 'UNSUPPORTED_ENCODING') && <LiquidityCsvMapping detail={detail} busy={busy} onSave={profile => void perform(async () => { await api.mapping(summary.id, summary.version, profile); await onChanged() })}/>}
    {preview ? <LiquidityCsvApplicationPreview preview={preview} busy={busy} onBack={() => setPreview(null)} onApply={() => void perform(async () => { await api.apply(summary.id, preview, idempotencyKey); setPreview(null); await onChanged() })}/> : <>
      {draft?.accounts.map((account, accountIndex) => {
        const binding = bindings.find(b => b.occurrenceId === account.occurrenceId)
        const selected = eligible.find(a => a.id === binding?.accountId)
        const reconciliation = detail.reconciliations[account.occurrenceId]
        const page = pages[account.occurrenceId] ?? 0
        const visiblePositions = account.positions.slice(page * 100, (page + 1) * 100)
        const controls=statementDraft?.controls.filter(control=>control.accountOccurrenceId===account.occurrenceId)??[]
        const reportedTotal='reportedTotal' in account?account.reportedTotal:controls.find(control=>control.metric==='MARKET_VALUE'&&control.scope.kind==='COMPLETE_ACCOUNT')?.reported
        return <section key={account.occurrenceId} className="space-y-3 rounded-xl border p-4">
          <h4 className="font-semibold">{String(account.displayName.value ?? 'Account')} · {String(account.asOfDate.value ?? 'Date needed')}</h4>
          <p className="text-xs text-slate-600">Source account {String(account.accountMask.value??'not provided')} · {detail.fileKind??'CSV'} · {summary.adapterId??'format pending'}</p>
          {editable && <>
            <LiquidityStatementAccountSelection account={account} eligible={eligible} binding={binding} excluded={excludedAccounts.find(excluded=>excluded.occurrenceId===account.occurrenceId)} onBinding={next=>{patchBinding(account.occurrenceId,next);const selectedAccount=eligible.find(candidate=>candidate.id===next.accountId);if(selectedAccount&&account.currency.value==null)setChanges(changes=>[...changes.filter(change=>change.fieldPath!==`accounts.${accountIndex}.currency`),{fieldPath:`accounts.${accountIndex}.currency`,value:selectedAccount.currency,reason:'Confirmed currency by explicit account binding'}])}} onExcluded={excludeAccount}/>
            <p className="text-xs text-gray-600">Applying confirms this statement contains the complete holdings for the chosen account.</p>
            {account.positions.length === 0 && <label className="block text-sm"><input type="checkbox" checked={binding?.emptyAccountConfirmed ?? false} onChange={e => patchBinding(account.occurrenceId, { emptyAccountConfirmed: e.target.checked, emptyReason: 'Confirmed complete empty account snapshot during review' })}/> I confirm this account is empty; clear its current holdings.</label>}
            {selected?.latestSnapshotId && <label className="block text-sm">Same-date ordering<select className={csvInput} value={binding?.effectiveOrderDecision?.kind ?? 'SOURCE_ORDER'} onChange={e => patchBinding(account.occurrenceId, { effectiveOrderDecision: { kind: e.target.value as 'SOURCE_ORDER' | 'CORRECTION' | 'HISTORICAL_ONLY', ...(e.target.value === 'CORRECTION' ? { replacesSnapshotId: selected.latestSnapshotId! } : {}), reason: 'Explicit account snapshot ordering selected during review' } })}><option value="SOURCE_ORDER">Use the source date and time</option><option value="CORRECTION">Correct the current snapshot</option><option value="HISTORICAL_ONLY">Save in history only</option></select></label>}
          </>}
          <p className="text-sm">{account.positions.length} holdings · {reconciliation?.status.replaceAll('_', ' ').toLowerCase()}</p>
          {reconciliation && <dl className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-slate-600">Statement reported total</dt><dd className="font-semibold tabular-nums">{reviewMoney(reportedTotal?.value)}</dd></div><div><dt className="text-xs text-slate-600">Calculated holdings</dt><dd className="font-semibold tabular-nums">{reviewMoney(reconciliation.totalValue)}</dd></div><div><dt className="text-xs text-slate-600">Difference</dt><dd className="font-semibold tabular-nums">{reconciliation.difference==null?'Not provided':reviewMoney(reconciliation.difference)}</dd></div></dl>}
          {controls.length>0&&<section className="rounded-lg border border-slate-200 p-3 text-sm"><h5 className="font-semibold">Statement controls</h5><dl className="mt-2 grid gap-2 sm:grid-cols-2">{controls.map(control=><div key={control.id}><dt className="text-xs text-slate-600">{control.metric.replaceAll('_',' ')} · {control.scope.kind.replaceAll('_',' ').toLowerCase()}</dt><dd className="font-semibold tabular-nums">{control.reported.availability==='COMPLETE'?reviewMoney(control.reported.value):'Unavailable'} <span className="font-normal text-slate-500">({control.reported.availability.replaceAll('_',' ').toLowerCase()})</span></dd></div>)}</dl></section>}
          <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Record', 'Holding', 'Category', 'Quantity', 'Value', 'Basis', 'Gain/loss'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{visiblePositions.map((position, visibleIndex) => {
            const fieldPath = `accounts.${accountIndex}.positions.${page * 100 + visibleIndex}.assetType`
            const rawCategory = String(position.assetType.value ?? 'other')
            const originalCategory = supportedAssetCategories.has(rawCategory) ? rawCategory : 'other'
            const category = String(changes.find(change => change.fieldPath === fieldPath)?.value ?? originalCategory)
            const holding = String(position.symbol.value ?? position.description.value ?? 'Unidentified')
            return <tr key={position.occurrenceId} className="border-t align-top"><td className="p-2">{position.sourceRecord}</td><td className="p-2 font-medium">{holding}</td><td className="min-w-40 p-2">{editable ? <><label className="sr-only" htmlFor={`category-${position.occurrenceId}`}>Category for {holding}</label><select id={`category-${position.occurrenceId}`} className={csvInput} value={category} onChange={event => setAssetCategory(fieldPath, originalCategory, event.target.value)}>{assetCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{position.assetType.reason === 'KNOWN_EQUITY_SYMBOL' && category === 'equity' && <span className="mt-1 block text-xs text-emerald-700">Detected from Symbol</span>}</> : assetCategories.find(([value]) => value === category)?.[1] ?? 'Other'}</td>{(['quantity', 'marketValue', 'costBasis', 'unrealizedGainLoss'] as const).map(field => <td key={field} className="p-2 tabular-nums" title={csvFieldExplanation(position[field], position)}>{reviewValue(field, position[field].value)}{position[field].origin === 'DERIVED' && <details className="text-xs text-gray-600"><summary>Calculated</summary>{csvFieldExplanation(position[field], position)}</details>}</td>)}</tr>
          })}</tbody></table></div>
          {account.positions.length > 100 && <nav aria-label={`${account.displayName.value ?? 'Account'} review pages`} className="flex justify-between text-sm">
            <button type="button" disabled={page === 0} onClick={()=>setPages(p=>({...p,[account.occurrenceId]:page-1}))}>Previous holdings</button>
            <span>{page*100+1}–{Math.min((page+1)*100,account.positions.length)} of {account.positions.length}</span>
            <button type="button" disabled={(page+1)*100>=account.positions.length} onClick={()=>setPages(p=>({...p,[account.occurrenceId]:page+1}))}>Next holdings</button>
          </nav>}
          {editable && <details><summary className="cursor-pointer text-sm">Correct a field for this account</summary><div className="mt-3 space-y-2">
            <label className="block text-sm">Field<select className={csvInput} value={correctionPath.startsWith(`accounts.${accountIndex}.`) ? correctionPath : ''} onChange={e => setCorrectionPath(e.target.value)}><option value="">Choose a field</option>{['currency', 'asOfDate', 'asOfAt',...(statementDraft?[]:['reportedTotal','reportedBasis','reportedGain'])].map(f => <option key={f} value={`accounts.${accountIndex}.${f}`}>Account: {f}</option>)}{visiblePositions.map((p, pi) => <optgroup key={p.occurrenceId} label={`Record ${p.sourceRecord}: ${p.symbol.value ?? p.description.value}`}>{positionFields.map(f => <option key={f} value={`accounts.${accountIndex}.positions.${page * 100 + pi}.${f}`}>{f}</option>)}</optgroup>)}</select></label>
            <label className="block text-sm">Replacement value (blank means unavailable)<input className={csvInput} value={correctionValue} onChange={e => setCorrectionValue(e.target.value)}/></label>
            <label className="block text-sm">Reason<input className={csvInput} value={reason} onChange={e => setReason(e.target.value)}/></label>
            <button type="button" disabled={!reason.trim() || !correctionPath.startsWith(`accounts.${accountIndex}.`)} onClick={() => { setChanges(c => [...c.filter(x => x.fieldPath !== correctionPath), { fieldPath: correctionPath, value: correctionValue || null, reason }]); setCorrectionPath(''); setReason(''); setCorrectionValue('') }}>Add correction</button>
          </div></details>}
        </section>
      })}
      {changes.length > 0 && <p className="text-sm">{changes.length} pending corrections. Save review to recalculate and check them.</p>}
      {detail.issues.length > 0 && <><LiquidityStatementFindings issues={detail.issues} reconciliations={detail.reconciliations} records={detail.records} onLocate={setEvidenceTarget}/>{editable && <label className="block text-sm"><input type="checkbox" checked={detail.issues.filter(i => i.severity === 'WARNING').every(i => acknowledged.includes(i.id))} onChange={e => setAcknowledged(e.target.checked ? detail.issues.filter(i => i.severity === 'WARNING').map(i => i.id) : [])}/> I have reviewed and acknowledge all warnings in this snapshot.</label>}</>}
      <LiquidityStatementEvidence statementId={summary.id} initialRecords={detail.records} nextCursor={detail.recordsNextCursor} targetOrdinal={evidenceTarget} totalRecords={draft?.recordCounts.total??detail.records.length}/>
      {editable && <div className="flex gap-3"><button className={csvButton} disabled={busy || !draft || !bindings.length || bindings.length+excludedAccounts.length!==draft.accounts.length || bindings.some(binding=>!binding.accountId) || excludedAccounts.some(excluded=>!excluded.reason.trim())} onClick={() => void perform(async () => { await api.review(summary.id, summary.version, changes, currentBindings(),excludedAccounts); setChanges([]); await onChanged() })}>Save review</button>
        <button className={csvButton} disabled={busy || summary.status !== 'READY_TO_APPLY' || changes.length > 0} onClick={() => void perform(async () => setPreview(await api.preview(summary.id, summary.version, currentBindings(),excludedAccounts)))}>Preview changes</button></div>}
    </>}
    {!['APPLIED', 'CANCELLED', 'REJECTED'].includes(summary.status) && <button type="button" className="text-sm text-red-700" disabled={busy} onClick={() => void perform(async () => { if(correctionActive)await api.abandon(summary.id, summary.version);else await api.cancel(summary.id, summary.version); await onChanged() })}>{correctionActive?'Abandon correction and restore applied view':'Cancel this upload'}</button>}
  </section>
}
