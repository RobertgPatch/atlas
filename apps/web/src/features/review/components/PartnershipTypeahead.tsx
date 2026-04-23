import { useEffect, useRef, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface PartnershipOption {
  id: string
  name: string
  entityId: string
}

interface Props {
  entityId: string | null
  value: string | null
  onChange: (partnershipId: string | null, partnershipName: string | null) => void
  placeholder?: string
  disabled?: boolean
}

const DEBOUNCE_MS = 300

export const PartnershipTypeahead = ({
  entityId,
  value,
  onChange,
  placeholder = 'Search partnerships…',
  disabled = false,
}: Props) => {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PartnershipOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

  const search = async (q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q, limit: '20' })
      if (entityId) params.set('entity_id', entityId)
      const res = await fetch(`${apiBase}/review/partnerships?${params.toString()}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = (await res.json()) as { items: PartnershipOption[] }
        setOptions(data.items)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void search(query)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, entityId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (option: PartnershipOption) => {
    setSelectedName(option.name)
    setQuery(option.name)
    onChange(option.id, option.name)
    setOpen(false)
  }

  const handleClear = () => {
    setSelectedName(null)
    setQuery('')
    onChange(null, null)
    setOpen(false)
  }

  const displayValue = selectedName ?? value ?? ''

  return (
    <div ref={containerRef} className="relative" data-testid="partnership-typeahead">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          disabled={disabled || !entityId}
          value={open ? query : displayValue}
          placeholder={entityId ? placeholder : 'Select an entity first'}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          aria-autocomplete="list"
          aria-expanded={open}
          role="combobox"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {open && options.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto"
        >
          {value && (
            <li>
              <button
                type="button"
                onClick={handleClear}
                className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50"
              >
                Clear selection
              </button>
            </li>
          )}
          {options.map((opt) => (
            <li key={opt.id} role="option" aria-selected={opt.id === value}>
              <button
                type="button"
                onClick={() => handleSelect(opt)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 hover:text-blue-700 ${
                  opt.id === value ? 'font-medium text-blue-700' : 'text-gray-700'
                }`}
              >
                {opt.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
