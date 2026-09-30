import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft,ChevronRight,FileSpreadsheet,Filter,Landmark,Pencil,Trash2,X } from 'lucide-react'
import type { CsvSummary,CustodianSummary } from '../../../../../../packages/types/src/liquidity-statements'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'
import { csvInput } from './LiquidityCsvDialog'

type PendingDelete={kind:'custodian';name:string}|{kind:'statement';item:CsvSummary}|{kind:'statements';items:CsvSummary[]}
const statusTone:Record<string,string>={APPLIED:'bg-emerald-50 text-emerald-800 ring-emerald-200',READY_TO_APPLY:'bg-blue-50 text-blue-800 ring-blue-200',NEEDS_REVIEW:'bg-amber-50 text-amber-800 ring-amber-200',FAILED:'bg-red-50 text-red-800 ring-red-200',REJECTED:'bg-red-50 text-red-800 ring-red-200',CANCELLED:'bg-gray-100 text-gray-700 ring-gray-200'}
const statusLabel=(status:string)=>status.replaceAll('_',' ').toLocaleLowerCase().replace(/^./u,value=>value.toLocaleUpperCase())

export function LiquidityStatementManager({
  entities,entityId,onEntityChange,custodians,selectedStatementId,onSelectStatement,onSelectionCleared,onChanged,
}:{
  entities:Array<{id:string;name:string}>
  entityId:string
  onEntityChange:(id:string)=>void
  custodians:CustodianSummary[]
  selectedStatementId?:string
  onSelectStatement:(item:CsvSummary)=>void
  onSelectionCleared:()=>void
  onChanged:()=>Promise<unknown>
}){
  const [selectedCustodians,setSelectedCustodians]=useState<string[]>([])
  const [cursor,setCursor]=useState<string>()
  const [cursorHistory,setCursorHistory]=useState<Array<string|undefined>>([])
  const [pendingDelete,setPendingDelete]=useState<PendingDelete>()
  const [selectedStatementIds,setSelectedStatementIds]=useState<string[]>([])
  const [pendingRename,setPendingRename]=useState<{original:string;value:string}>()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const statements=useQuery({
    queryKey:['liquidity','managed-statements',entityId,cursor,selectedCustodians],
    enabled:!!entityId,
    queryFn:()=>api.list(entityId,{cursor,limit:10,custodians:selectedCustodians}),
  })
  const selectableStatements=(statements.data?.items??[]).filter(item=>item.status!=='APPLIED')
  const selectedStatements=selectableStatements.filter(item=>selectedStatementIds.includes(item.id))
  const allSelectableStatementsSelected=selectableStatements.length>0&&selectedStatements.length===selectableStatements.length
  const resetPaging=()=>{setCursor(undefined);setCursorHistory([]);setSelectedStatementIds([])}
  const toggleCustodian=(name:string)=>{setSelectedCustodians(current=>current.includes(name)?current.filter(item=>item!==name):[...current,name]);resetPaging()}
  const changeEntity=(id:string)=>{setSelectedCustodians([]);resetPaging();setPendingDelete(undefined);setError('');onEntityChange(id)}
  async function removePending(){
    if(!pendingDelete)return
    setBusy(true);setError('')
    let bulkFailure=''
    try{
      if(pendingDelete.kind==='custodian')await api.archiveCustodian(entityId,pendingDelete.name)
      else if(pendingDelete.kind==='statement')await api.archive(pendingDelete.item.id,pendingDelete.item.version)
      else {
        const results=await Promise.allSettled(pendingDelete.items.map(item=>api.archive(item.id,item.version)))
        const removedIds=pendingDelete.items.filter((_item,index)=>results[index]?.status==='fulfilled').map(item=>item.id)
        const failed=results.length-removedIds.length
        setSelectedStatementIds(current=>current.filter(id=>!removedIds.includes(id)))
        if(failed>0)bulkFailure=`${removedIds.length} statements were deleted. ${failed} could not be deleted; reload and try those entries again.`
      }
      if(pendingDelete.kind==='custodian')setSelectedCustodians(current=>current.filter(name=>name!==pendingDelete.name))
      if(pendingDelete.kind==='statement')setSelectedStatementIds(current=>current.filter(id=>id!==pendingDelete.item.id))
      resetPaging()
      onSelectionCleared()
      setPendingDelete(undefined)
      await onChanged()
      await statements.refetch()
      if(bulkFailure)setError(bulkFailure)
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to delete this entry.')}
    finally{setBusy(false)}
  }
  async function renamePending(){
    if(!pendingRename?.value.trim())return
    setBusy(true);setError('')
    try{
      const renamed=await api.renameCustodian(entityId,pendingRename.original,pendingRename.value.trim())
      setSelectedCustodians(current=>current.map(name=>name===pendingRename.original?renamed.name:name))
      setPendingRename(undefined);resetPaging();await onChanged();await statements.refetch()
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to rename this custodian.')}
    finally{setBusy(false)}
  }
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
      <div className="border-l-4 border-primary px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Statement control room</p>
        <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><h3 className="text-lg font-semibold text-slate-950">Custodians and uploads</h3><p className="max-w-2xl text-sm text-slate-600">Filter the ledger, reopen a review, or remove empty setup records. Applied financial evidence stays protected.</p></div>
          <label className="min-w-64 text-xs font-semibold uppercase tracking-wide text-slate-600">Entity<select className={`${csvInput} mt-1 normal-case tracking-normal`} value={entityId} onChange={event=>changeEntity(event.target.value)}><option value="">Choose an entity</option>{entities.map(entity=><option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
        </div>
      </div>
    </section>

    {error&&<div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={()=>setError('')}><X className="h-4 w-4"/></button></div>}

    {entityId&&<>
      <section aria-labelledby="custodian-directory-title" className="space-y-3">
        <div className="flex items-center justify-between"><div><h3 id="custodian-directory-title" className="font-semibold text-slate-950">Custodian directory</h3><p className="text-sm text-slate-500">{custodians.length} saved {custodians.length===1?'custodian':'custodians'}</p></div></div>
        {custodians.length===0?<p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No custodians have been created for this entity.</p>:<div className="grid gap-3 lg:grid-cols-2">{custodians.map(custodian=><article key={custodian.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-900 text-white"><Landmark className="h-5 w-5"/></span><div className="min-w-0"><h4 className="truncate font-semibold text-slate-950">{custodian.name}</h4><p className="text-xs text-slate-500">{custodian.accountCount} {custodian.accountCount===1?'account':'accounts'} · {custodian.statementCount} {custodian.statementCount===1?'upload':'uploads'}</p></div></div>
            <div className="flex gap-1.5"><button type="button" disabled={busy} title="Rename custodian" aria-label={`Rename ${custodian.name}`} onClick={()=>setPendingRename({original:custodian.name,value:custodian.name})} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-35"><Pencil className="h-4 w-4"/></button><button type="button" disabled={!custodian.deletable||busy} title={custodian.deletable?'Delete empty custodian':'Applied snapshot history is retained'} aria-label={`Delete ${custodian.name}`} onClick={()=>setPendingDelete({kind:'custodian',name:custodian.name})} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="h-4 w-4"/></button></div></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-slate-50 px-2 py-2"><strong className="block text-sm text-slate-900">{custodian.draftCount}</strong><span className="text-[11px] uppercase tracking-wide text-slate-500">Drafts</span></div><div className="rounded-lg bg-slate-50 px-2 py-2"><strong className="block text-sm text-slate-900">{custodian.appliedStatementCount}</strong><span className="text-[11px] uppercase tracking-wide text-slate-500">Applied</span></div><div className="rounded-lg bg-slate-50 px-2 py-2"><strong className="block text-sm text-slate-900">{custodian.snapshotCount}</strong><span className="text-[11px] uppercase tracking-wide text-slate-500">Snapshots</span></div></div>
          <p className={`mt-3 text-xs font-medium ${custodian.deletable?'text-emerald-700':'text-slate-500'}`}>{custodian.deletable?'No financial history · safe to delete':'Financial history retained · deletion locked'}</p>
        </article>)}</div>}
      </section>

      <section aria-labelledby="statement-ledger-title" className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h3 id="statement-ledger-title" className="font-semibold text-slate-950">Statement ledger</h3><p className="text-sm text-slate-500">Ten records per page, newest first.</p></div>
          <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter className="h-4 w-4"/>Custodian filter{selectedCustodians.length?` · ${selectedCustodians.length}`:''}</summary><div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Show custodians</span>{selectedCustodians.length>0&&<button type="button" onClick={()=>{setSelectedCustodians([]);resetPaging()}} className="text-xs font-semibold text-primary hover:underline">Clear</button>}</div><div className="max-h-56 space-y-1 overflow-auto">{custodians.map(custodian=><label key={custodian.name} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedCustodians.includes(custodian.name)} onChange={()=>toggleCustodian(custodian.name)} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"/><span className="min-w-0 flex-1 truncate">{custodian.name}</span><span className="text-xs tabular-nums text-slate-400">{custodian.statementCount}</span></label>)}</div></div></details>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {selectedStatements.length>0&&<div className="flex flex-col gap-3 border-b border-red-100 bg-red-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p role="status" className="text-sm font-semibold text-red-900">{selectedStatements.length} {selectedStatements.length===1?'statement':'statements'} selected</p><div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>setSelectedStatementIds([])} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Clear selection</button><button type="button" disabled={busy} onClick={()=>setPendingDelete({kind:'statements',items:selectedStatements})} className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5"/>Delete selected</button></div></div>}
          {statements.isLoading?<p role="status" className="p-6 text-sm text-slate-500">Loading statement ledger…</p>:statements.isError?<p role="alert" className="p-6 text-sm text-red-700">Unable to load statement uploads.</p>:!statements.data?.items.length?<p className="p-6 text-sm text-slate-500">No uploads match the selected custodians.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select all deletable statements on this page" checked={allSelectableStatementsSelected} disabled={!selectableStatements.length||busy} onChange={()=>setSelectedStatementIds(allSelectableStatementsSelected?[]:selectableStatements.map(item=>item.id))} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-40"/></th><th className="px-4 py-3 font-semibold">Custodian</th><th className="px-4 py-3 font-semibold">Format</th><th className="px-4 py-3 font-semibold">Uploaded</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{statements.data.items.map(item=>{const canDelete=item.status!=='APPLIED',selected=selectedStatementIds.includes(item.id);return <tr key={item.id} className={selected?'bg-red-50/60':selectedStatementId===item.id?'bg-emerald-50/60':'hover:bg-slate-50/80'}><td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${item.custodian} statement from ${new Date(item.uploadedAt).toLocaleDateString()}`} checked={selected} disabled={!canDelete||busy} title={canDelete?'Select statement':'Applied statements are retained'} onChange={()=>setSelectedStatementIds(current=>selected?current.filter(id=>id!==item.id):[...current,item.id])} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-35"/></td><td className="px-4 py-3 font-medium text-slate-900">{item.custodian}</td><td className="px-4 py-3 text-slate-600"><span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4"/>{item.adapterId??'Pending detection'}</span></td><td className="px-4 py-3 tabular-nums text-slate-600">{new Date(item.uploadedAt).toLocaleString()}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone[item.status]??'bg-slate-50 text-slate-700 ring-slate-200'}`}>{statusLabel(item.status)}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={()=>onSelectStatement(item)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:border-primary hover:text-primary">Open</button><button type="button" disabled={!canDelete||busy} title={canDelete?'Delete statement entry':'Applied statements are retained'} aria-label={`Delete ${item.custodian} statement from ${new Date(item.uploadedAt).toLocaleDateString()}`} onClick={()=>setPendingDelete({kind:'statement',item})} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="h-4 w-4"/></button></div></td></tr>})}</tbody></table></div>}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3"><span className="text-xs text-slate-500">{selectedCustodians.length?`Filtered to ${selectedCustodians.length} custodians`:'All custodians'}</span><div className="flex gap-2"><button type="button" disabled={!cursorHistory.length} onClick={()=>{const history=[...cursorHistory];setCursor(history.pop());setCursorHistory(history);setSelectedStatementIds([])}} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5"/>Previous</button><button type="button" disabled={!statements.data?.nextCursor} onClick={()=>{setCursorHistory(current=>[...current,cursor]);setCursor(statements.data?.nextCursor??undefined);setSelectedStatementIds([])}} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5"/></button></div></div>
        </div>
      </section>
    </>}

    {pendingDelete&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px]" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setPendingDelete(undefined)}} onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();setPendingDelete(undefined)}}}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-entry-title" aria-describedby="delete-entry-description" className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 shadow-2xl">
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-700"><Trash2 className="h-5 w-5"/></span>
        <h3 id="delete-entry-title" className="text-lg font-semibold text-slate-950">Delete {pendingDelete.kind==='custodian'?'custodian':pendingDelete.kind==='statements'?`${pendingDelete.items.length} statement entries`:'statement entry'}?</h3>
        <p id="delete-entry-description" className="mt-2 text-sm leading-6 text-slate-600">{pendingDelete.kind==='custodian'?`This removes ${pendingDelete.name} and its empty accounts and drafts from active views.`:pendingDelete.kind==='statements'?`This removes ${pendingDelete.items.length} selected non-applied uploads from active views.`:'This removes the non-applied upload from active views.'} Audit evidence is retained and no applied holdings will be changed.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus disabled={busy} onClick={()=>setPendingDelete(undefined)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Keep {pendingDelete.kind==='statements'?'statements':'entry'}</button><button type="button" disabled={busy} onClick={()=>void removePending()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{busy?'Deleting…':pendingDelete.kind==='statements'?'Delete selected':'Delete'}</button></div>
      </div>
    </div>}
    {pendingRename&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px]" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setPendingRename(undefined)}} onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();setPendingRename(undefined)}}}>
      <form role="dialog" aria-modal="true" aria-labelledby="rename-custodian-title" onSubmit={event=>{event.preventDefault();void renamePending()}} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary"><Pencil className="h-5 w-5"/></span><h3 id="rename-custodian-title" className="text-lg font-semibold text-slate-950">Rename custodian</h3><p className="mt-2 text-sm text-slate-600">This updates the display name across active accounts and statement records without changing financial history.</p>
        <label className="mt-5 block text-sm font-medium text-slate-700">Custodian name<input autoFocus required maxLength={120} className={`${csvInput} mt-1`} value={pendingRename.value} onChange={event=>setPendingRename(current=>current?{...current,value:event.target.value}:current)}/></label>
        <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setPendingRename(undefined)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" disabled={busy||!pendingRename.value.trim()||pendingRename.value.trim()===pendingRename.original} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?'Saving…':'Save name'}</button></div>
      </form>
    </div>}
  </div>
}
