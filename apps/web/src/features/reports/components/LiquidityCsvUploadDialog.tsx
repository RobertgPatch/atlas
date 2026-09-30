import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { entitiesClient } from '../../partnerships/api/entitiesClient'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'
import { useLiquidityStatements } from '../hooks/useLiquidityStatements'
import { LiquidityCsvDialog, csvButton, csvInput } from './LiquidityCsvDialog'
import { LiquiditySourceAccountManager } from './LiquiditySourceAccountManager'
import { LiquidityCsvReview } from './LiquidityCsvReview'
import { LiquidityStatementManager } from './LiquidityStatementManager'

export function LiquidityStatementWorkspace({ initialEntityId = '' }: { initialEntityId?: string }) {
  const [activeTab,setActiveTab]=useState<'upload'|'manage'>('upload')
  const [entityId, setEntityId] = useState(initialEntityId)
  const [custodian, setCustodian] = useState('')
  const [newCustodian, setNewCustodian] = useState('')
  const [addingCustodian, setAddingCustodian] = useState(false)
  const [statementId, setStatementId] = useState<string>()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const entities = useQuery({ queryKey: ['entities', 'liquidity-upload'], queryFn: () => entitiesClient.list() })
  const data = useLiquidityStatements(entityId || undefined, statementId)
  const existingCustodians = useMemo(() => {
    const names = data.custodians.data?.items.map(item=>item.name)??[]
    const unique = new Map<string,string>()
    for (const name of names) {
      const key = name.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ')
      if (!unique.has(key)) unique.set(key,name.trim().replace(/\s+/gu,' '))
    }
    return [...unique.values()].sort((left,right)=>left.localeCompare(right))
  },[data.custodians.data?.items])
  const selectedCustodian = addingCustodian ? newCustodian.trim().replace(/\s+/gu,' ') : custodian
  return <div className="space-y-6">
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end"><p className="text-sm text-gray-600">Upload new snapshots or manage the custodians and statement history already in Liquidity.</p><div role="tablist" aria-label="Statement workspace" className="inline-flex self-start rounded-xl bg-slate-100 p-1"><button type="button" role="tab" aria-selected={activeTab==='upload'} onClick={()=>setActiveTab('upload')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab==='upload'?'bg-white text-slate-950 shadow-sm':'text-slate-500 hover:text-slate-900'}`}>Upload</button><button type="button" role="tab" aria-selected={activeTab==='manage'} onClick={()=>setActiveTab('manage')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab==='manage'?'bg-white text-slate-950 shadow-sm':'text-slate-500 hover:text-slate-900'}`}>Manage</button></div></div>
      {entities.isError && <p role="alert">Unable to load entities. Reload this page and try again.</p>}
      {activeTab==='upload'&&<div className="space-y-6"><form className="space-y-3" onSubmit={event => {
        event.preventDefault(); if (!file || !entityId || !selectedCustodian) return
        setBusy(true); setError('')
        void api.upload(file, entityId, selectedCustodian, setProgress).then(async id => { setCustodian(selectedCustodian); setAddingCustodian(false); setNewCustodian(''); setStatementId(id); await data.invalidate() }).catch(e => setError(e instanceof Error ? e.message : 'Upload failed.')).finally(() => { setBusy(false); setProgress('') })
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Entity<select required className={csvInput} value={entityId} disabled={busy} onChange={e => { setEntityId(e.target.value); setCustodian(''); setNewCustodian(''); setAddingCustodian(false); setStatementId(undefined) }}><option value="">Choose an entity</option>{entities.data?.items.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label className="text-sm">Custodian<select required className={csvInput} value={addingCustodian?'__new__':custodian} disabled={busy||!entityId} onChange={e=>{if(e.target.value==='__new__'){setAddingCustodian(true);setCustodian('')}else{setAddingCustodian(false);setNewCustodian('');setCustodian(e.target.value)}}}><option value="">Choose a custodian</option>{existingCustodians.map(name=><option key={name} value={name}>{name}</option>)}<option value="__new__">+ Add new custodian</option></select></label>
        </div>
        {addingCustodian && <div className="text-sm"><label htmlFor="new-liquidity-custodian">New custodian name</label><input id="new-liquidity-custodian" aria-describedby="new-liquidity-custodian-help" autoFocus required className={csvInput} maxLength={120} value={newCustodian} disabled={busy} onChange={e=>setNewCustodian(e.target.value)}/><span id="new-liquidity-custodian-help" className="mt-1 block text-xs text-gray-500">Use the custodian's standard display name. Case, spacing and punctuation variants of an existing name are reused automatically.</span></div>}
        <label className="block text-sm">Complete holdings statement (CSV or XLSX, up to 10 MiB)<input className={csvInput} required type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
        <button className={csvButton} disabled={busy || !entityId || !selectedCustodian || !file}>{busy ? progress || 'Uploading…' : 'Upload statement'}</button>
        {progress && <p role="status" className="text-sm">{progress}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </form>
      {entityId && <LiquiditySourceAccountManager accounts={data.accounts.data?.items ?? []} entityId={entityId} custodian={selectedCustodian} onChanged={data.invalidate}/>}</div>}
      {data.detail.isLoading && <p role="status">Loading draft…</p>}
      {activeTab==='manage'&&<LiquidityStatementManager entities={entities.data?.items??[]} entityId={entityId} onEntityChange={id=>{setEntityId(id);setStatementId(undefined);setCustodian('');setNewCustodian('');setAddingCustodian(false)}} custodians={data.custodians.data?.items??[]} selectedStatementId={statementId} onSelectStatement={item=>{setStatementId(item.id);setEntityId(item.entityId);setCustodian(item.custodian);setAddingCustodian(false);setNewCustodian('')}} onSelectionCleared={()=>setStatementId(undefined)} onChanged={data.invalidate}/>}
      {data.detail.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700"><span>Unable to load this draft.</span><button type="button" className="rounded-lg border border-red-200 px-3 py-1.5 font-semibold hover:bg-red-50" onClick={() => void data.detail.refetch()}>Retry loading draft</button></div>}
      {data.detail.data && <LiquidityCsvReview key={`${data.detail.data.summary.id}:${data.detail.data.summary.version}`} detail={data.detail.data} accounts={data.accounts.data?.items ?? []} onChanged={data.invalidate}/>}
    </div>
  </div>
}

export function LiquidityCsvUploadDialog({ onClose }: { onClose: () => void }) {
  return <LiquidityCsvDialog title="Statement workspace" onClose={onClose}>
    <LiquidityStatementWorkspace />
  </LiquidityCsvDialog>
}
