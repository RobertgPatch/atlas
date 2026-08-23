import {
  Check,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Search,
  X,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import type { InvestmentFundOption } from '../../investmentTrackerModel'

export interface InvestmentSelectOption {
  value: string
  label: string
  description?: string
}

function useAnchoredPopup(
  open: boolean,
  setOpen: (open: boolean) => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [containerRef, open, setOpen])
}

export function InvestmentSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: InvestmentSelectOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const listboxId = useId()
  useAnchoredPopup(open, setOpen, containerRef)
  const selected = options.find((option) => option.value === value) ?? options[0]

  return (
    <div ref={containerRef} className="relative">
      <span id={labelId} className="mb-1 block text-xs font-medium text-[#17263a]">
        {label}
      </span>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-[#bfcbd9] bg-white px-3 text-left text-sm text-[#17263a] transition-colors hover:border-[#8c9cb0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="truncate">{selected?.label}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[#5f7185]" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#5f7185]" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute left-0 top-full z-50 mt-2 w-full min-w-64 overflow-hidden rounded-md border border-[#bfcbd9] bg-white py-1 shadow-lg"
        >
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${isSelected ? 'bg-[#f4f7fa]' : 'hover:bg-[#e4ecf6]'}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#17263a]">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-xs text-[#5f7185]">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {isSelected ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#17263a]" aria-hidden="true" />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function InvestmentCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 shrink-0 rounded border-[#bfcbd9] accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1"
    />
  )
}

