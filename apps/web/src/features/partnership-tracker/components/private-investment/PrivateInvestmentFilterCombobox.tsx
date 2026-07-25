import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

export type PrivateInvestmentFilterOption = {
  value: string
  label: string
  count: number
  context?: string
}

export function PrivateInvestmentFilterCombobox({
  id,
  label,
  options,
  values,
  onChange,
}: {
  id: string
  label: string
  options: PrivateInvestmentFilterOption[]
  values: string[]
  onChange: (values: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const selected = useMemo(() => options.filter((option) => values.includes(option.value)), [options, values])
  const visible = options.filter((option) => `${option.label} ${option.context ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[0.68rem] font-bold uppercase tracking-[0.14em] text-gray-600">{label}</label>
      <Combobox
        multiple
        immediate
        value={selected}
        by="value"
        onChange={(next) => onChange(next.map((option) => option.value))}
        onClose={() => setSearch('')}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <ComboboxInput
            id={id}
            autoComplete="off"
            aria-label={`${label} filter`}
            displayValue={() => search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={selected.length ? `${selected.length} selected` : `All ${label.toLowerCase()}`}
            className="h-11 w-full rounded-md border border-gray-300 bg-gray-50 py-2 pl-9 pr-10 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-500 focus:border-jackson-gold focus:bg-white focus:ring-2 focus:ring-jackson-gold/25"
          />
          <ComboboxButton aria-label={`Open ${label} filter`} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-jackson-gold">
            <ChevronDown className="h-4 w-4" />
          </ComboboxButton>
          <ComboboxOptions modal={false} className="absolute z-30 mt-2 max-h-72 w-full min-w-64 overflow-y-auto rounded-md border border-gray-300 bg-white p-1 shadow-xl focus:outline-none">
            {visible.length ? visible.map((option) => (
              <ComboboxOption key={option.value} value={option} className="group flex cursor-default items-start gap-2 rounded px-3 py-2.5 text-sm outline-none data-[focus]:bg-jackson-light">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm border border-gray-400 group-data-[selected]:border-gray-950 group-data-[selected]:bg-gray-950 group-data-[selected]:text-jackson-gold">
                  <Check className="h-3 w-3 opacity-0 group-data-[selected]:opacity-100" />
                </span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900">{option.label}</span>{option.context && <span className="block truncate text-xs text-gray-500">{option.context}</span>}</span>
                <span className="font-mono text-xs text-gray-500">{option.count}</span>
              </ComboboxOption>
            )) : <p className="px-3 py-5 text-center text-sm text-gray-500">No matching options</p>}
          </ComboboxOptions>
        </div>
      </Combobox>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Selected ${label}`}>
          {selected.map((option) => (
            <button key={option.value} type="button" onClick={() => onChange(values.filter((value) => value !== option.value))} aria-label={`Remove ${option.label}`} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 text-[0.68rem] font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">
              <span className="max-w-36 truncate">{option.label}</span><X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
