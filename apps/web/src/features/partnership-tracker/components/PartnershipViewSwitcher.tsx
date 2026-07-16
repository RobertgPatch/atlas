import { Link } from 'react-router-dom'

export function PartnershipViewSwitcher({ view }: { view: 'aggregation' | 'workspace' }) {
  const options = [
    { id: 'aggregation' as const, label: 'All partnerships', to: '/partnership-aggregation' },
    { id: 'workspace' as const, label: 'Partnership workspace', to: '/partnership-tracker' },
  ]
  return (
    <nav aria-label="Partnership view" className="inline-flex min-h-11 rounded-lg border border-gray-300 bg-white p-1 shadow-sm">
      {options.map((option) => (
        <Link
          key={option.id}
          to={option.to}
          aria-current={view === option.id ? 'page' : undefined}
          className={`inline-flex min-h-9 items-center rounded-md px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2 ${view === option.id ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  )
}
