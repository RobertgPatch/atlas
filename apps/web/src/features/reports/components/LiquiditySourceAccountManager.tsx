import { Check, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import type { SourceAccount } from '../../../../../../packages/types/src/liquidity-statements'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'
import { csvInput,csvButton } from './LiquidityCsvDialog'

export function LiquiditySourceAccountManager({accounts,entityId,custodian,onChanged}:{accounts:SourceAccount[];entityId:string;custodian:string;onChanged:()=>Promise<unknown>}){
  const [name,setName]=useState(''),[mask,setMask]=useState(''),[currency,setCurrency]=useState('USD'),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [editingAccountId,setEditingAccountId]=useState<string>(),[editingName,setEditingName]=useState(''),[editingMask,setEditingMask]=useState('')
  async function perform(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();await onChanged()}catch(e){setError(e instanceof Error?e.message:'Unable to update account.')}finally{setBusy(false)}}
  const visibleAccounts=accounts.filter(account=>account.entityId===entityId&&(!custodian||account.custodian===custodian))
  const stopEditing=()=>{setEditingAccountId(undefined);setEditingName('');setEditingMask('')}

  return <section className="space-y-3 rounded-xl border border-gray-200 p-4"><h3 className="font-semibold text-gray-900">Accounts</h3>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {visibleAccounts.map(account=><div key={account.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-gray-100 py-2 lg:grid-cols-[minmax(0,1fr)_9.5rem_23.5rem]">
      {editingAccountId===account.id?<form className="flex min-w-72 flex-1 flex-wrap items-center gap-2" onSubmit={event=>{event.preventDefault();const updatedName=editingName.trim(),updatedMask=editingMask.trim();if(!updatedName||updatedMask&&!/^[A-Za-z0-9]{1,4}$/u.test(updatedMask))return;void perform(async()=>{await api.updateAccount(account.id,{expectedVersion:account.version,name:updatedName,accountMask:updatedMask||null});stopEditing()})}}>
        <label className="sr-only" htmlFor={`account-name-${account.id}`}>Account name</label>
        <input id={`account-name-${account.id}`} autoFocus required maxLength={120} className={`${csvInput} h-10 min-w-56 flex-1`} value={editingName} disabled={busy} onChange={event=>setEditingName(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();stopEditing()}}}/>
        <label className="inline-flex h-10 items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-600" htmlFor={`account-mask-${account.id}`}>Last four<input id={`account-mask-${account.id}`} aria-label="Last four characters" maxLength={4} pattern="[A-Za-z0-9]{1,4}" className={`${csvInput} h-10 w-28`} value={editingMask} disabled={busy} onChange={event=>setEditingMask(event.target.value)}/></label>
        <button type="submit" aria-label="Save account details" disabled={busy||!editingName.trim()||!!editingMask&&!/^[A-Za-z0-9]{1,4}$/u.test(editingMask.trim())} className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"><Check className="h-3.5 w-3.5"/>Save</button>
        <button type="button" aria-label="Cancel editing account details" disabled={busy} onClick={stopEditing} className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><X className="h-3.5 w-3.5"/>Cancel</button>
      </form>:<div className="flex min-w-0 flex-1 items-center gap-2 text-sm"><span className="truncate">{account.custodian} · {account.name}{account.accountMask?` …${account.accountMask}`:''}</span><button type="button" aria-label={`Edit account details for ${account.name}`} title="Edit account details" disabled={busy} onClick={()=>{setEditingAccountId(account.id);setEditingName(account.name);setEditingMask(account.accountMask??'')}} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-400 transition hover:border-slate-200 hover:bg-slate-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40"><Pencil className="h-3.5 w-3.5"/></button></div>}
      <select aria-label={`Upload cadence for ${account.name}`} value={account.cadence} disabled={busy} onChange={event=>void perform(()=>api.updateAccount(account.id,{expectedVersion:account.version,cadence:event.target.value as SourceAccount['cadence']}))} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 lg:col-start-2"><option value="ON_DEMAND">On demand</option><option value="EVERY_14_DAYS">Every 14 days</option><option value="CALENDAR_MONTHLY">Monthly</option></select>
      <span className="min-w-0 truncate text-xs text-gray-500 lg:col-start-3" title={`${account.activeSource==='STATEMENT'?'Statement':'CSV'} holdings as of ${account.holdingsAsOfDate??'no upload'}${account.uploadedAt?` · Uploaded ${new Date(account.uploadedAt).toLocaleDateString()}`:''}${account.nextExpectedDate?` · Next expected ${account.nextExpectedDate}`:''}`}>{account.activeSource==='STATEMENT'?'Statement':'CSV'} holdings as of {account.holdingsAsOfDate??'no upload'}{account.uploadedAt?` · Uploaded ${new Date(account.uploadedAt).toLocaleDateString()}`:''}{account.nextExpectedDate?` · Next expected ${account.nextExpectedDate}`:''}</span>
    </div>)}
    <form onSubmit={event=>{event.preventDefault();void perform(async()=>{await api.createAccount({entityId,custodian,name,currency,cadence:'ON_DEMAND',...(mask?{accountMask:mask}:{})});setName('');setMask('')})}} className="grid gap-3 sm:grid-cols-4">
      <label className="text-sm">Account name<input required maxLength={120} className={`${csvInput} h-10`} value={name} onChange={event=>setName(event.target.value)}/></label>
      <label className="text-sm">Last four characters<input maxLength={4} pattern="[A-Za-z0-9]{1,4}" className={`${csvInput} h-10`} value={mask} onChange={event=>setMask(event.target.value)}/></label>
      <label className="text-sm">Account currency<input required maxLength={3} pattern="[A-Z]{3}" className={`${csvInput} h-10`} value={currency} onChange={event=>setCurrency(event.target.value.toUpperCase())}/></label>
      <button className={`${csvButton} h-10 self-end`} disabled={busy||!entityId||!custodian}>Add account</button>
    </form>
  </section>
}