export function FundOwnerFilter({
  funds,
  selectedRecordIds,
  onChange,
}: {
  funds: InvestmentFundOption[]
  selectedRecordIds: string[]
  onChange: (recordIds: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedFundIds, setExpandedFundIds] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  useAnchoredPopup(open, setOpen, containerRef)

  const selected = useMemo(() => new Set(selectedRecordIds), [selectedRecordIds])
  const needle = query.trim().toLocaleLowerCase()
  const visibleFunds = useMemo(() => {
    if (!needle) return funds
    return funds
      .map((fund) => {
        const fundMatches = fund.name.toLocaleLowerCase().includes(needle)
        const owners = fund.owners.filter((owner) =>
          owner.name.toLocaleLowerCase().includes(needle),
        )
        if (fundMatches) return fund
        return owners.length ? { ...fund, owners } : null
      })
      .filter((fund): fund is InvestmentFundOption => fund !== null)
  }, [funds, needle])

  const touchedFunds = useMemo(
    () => funds.filter((fund) => fund.owners.some((owner) => selected.has(owner.recordId))),
    [funds, selected],
  )
  const summary = useMemo(() => {
    if (!selectedRecordIds.length) return 'All funds'
    if (touchedFunds.length === 1) {
      const fund = touchedFunds[0]
      const selectedCount = fund.owners.filter((owner) => selected.has(owner.recordId)).length
      return selectedCount === fund.owners.length
        ? fund.name
        : `${fund.name} · ${selectedCount} of ${fund.owners.length} owners`
    }
    return `${touchedFunds.length} funds · ${selectedRecordIds.length} owner records`
  }, [selected, selectedRecordIds.length, touchedFunds])

  const toggleFund = (fund: InvestmentFundOption) => {
    const ids = fund.owners.map((owner) => owner.recordId)
    const allSelected = ids.every((id) => selected.has(id))
    const next = new Set(selected)
    ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
    onChange([...next])
  }

  const toggleOwner = (recordId: string) => {
    const next = new Set(selected)
    if (next.has(recordId)) next.delete(recordId)
    else next.add(recordId)
    onChange([...next])
  }

  return (
    <div ref={containerRef} className="relative">
      <span
        id={labelId}
        className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-[#5f7185]"
      >
        Fund
      </span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-[#bfcbd9] bg-white px-3 text-left text-sm text-[#17263a] transition-colors hover:border-[#8c9cb0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Search className="h-4 w-4 shrink-0 text-[#5f7185]" aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate ${selectedRecordIds.length ? '' : 'text-[#5f7185]'}`}>
          {summary}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[#5f7185]" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#5f7185]" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Filter by fund or owner record"
          className="absolute left-0 top-full z-50 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-[#bfcbd9] bg-white shadow-lg"
        >
          <div className="border-b border-[#dae2ec] p-3">
            <label className="relative block">
              <span className="sr-only">Search funds or owner records</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c9cb0]" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search funds or owners"
                className="h-9 w-full rounded-md border border-[#bfcbd9] bg-white py-2 pl-9 pr-9 text-sm text-[#17263a] outline-none placeholder:text-[#8c9cb0] focus:border-focus focus:ring-2 focus:ring-focus/20"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear fund search"
                  onClick={() => setQuery('')}
                  className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded text-[#5f7185] hover:bg-[#e8eef5] hover:text-[#17263a]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </label>
          </div>

          <ul className="max-h-80 overflow-y-auto" role="list">
            {!visibleFunds.length ? (
              <li className="px-4 py-8 text-center text-sm text-[#3e5169]">
                No funds or owner records match that search.
              </li>
            ) : null}
            {visibleFunds.map((fund) => {
              const ownerIds = fund.owners.map((owner) => owner.recordId)
              const selectedCount = ownerIds.filter((id) => selected.has(id)).length
              const allSelected = selectedCount === ownerIds.length && ownerIds.length > 0
              const expanded = expandedFundIds.includes(fund.id) || Boolean(needle)
              return (
                <li key={fund.id} className="border-b border-[#dae2ec] last:border-b-0">
                  <div
                    className={`flex items-stretch gap-2 border-l-2 pr-3 transition-colors ${allSelected ? 'border-l-primary bg-[#d3f5dd]/40' : 'border-l-[#f5ce72] bg-white hover:bg-[#e4ecf6]'}`}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} owner records for ${fund.name}`}
                      onClick={() =>
                        setExpandedFundIds((current) =>
                          current.includes(fund.id)
                            ? current.filter((id) => id !== fund.id)
                            : [...current, fund.id],
                        )
                      }
                      className={`flex w-11 shrink-0 items-center justify-center border-r transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${expanded ? 'border-[#f5ce72] bg-[#fff6e3] text-[#92400e]' : 'border-transparent text-[#5f7185] hover:text-[#17263a]'}`}
                    >
                      {expanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </button>
                    <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5">
                      <InvestmentCheckbox
                        checked={allSelected}
                        indeterminate={selectedCount > 0 && !allSelected}
                        onChange={() => toggleFund(fund)}
                        label={`Select all owner records in ${fund.name}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[#17263a]">
                          {fund.name}
                        </span>
                        <span className="mt-0.5 block text-[0.68rem] font-semibold uppercase tracking-wide text-[#5f7185]">
                          {fund.owners.length} owner {fund.owners.length === 1 ? 'record' : 'records'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {expanded ? (
                    <ul role="list" className="bg-[#f4f7fa]">
                      {fund.owners.map((owner) => (
                        <li
                          key={owner.recordId}
                          className="flex items-center gap-3 border-t border-[#dae2ec] py-2.5 pl-14 pr-3"
                        >
                          <InvestmentCheckbox
                            checked={selected.has(owner.recordId)}
                            onChange={() => toggleOwner(owner.recordId)}
                            label={`Select ${owner.name} in ${fund.name}`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-[#3e5169]">
                              {owner.name}
                            </span>
                            <span className="mt-0.5 block text-[0.68rem] font-semibold uppercase tracking-wide text-[#5f7185]">
                              Owner record · {owner.assetClass}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-[#dae2ec] bg-[#f4f7fa] px-3 py-2">
            <span className="text-xs text-[#5f7185]">
              {selectedRecordIds.length
                ? `${selectedRecordIds.length} owner ${selectedRecordIds.length === 1 ? 'record' : 'records'} selected`
                : 'Showing every fund'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!selectedRecordIds.length}
                onClick={() => onChange([])}
                className="rounded px-2 py-1 text-xs font-semibold text-[#3e5169] hover:bg-[#e8eef5] hover:text-[#17263a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function InvestmentSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)
  return (
    <div>
      <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-[#5f7185]">
        Search activity
      </span>
      <label className="relative block">
        <span className="sr-only">Search capital activity</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c9cb0]" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={handleChange}
          placeholder="Fund, sponsor, entity or status"
          className="h-10 w-full rounded-md border border-[#bfcbd9] bg-white py-2 pl-9 pr-9 text-sm text-[#17263a] outline-none placeholder:text-[#8c9cb0] focus:border-focus focus:ring-2 focus:ring-focus/20"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear activity search"
            onClick={() => onChange('')}
            className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded text-[#5f7185] hover:bg-[#e8eef5] hover:text-[#17263a]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </label>
    </div>
  )
}

export function InvestmentFilterChip({
  label,
  children,
  onRemove,
}: {
  label: string
  children: ReactNode
  onRemove: () => void
}) {
  return (
    <span className="inline-flex min-h-7 items-center overflow-hidden rounded-full border border-[#a3c4fa] bg-[#e7f0fe] text-xs text-[#1d4ed8]">
      <span className="border-r border-[#a3c4fa] px-2 py-1 font-semibold uppercase tracking-wide">
        {label}
      </span>
      <span className="max-w-56 truncate px-2 py-1 font-medium">{children}</span>
      <button
        type="button"
        aria-label={`Remove ${label.toLowerCase()} filter ${String(children)}`}
        onClick={onRemove}
        className="grid min-h-7 min-w-7 place-items-center border-l border-[#a3c4fa] hover:bg-[#d8e7fd]"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  )
}
