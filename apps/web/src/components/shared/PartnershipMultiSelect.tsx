import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

export function PartnershipMultiSelect({ options, selectedIds, onChange, disabled = false }: {
  options: Array<{ id: string; name: string; owner: string }>
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [search, setSearch] = useState('')
  const label = selectedIds.length ? `${selectedIds.length} partnership${selectedIds.length === 1 ? '' : 's'} selected` : 'All partnerships'
  return <Popover className="relative min-w-64">
    <PopoverButton disabled={disabled} aria-label={`Partnership filter: ${label}`} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50">
      {label}<ChevronDown className="h-4 w-4" />
    </PopoverButton>
    <PopoverPanel className="absolute left-0 z-30 mt-1 w-80 max-w-[85vw] rounded-lg border border-slate-300 bg-white p-2 shadow-lg">
      <input aria-label="Search partnerships" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fund or owner" className="mb-2 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-focus" />
      <button type="button" onClick={() => onChange([])} className="min-h-10 w-full rounded px-3 text-left text-sm font-semibold hover:bg-slate-50">All partnerships</button>
      <div className="max-h-64 overflow-y-auto border-t border-slate-200">
        {options.filter((option) => `${option.name} ${option.owner}`.toLowerCase().includes(search.toLowerCase())).map((option) => <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-3 py-2 hover:bg-slate-50">
          <input type="checkbox" checked={selectedIds.includes(option.id)} onChange={() => onChange(selectedIds.includes(option.id) ? selectedIds.filter((id) => id !== option.id) : [...selectedIds, option.id].sort())} className="h-4 w-4 accent-primary" />
          <span className="min-w-0 text-sm"><span className="block font-medium">{option.name}</span><span className="block text-xs text-slate-500">{option.owner}</span></span>
        </label>)}
      </div>
    </PopoverPanel>
  </Popover>
}
