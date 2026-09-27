import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { entitiesClient } from '../../partnerships/api/entitiesClient'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'
import { useLiquidityStatements } from '../hooks/useLiquidityStatements'
import { LiquidityCsvDialog, csvButton, csvInput } from './LiquidityCsvDialog'
import { LiquiditySourceAccountManager } from './LiquiditySourceAccountManager'
import { LiquidityCsvReview } from './LiquidityCsvReview'

export function LiquidityCsvUploadDialog({ onClose }: { onClose: () => void }) {
  const [entityId, setEntityId] = useState('')
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
    const names = [
      ...(data.accounts.data?.items.filter(account => account.entityId === entityId).map(account => account.custodian) ?? []),
      ...(data.imports.data?.items.filter(item => item.entityId === entityId).map(item => item.custodian) ?? []),
    ]
    const unique = new Map<string,string>()
    for (const name of names) {
      const key = name.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ')
      if (!unique.has(key)) unique.set(key,name.trim().replace(/\s+/gu,' '))
    }
    return [...unique.values()].sort((left,right)=>left.localeCompare(right))
  },[data.accounts.data?.items,data.imports.data?.items,entityId])
  const selectedCustodian = addingCustodian ? newCustodian.trim().replace(/\s+/gu,' ') : custodian
  return <LiquidityCsvDialog title="Upload and manage holdings" onClose={onClose}>
    <div className="space-y-6">
      <p className="text-sm text-gray-600">Upload a complete account CSV whenever new holdings are available. Review and apply the snapshot to update Liquidity.</p>
      {entities.isError && <p role="alert">Unable to load entities. Close this window and try again.</p>}
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault(); if (!file || !entityId || !selectedCustodian) return
        setBusy(true); setError('')
        void api.upload(file, entityId, selectedCustodian, setProgress).then(async id => { setCustodian(selectedCustodian); setAddingCustodian(false); setNewCustodian(''); setStatementId(id); await data.invalidate() }).catch(e => setError(e instanceof Error ? e.message : 'Upload failed.')).finally(() => { setBusy(false); setProgress('') })
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Entity<select required className={csvInput} value={entityId} disabled={busy} onChange={e => { setEntityId(e.target.value); setCustodian(''); setNewCustodian(''); setAddingCustodian(false); setStatementId(undefined) }}><option value="">Choose an entity</option>{entities.data?.items.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label className="text-sm">Custodian<select required className={csvInput} value={addingCustodian?'__new__':custodian} disabled={busy||!entityId} onChange={e=>{if(e.target.value==='__new__'){setAddingCustodian(true);setCustodian('')}else{setAddingCustodian(false);setNewCustodian('');setCustodian(e.target.value)}}}><option value="">Choose a custodian</option>{existingCustodians.map(name=><option key={name} value={name}>{name}</option>)}<option value="__new__">+ Add new custodian</option></select></label>
        </div>
        {addingCustodian && <div className="text-sm"><label htmlFor="new-liquidity-custodian">New custodian name</label><input id="new-liquidity-custodian" aria-describedby="new-liquidity-custodian-help" autoFocus required className={csvInput} maxLength={120} value={newCustodian} disabled={busy} onChange={e=>setNewCustodian(e.target.value)}/><span id="new-liquidity-custodian-help" className="mt-1 block text-xs text-gray-500">Use the custodian's standard display name. Case, spacing and punctuation variants of an existing name are reused automatically.</span></div>}
        <label className="block text-sm">Complete holdings CSV (up to 10 MiB)<input className={csvInput} required type="file" accept=".csv,text/csv" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
        <button className={csvButton} disabled={busy || !entityId || !selectedCustodian || !file}>{busy ? progress || 'Uploading…' : 'Upload CSV'}</button>
        {progress && <p role="status" className="text-sm">{progress}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </form>
      {entityId && <LiquiditySourceAccountManager accounts={data.accounts.data?.items ?? []} entityId={entityId} custodian={selectedCustodian} onChanged={data.invalidate}/>}
      <section className="space-y-2"><h3 className="font-semibold">Recent uploads and drafts</h3>
        {data.imports.isError && <p role="alert">Unable to load uploads.</p>}
        {data.imports.data?.items.map(item => <button type="button" key={item.id} className="block w-full rounded-lg border p-3 text-left text-sm hover:bg-gray-50" onClick={() => { setStatementId(item.id); setEntityId(item.entityId); setAddingCustodian(false); setNewCustodian(''); setCustodian(item.custodian) }}>{item.custodian} · {new Date(item.uploadedAt).toLocaleString()} · {item.status.replaceAll('_', ' ').toLowerCase()}</button>)}
      </section>
      {data.detail.isLoading && <p role="status">Loading draft…</p>}
      {data.detail.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700"><span>Unable to load this draft.</span><button type="button" className="rounded-lg border border-red-200 px-3 py-1.5 font-semibold hover:bg-red-50" onClick={() => void data.detail.refetch()}>Retry loading draft</button></div>}
      {data.detail.data && <LiquidityCsvReview key={`${data.detail.data.summary.id}:${data.detail.data.summary.version}`} detail={data.detail.data} accounts={data.accounts.data?.items ?? []} onChanged={data.invalidate}/>}
    </div>
  </LiquidityCsvDialog>
}
