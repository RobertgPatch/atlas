import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { Check, ChevronDown, Minus, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PrivateInvestmentPartnershipFacetOption } from '../../../../../../../packages/types/src/partnership-tracker'

type FundGroup = {
  key: string
  label: string
  options: PrivateInvestmentPartnershipFacetOption[]
}

const normalizeFundName = (name: string) => name.trim().toLocaleLowerCase()

function groupFundOptions(options: PrivateInvestmentPartnershipFacetOption[]): FundGroup[] {
  const groups = new Map<string, FundGroup>()

  for (const option of options) {
    const key = normalizeFundName(option.label)
    const existing = groups.get(key)
    if (existing) existing.options.push(option)
    else groups.set(key, { key, label: option.label, options: [option] })
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      options: [...group.options].sort((left, right) => (
        left.entityName.localeCompare(right.entityName) || left.value.localeCompare(right.value)
      )),
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

function SelectionMark({ checked, partial = false }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm border ${
        checked || partial
          ? 'border-gray-950 bg-gray-950 text-jackson-gold'
          : 'border-gray-400 bg-white text-transparent'
      }`}
    >
      {partial ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
    </span>
  )
}

export function PrivateInvestmentFundFilter({
  id,
  options,
  values,
  onChange,
}: {
  id: string
  options: PrivateInvestmentPartnershipFacetOption[]
  values: string[]
  onChange: (values: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const groups = useMemo(() => groupFundOptions(options), [options])
  const selectedIds = useMemo(() => new Set(values), [values])
  const normalizedSearch = search.trim().toLocaleLowerCase()

  const visibleGroups = useMemo(() => groups.flatMap((group) => {
    if (!normalizedSearch) return [{ group, matchingOptions: group.options, ownerMatch: false }]
    const groupMatches = normalizeFundName(group.label).includes(normalizedSearch)
    const matchingOptions = group.options.filter((option) => (
      `${option.entityName} ${option.assetClass}`.toLocaleLowerCase().includes(normalizedSearch)
    ))
    if (!groupMatches && !matchingOptions.length) return []
    return [{ group, matchingOptions: groupMatches ? group.options : matchingOptions, ownerMatch: !groupMatches }]
  }), [groups, normalizedSearch])

  const selectedTokens = useMemo(() => groups.flatMap((group) => {
    const selectedOptions = group.options.filter((option) => selectedIds.has(option.value))
    if (!selectedOptions.length) return []
    if (selectedOptions.length === group.options.length) {
      return [{
        key: group.key,
        label: group.label,
        remove: () => onChange(values.filter((value) => !group.options.some((option) => option.value === value))),
      }]
    }
    return selectedOptions.map((option) => ({
      key: option.value,
      label: `${group.label} · ${option.entityName}`,
      remove: () => onChange(values.filter((value) => value !== option.value)),
    }))
  }), [groups, onChange, selectedIds, values])

  const selectionSummary = selectedTokens.length === 0
    ? 'All funds'
    : selectedTokens.length === 1
      ? selectedTokens[0].label
      : `${values.length} owner records selected`

  const toggleExpanded = (groupKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const toggleGroup = (group: FundGroup) => {
    const groupIds = new Set(group.options.map((option) => option.value))
    const allSelected = group.options.every((option) => selectedIds.has(option.value))
    if (allSelected) onChange(values.filter((value) => !groupIds.has(value)))
    else onChange([...new Set([...values, ...groupIds])].sort())
  }

  const toggleOwner = (option: PrivateInvestmentPartnershipFacetOption) => {
    if (selectedIds.has(option.value)) onChange(values.filter((value) => value !== option.value))
    else onChange([...values, option.value].sort())
  }

  return (
    <div className="min-w-0">
      <span id={`${id}-label`} className="mb-1.5 block text-[0.68rem] font-bold uppercase tracking-[0.14em] text-gray-600">Fund</span>
      <Popover className="relative">
        {({ open }) => (
          <>
            <PopoverButton
              aria-label="Open Fund filter"
              aria-describedby={`${id}-label`}
              onClick={() => { if (!open) setSearch('') }}
              className="flex h-11 w-full items-center gap-3 rounded-md border border-gray-300 bg-gray-50 px-3 text-left text-sm font-medium text-gray-950 outline-none hover:bg-white focus-visible:border-jackson-gold focus-visible:ring-2 focus-visible:ring-jackson-gold/25"
            >
              <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className={`min-w-0 flex-1 truncate ${selectedTokens.length ? 'text-gray-950' : 'text-gray-500'}`}>{selectionSummary}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </PopoverButton>

            <PopoverPanel className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-gray-300 bg-white shadow-xl focus:outline-none">
              <div className="relative border-b border-gray-200 p-2">
                <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <label htmlFor={`${id}-search`} className="sr-only">Search funds or owners</label>
                <input
                  id={`${id}-search`}
                  autoFocus
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search funds or owners"
                  className="h-10 w-full rounded border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-950 outline-none placeholder:text-gray-500 focus:border-jackson-gold focus:bg-white focus:ring-2 focus:ring-jackson-gold/25"
                />
              </div>

              <div className="max-h-80 overflow-y-auto p-1">
                {visibleGroups.length ? visibleGroups.map(({ group, matchingOptions, ownerMatch }, groupIndex) => {
                  const selectedCount = group.options.filter((option) => selectedIds.has(option.value)).length
                  const allSelected = selectedCount === group.options.length
                  const partiallySelected = selectedCount > 0 && !allSelected
                  const expanded = expandedGroups.has(group.key) || ownerMatch
                  const ownerRegionId = `${id}-owners-${groupIndex}`
                  return (
                    <div key={group.key} className="border-b border-gray-200 last:border-b-0">
                      <div className="flex items-stretch gap-1 border-l-2 border-l-jackson-gold p-2">
                        <button
                          type="button"
                          aria-label={`${expanded ? 'Collapse' : 'Expand'} owners for ${group.label}`}
                          aria-expanded={expanded}
                          aria-controls={ownerRegionId}
                          onClick={() => toggleExpanded(group.key)}
                          className={`grid min-h-11 w-11 shrink-0 place-items-center rounded-sm border-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2 ${expanded ? 'bg-jackson-gold/15 text-jackson-hover' : 'bg-transparent text-gray-400 hover:bg-gray-100 hover:text-gray-800'}`}
                        >
                          {expanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={partiallySelected ? 'mixed' : allSelected}
                          aria-label={`${allSelected ? 'Deselect' : 'Select'} all ${group.options.length} owner record${group.options.length === 1 ? '' : 's'} for ${group.label}`}
                          onClick={() => toggleGroup(group)}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-jackson-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold"
                        >
                          <SelectionMark checked={allSelected} partial={partiallySelected} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-gray-950">{group.label}</span>
                            <span className="block text-[0.68rem] font-bold uppercase tracking-[0.08em] text-gray-500">{group.options.length} owner record{group.options.length === 1 ? '' : 's'}</span>
                          </span>
                        </button>
                      </div>

                      {expanded && (
                        <div id={ownerRegionId} className="divide-y divide-gray-200 border-l-2 border-t border-l-jackson-gold/50 border-t-gray-200 bg-gray-50/80">
                          {matchingOptions.map((option) => {
                            const checked = selectedIds.has(option.value)
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="checkbox"
                                aria-checked={checked}
                                aria-label={`${checked ? 'Deselect' : 'Select'} ${group.label} for ${option.entityName}`}
                                onClick={() => toggleOwner(option)}
                                className="flex min-h-16 w-full items-center gap-2 border-0 bg-transparent py-3 pl-14 pr-3 text-left hover:bg-jackson-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-jackson-gold"
                              >
                                <span aria-hidden="true" className="h-px w-4 shrink-0 bg-gray-300" />
                                <SelectionMark checked={checked} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-gray-700">{option.entityName}</span>
                                  <span className="mt-1 block truncate text-[0.68rem] uppercase tracking-[0.06em] text-gray-500">Owner record · {option.assetClass}</span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                }) : <p className="px-3 py-8 text-center text-sm text-gray-500">No matching funds or owners</p>}
              </div>
            </PopoverPanel>
          </>
        )}
      </Popover>

      {selectedTokens.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected Fund">
          {selectedTokens.map((token) => (
            <button
              key={token.key}
              type="button"
              onClick={token.remove}
              aria-label={`Remove ${token.label}`}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 text-[0.68rem] font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold"
            >
              <span className="max-w-44 truncate">{token.label}</span><X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
