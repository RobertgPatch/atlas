import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react'
import { Building2, Check, ChevronDown, Loader2, Plus, Search } from 'lucide-react'
import type { PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'

type PartnershipPickerProps = {
  items: PartnershipTrackerSummary[]
  selectedId?: string
  selected?: PartnershipTrackerSummary
  search: string
  loading: boolean
  error?: string
  canEdit: boolean
  onSearch: (value: string) => void
  onSelect: (id: string) => void
  onAdd: () => void
}

const statusLabel = (item: PartnershipTrackerSummary) =>
  (item.latestWorkflowStatus ?? item.partnership.status).replaceAll('_', ' ')

export function PartnershipPicker({
  items,
  selectedId,
  selected,
  search,
  loading,
  error,
  canEdit,
  onSearch,
  onSelect,
  onAdd,
}: PartnershipPickerProps) {
  const selectedItem = selected?.partnership.id === selectedId
    ? selected
    : items.find((item) => item.partnership.id === selectedId) ?? null

  return (
    <section
      aria-labelledby="partnership-selector-label"
      className="rounded-xl border border-gray-300 border-t-4 border-t-primary bg-white px-4 py-4 shadow-sm sm:px-5"
      data-testid="partnership-selector"
    >
      <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-950 text-primary" aria-hidden="true">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <label id="partnership-selector-label" htmlFor="workspace-partnership" className="block text-[0.68rem] font-bold uppercase tracking-[0.16em] text-gray-700">
                Partnership workspace
              </label>
              <p className="truncate text-xs text-gray-500">Search by partnership or owning entity</p>
            </div>
          </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start" data-testid="partnership-selector-controls">
          <div className="min-w-0">
          <Combobox
            value={selectedItem}
            by={(left, right) => left?.partnership.id === right?.partnership.id}
            immediate
            onChange={(item) => {
              if (!item) return
              onSelect(item.partnership.id)
              onSearch('')
            }}
            onClose={() => {
              if (search) onSearch('')
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <ComboboxInput
                id="workspace-partnership"
                aria-describedby="partnership-selection-meta"
                autoComplete="off"
                displayValue={(item: PartnershipTrackerSummary | null) => item?.partnership.name ?? ''}
                onChange={(event) => onSearch(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="Find a partnership…"
                className="h-11 w-full rounded-lg border border-gray-400 bg-white py-2.5 pl-10 pr-12 text-base font-semibold text-gray-950 shadow-inner outline-none placeholder:font-normal placeholder:text-gray-400 focus:border-focus focus:ring-2 focus:ring-focus/25 sm:text-sm"
              />
              <ComboboxButton
                aria-label="Open partnership options"
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gray-500 hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ChevronDown className="h-5 w-5" aria-hidden="true" />}
              </ComboboxButton>

              <ComboboxOptions
                modal={false}
                className="absolute left-0 right-0 z-40 mt-2 max-h-80 overflow-y-auto rounded-lg border border-gray-300 bg-white p-1.5 shadow-xl focus:outline-none [scrollbar-gutter:stable]"
              >
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500" role="status">
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Loading partnerships…
                  </div>
                ) : error ? (
                  <div className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">{error}</div>
                ) : items.length === 0 ? (
                  <div className="px-3 py-5 text-center" role="status">
                    <Building2 className="mx-auto h-7 w-7 text-gray-300" aria-hidden="true" />
                    <p className="mt-2 text-sm font-semibold text-gray-800">{search ? 'No matching partnerships' : 'No partnerships yet'}</p>
                    <p className="mt-1 text-xs text-gray-500">{search ? 'Try a different partnership or entity name.' : canEdit ? 'Add one to begin tracking K-1 history.' : 'No partnerships are available in your entity scope.'}</p>
                  </div>
                ) : items.map((item) => (
                  <ComboboxOption
                    key={item.partnership.id}
                    value={item}
                    className={({ focus, selected: active }) => `group grid cursor-default grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border px-3 py-2.5 outline-none transition ${focus || active ? 'border-primary bg-primary-subtle' : 'border-transparent'}`}
                  >
                    {({ selected: active }) => (
                      <>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-gray-950">{item.partnership.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-gray-500">{item.partnership.entity.name} · {item.partnership.partnershipType}</span>
                          <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-gray-500">
                            <span>{item.latestTaxYear ? `${item.latestTaxYear} K-1` : 'No K-1 years'}</span>
                            <span>{statusLabel(item)}</span>
                          </span>
                        </span>
                        <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${active ? 'bg-primary text-primary-foreground' : 'text-transparent group-data-[focus]:text-gray-300'}`} aria-hidden="true">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </>
                    )}
                  </ComboboxOption>
                ))}
              </ComboboxOptions>
            </div>
          </Combobox>

          <p id="partnership-selection-meta" className="mt-2 min-h-4 truncate text-xs text-gray-500" aria-live="polite">
            {selectedItem
              ? `${selectedItem.partnership.entity.name} · ${selectedItem.partnership.partnershipType} · ${statusLabel(selectedItem)}`
              : 'Choose a partnership to open its workspace.'}
          </p>
        </div>

        {canEdit ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800 shadow-sm hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </button>
        ) : null}
      </div>
      </div>
    </section>
  )
}
