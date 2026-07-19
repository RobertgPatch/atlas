import { Building2, Plus, Search } from 'lucide-react'
import type { PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'

export function PartnershipPicker({ items, selectedId, search, loading, error, canEdit, onSearch, onSelect, onAdd }: {
  items: PartnershipTrackerSummary[]; selectedId?: string; search: string; loading: boolean; error?: string; canEdit: boolean
  onSearch: (value: string) => void; onSelect: (id: string) => void; onAdd: () => void
}) {
  return <aside className="rounded-xl border border-gray-200 bg-white shadow-sm" aria-label="Partnership directory">
    <div className="border-b border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-gray-950">Partnerships</h2>{canEdit && <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-md bg-jackson-gold px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-jackson-hover"><Plus className="h-3.5 w-3.5" />Add</button>}</div>
      <label className="relative mt-3 block"><span className="sr-only">Search partnerships</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search partnerships or entities" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-jackson-gold focus:outline-none focus:ring-2 focus:ring-jackson-gold/20" /></label>
    </div>
    <div className="max-h-[38rem] overflow-y-auto p-2">
      {loading ? <p className="p-4 text-sm text-gray-500">Loading partnerships…</p> : error ? <p role="alert" className="m-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : items.length === 0 ? <div className="p-6 text-center"><Building2 className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-2 text-sm font-medium text-gray-800">{search ? 'No matching partnerships' : 'No partnerships yet'}</p><p className="mt-1 text-xs text-gray-500">{search ? 'Try a different search.' : canEdit ? 'Add one to begin tracking K-1 history.' : 'No partnerships are available in your entity scope.'}</p></div> : <ul className="space-y-1">{items.map((item) => {
        const partnership = item.partnership
        const active = partnership.id === selectedId
        return <li key={partnership.id}><button type="button" onClick={() => onSelect(partnership.id)} className={`w-full rounded-lg border px-3 py-3 text-left transition ${active ? 'border-jackson-gold bg-amber-50 ring-1 ring-jackson-gold/30' : 'border-transparent hover:bg-gray-50'}`} aria-current={active ? 'true' : undefined}><span className="block truncate text-sm font-semibold text-gray-950">{partnership.name}</span><span className="mt-0.5 block truncate text-xs text-gray-500">{partnership.entity.name} · {partnership.partnershipType}</span><span className="mt-2 flex items-center justify-between text-xs text-gray-500"><span>{item.latestTaxYear ?? 'No K-1 years'}</span><span>{item.latestWorkflowStatus?.replaceAll('_', ' ') ?? partnership.status}</span></span></button></li>
      })}</ul>}
    </div>
  </aside>
}
