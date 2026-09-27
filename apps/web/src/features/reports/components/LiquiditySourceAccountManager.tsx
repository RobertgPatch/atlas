import { useState } from 'react'
import type { SourceAccount } from '../../../../../../packages/types/src/liquidity-statements'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'
import { csvInput,csvButton } from './LiquidityCsvDialog'
export function LiquiditySourceAccountManager({accounts,entityId,custodian,onChanged}:{accounts:SourceAccount[];entityId:string;custodian:string;onChanged:()=>Promise<unknown>}){
  const [name,setName]=useState(''),[mask,setMask]=useState(''),[currency,setCurrency]=useState('USD'),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function perform(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();await onChanged()}catch(e){setError(e instanceof Error?e.message:'Unable to update account.')}finally{setBusy(false)}}
  return <section className="space-y-3 rounded-xl border border-gray-200 p-4"><h3 className="font-semibold text-gray-900">Accounts</h3>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {accounts.filter(a=>a.entityId===entityId&&(!custodian||a.custodian===custodian)).map(a=><div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 pb-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.included} disabled={busy} onChange={()=>void perform(()=>api.updateAccount(a.id,{expectedVersion:a.version,included:!a.included}))}/>{a.custodian} · {a.name}{a.accountMask?` …${a.accountMask}`:''}</label>
      <select aria-label={`Upload cadence for ${a.name}`} value={a.cadence} disabled={busy} onChange={e=>void perform(()=>api.updateAccount(a.id,{expectedVersion:a.version,cadence:e.target.value as SourceAccount['cadence']}))} className="rounded border p-1 text-sm"><option value="ON_DEMAND">On demand</option><option value="EVERY_14_DAYS">Every 14 days</option><option value="CALENDAR_MONTHLY">Monthly</option></select>
      <span className="text-xs text-gray-500">Holdings as of {a.holdingsAsOfDate??'no upload'}{a.uploadedAt?` ? Uploaded ${new Date(a.uploadedAt).toLocaleDateString()}`:''}{a.nextExpectedDate?` · Next expected ${a.nextExpectedDate}`:''}</span>
    </div>)}
    <form onSubmit={e=>{e.preventDefault();void perform(async()=>{await api.createAccount({entityId,custodian,name,currency,cadence:'ON_DEMAND',...(mask?{accountMask:mask}:{})});setName('');setMask('')})}} className="grid gap-3 sm:grid-cols-4">
      <label className="text-sm">Account name<input required maxLength={120} className={csvInput} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="text-sm">Last four characters<input maxLength={4} pattern="[A-Za-z0-9]{1,4}" className={csvInput} value={mask} onChange={e=>setMask(e.target.value)}/></label>
      <label className="text-sm">Account currency<input required maxLength={3} pattern="[A-Z]{3}" className={csvInput} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
      <button className={`${csvButton} self-end`} disabled={busy||!entityId||!custodian}>Add account</button>
    </form>
  </section>
}
