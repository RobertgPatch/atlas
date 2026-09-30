import type { AccountBinding,CsvAccount,ExcludedAccountDecision,SourceAccount,StatementAccount } from '../../../../../../packages/types/src/liquidity-statements'
import { csvInput } from './LiquidityCsvDialog'

export function LiquidityStatementAccountSelection({account,eligible,binding,excluded,onBinding,onExcluded}:{
  account:CsvAccount|StatementAccount
  eligible:SourceAccount[]
  binding?:AccountBinding
  excluded?:ExcludedAccountDecision
  onBinding:(binding:AccountBinding)=>void
  onExcluded:(decision:ExcludedAccountDecision)=>void
}){
  const selected=!excluded
  const select=()=>onBinding(binding??{occurrenceId:account.occurrenceId,accountId:'',expectedAccountVersion:1,completeAccount:true,emptyAccountConfirmed:false})
  const sourceSections='sourceSections' in account?account.sourceSections:[]
  return <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">Account snapshot decision</legend>
    <p className="text-xs text-slate-600">Source account {String(account.accountMask.value??'not provided')} · {sourceSections.join(', ')||'source section unavailable'} · {'completeness'in account?account.completeness.replaceAll('_',' ').toLowerCase():'legacy complete snapshot'}</p>
    <p className="text-xs text-slate-600">Identity quality: {'identifierQuality'in account?(account.identifierQuality==='FULL_RELIABLE'?'full reliable':`${account.identifierQuality.replaceAll('_',' ').toLowerCase()} · manual confirmation required`):account.identifierFingerprints.length?'reliable full identifier':'manual confirmation required'}</p>
    <label className="mr-4 text-sm"><input type="radio" name={`decision-${account.occurrenceId}`} checked={selected} onChange={select}/> Apply this complete account snapshot</label>
    <label className="text-sm"><input type="radio" name={`decision-${account.occurrenceId}`} checked={!!excluded} onChange={()=>onExcluded({occurrenceId:account.occurrenceId,reason:'Excluded from this application after explicit review'})}/> Exclude this account from this application</label>
    {selected?<label className="block text-sm">Replace holdings in account<select className={csvInput} required value={binding?.accountId??''} onChange={event=>{const target=eligible.find(candidate=>candidate.id===event.target.value);if(target)onBinding({...(binding??{occurrenceId:account.occurrenceId,completeAccount:true,emptyAccountConfirmed:false}),accountId:target.id,expectedAccountVersion:target.version})}}><option value="">Choose an account</option>{eligible.map(target=><option key={target.id} value={target.id}>{target.name}{target.accountMask?` …${target.accountMask}`:''} ({target.currency})</option>)}</select></label>
      :<label className="block text-sm">Exclusion reason<input className={csvInput} value={excluded?.reason??''} onChange={event=>onExcluded({occurrenceId:account.occurrenceId,reason:event.target.value})}/></label>}
  </fieldset>
}
