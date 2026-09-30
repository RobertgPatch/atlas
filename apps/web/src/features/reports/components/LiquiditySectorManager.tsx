import { useMemo, useState } from 'react'
import { CheckIcon, RotateCcwIcon, SearchIcon } from 'lucide-react'
import { SECTOR_FILTER_OPTIONS, type SectorFilterOption } from '../../../../../../packages/types/src/liquidity-sectors'
import { sectorManagementStocks, type SectorManagementStock } from '../utils/sectorManagementStocks'
import { useLiquiditySectors } from '../hooks/useLiquiditySectors'

type View = 'unclassified' | 'all' | 'manual'
const views: Array<{ id: View; label: string }> = [
  { id: 'unclassified', label: 'Unclassified' }, { id: 'all', label: 'All stocks' }, { id: 'manual', label: 'Manual assignments' },
]
export function LiquiditySectorManager({ entityId }: { entityId?: string }) {
  const { assignments, holdings, save } = useLiquiditySectors(entityId)
  const [view, setView] = useState<View>('unclassified')
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, SectorFilterOption>>({})
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const stocks = useMemo(() => sectorManagementStocks(holdings.data ?? [], assignments.data?.items ?? []), [holdings.data, assignments.data])
  const counts = { all: stocks.length, unclassified: stocks.filter((stock) => stock.sector === 'Unclassified').length,
    manual: stocks.filter((stock) => stock.assignment?.sector != null).length }
  const visible = stocks.filter((stock) => (view === 'all' || (view === 'manual' ? stock.assignment?.sector != null : stock.sector === 'Unclassified'))
    && `${stock.symbol} ${stock.description}`.toLowerCase().includes(search.trim().toLowerCase()))

  async function persist(stock: SectorManagementStock, sector: SectorFilterOption | null) {
    setError(''); setNotice('')
    try {
      await save.mutateAsync({ symbol: stock.symbol, sector, expectedVersion: stock.assignment?.version ?? 0 })
      setDrafts((current) => { const next = { ...current }; delete next[stock.symbol]; return next })
      setNotice(sector === null ? `${stock.symbol} reset to automatic classification.` : `${stock.symbol} assigned to ${sector} across all entities and custodians.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this assignment.') }
  }

  if (assignments.isPending || holdings.isPending) return <p role="status" className="p-6 text-sm text-slate-500">Loading stocks and sector assignments…</p>
  if (assignments.isError || holdings.isError) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
    Unable to load sector management. <button type="button" onClick={() => { void assignments.refetch(); void holdings.refetch() }} className="font-semibold underline">Try again</button>
  </div>

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Stock sector assignments">
    <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Stock views">
        {views.map((item) => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)} className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${view === item.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
          {item.label} <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-600">{counts[item.id]}</span>
        </button>)}
      </div>
      <label className="relative block xl:w-80"><span className="sr-only">Search stocks</span><SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400"/>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol or company" className="h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-focus focus:ring-2 focus:ring-focus"/>
      </label>
    </div>
    <div aria-live="polite" className="px-5">
      {notice && <p role="status" className="my-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error} <button type="button" onClick={() => { setDrafts({}); setError(''); void assignments.refetch(); void holdings.refetch() }} className="font-semibold underline">Reload list</button></p>}
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-left text-sm">
        <caption className="sr-only">One row per stock symbol. Assignments apply to all entities and custodians.</caption>
        <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
          <th scope="col" className="px-5 py-3">Stock</th><th scope="col" className="px-5 py-3">Current sector</th><th scope="col" className="px-5 py-3">Assignment</th><th scope="col" className="px-5 py-3">Set sector</th><th scope="col" className="px-5 py-3">Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{visible.map((stock) => {
          const draft = drafts[stock.symbol] ?? stock.sector
          const manual = stock.assignment?.sector != null
          return <tr key={stock.symbol} className="hover:bg-slate-50/60">
            <th scope="row" className="max-w-xs px-5 py-4 font-normal"><span className="block font-semibold text-slate-950">{stock.symbol}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{stock.description}</span></th>
            <td className="px-5 py-4 text-slate-700">{stock.sector}</td>
            <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${manual ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{manual ? 'Manual' : 'Automatic'}</span></td>
            <td className="px-5 py-4"><select aria-label={`Sector for ${stock.symbol}`} value={draft} disabled={save.isPending} onChange={(event) => setDrafts((current) => ({ ...current, [stock.symbol]: event.target.value as SectorFilterOption }))} className="h-11 w-56 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-focus focus:ring-2 focus:ring-focus disabled:opacity-50">
              {SECTOR_FILTER_OPTIONS.map((sector) => <option key={sector}>{sector}</option>)}
            </select></td>
            <td className="px-5 py-4"><div className="flex items-center gap-2">
              <button type="button" aria-label={`Save sector for ${stock.symbol}`} disabled={save.isPending || (manual && draft === stock.sector) || (!manual && drafts[stock.symbol] === undefined)} onClick={() => void persist(stock, draft)} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-3 font-semibold text-white hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-40"><CheckIcon aria-hidden="true" className="h-4 w-4"/>Save</button>
              <button type="button" aria-label={`Reset ${stock.symbol} to automatic`} title={`Reset to automatic: ${stock.automaticSector}`} disabled={save.isPending || !manual} onClick={() => void persist(stock, null)} className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 px-3 font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40"><RotateCcwIcon aria-hidden="true" className="h-4 w-4"/>Reset</button>
            </div></td>
          </tr>
        })}</tbody>
      </table>
    </div>
    {!visible.length && <div className="px-6 py-14 text-center"><h2 className="font-semibold text-slate-800">{search ? 'No matching stocks' : view === 'unclassified' ? 'No unclassified stocks' : view === 'manual' ? 'No manual assignments in this view' : 'No stock holdings yet'}</h2><p className="mt-2 text-sm text-slate-500">{search ? 'Try another symbol or company name.' : 'Change the view or entity to see more stocks.'}</p></div>}
    <p className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500">{visible.length} {visible.length === 1 ? 'stock' : 'stocks'} shown. Funds, ETFs, cash, and other asset classes are not assigned direct-stock sectors here. Reset restores the automatic catalog or statement classification.</p>
  </section>
}
