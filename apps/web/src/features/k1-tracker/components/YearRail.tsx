import type { K1TrackerYearSummary } from '../../../../../../packages/types/src/k1-tracker'
import { choiceControlClassName } from '../../../components/shared/colorRecipes'

const statusLabel = (status: K1TrackerYearSummary['status']) => ({
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  IMPORTED: 'Imported',
  NEEDS_REVIEW: 'Needs review',
  RECONCILED: 'Reconciled',
})[status]

export function YearRail({
  years,
  selectedYear,
  onSelect,
  onPrefetch,
  appearance = 'default',
  selectionMode = false,
  selectedYears = [],
  onToggleSelection,
}: {
  years: K1TrackerYearSummary[]
  selectedYear?: number
  onSelect: (year: number) => void
  onPrefetch?: (year: number) => void
  appearance?: 'default' | 'workspace' | 'magic-pattern'
  selectionMode?: boolean
  selectedYears?: number[]
  onToggleSelection?: (year: number) => void
}) {
  const workspace = appearance === 'workspace'
  const magicPattern = appearance === 'magic-pattern'
  const selectedYearSet = new Set(selectedYears)

  return (
    <div
      role={selectionMode ? 'group' : magicPattern ? 'tablist' : undefined}
      aria-label={selectionMode ? 'Select K-1 entry years' : magicPattern ? 'Tax year' : 'K1 tracker years'}
      className={workspace || magicPattern ? 'flex gap-2 overflow-x-auto px-4 py-3' : 'mt-5 flex gap-2 overflow-x-auto pb-1'}
    >
      {years.map((item) => {
        const selected = selectedYear === item.taxYear
        const checked = selectedYearSet.has(item.taxYear)
        const content = <>
          <span className="flex items-center justify-between gap-2">
            <span className={workspace || magicPattern ? 'font-mono text-sm font-semibold text-slate-950' : 'font-semibold text-gray-950'}>{item.taxYear}</span>
            {workspace ? <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${item.warningCount ? 'bg-amber-500' : 'bg-emerald-500'}`} /> : null}
          </span>
          <span className={`mt-0.5 block text-[0.68rem] ${workspace || magicPattern ? 'text-slate-500' : 'mt-1 text-xs text-gray-500'}`}>{statusLabel(item.status)}</span>
          <span className={`mt-0.5 block text-[0.68rem] ${item.warningCount ? 'text-amber-700' : 'text-emerald-700'}`}>{item.warningCount ? `${item.warningCount} checks` : 'Ready'}</span>
        </>

        return selectionMode ? (
          <label key={item.taxYear} className={`flex min-w-[8rem] cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors ${checked ? 'border-primary bg-primary-subtle shadow-sm ring-1 ring-focus/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
            <input type="checkbox" aria-label={`Select ${item.taxYear} K-1 year`} checked={checked} onChange={() => onToggleSelection?.(item.taxYear)} className={`mt-0.5 h-4 w-4 shrink-0 rounded ${choiceControlClassName}`} />
            <span className="min-w-0 flex-1">{content}</span>
          </label>
        ) : (
          <button
            key={item.taxYear}
            type="button"
            role={magicPattern ? 'tab' : undefined}
            aria-selected={magicPattern ? selected : undefined}
            aria-pressed={magicPattern ? undefined : selected}
            onFocus={() => onPrefetch?.(item.taxYear)}
            onMouseEnter={() => onPrefetch?.(item.taxYear)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(item.taxYear)
              }
            }}
            onClick={() => onSelect(item.taxYear)}
            className={magicPattern
              ? `min-w-[7rem] rounded-md border px-3 py-2 text-left transition-colors ${selected
                ? 'border-primary bg-primary-subtle shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`
              : workspace
              ? `min-w-[7rem] rounded-md border px-3 py-2 text-left transition-colors ${selected
                ? 'border-primary bg-primary-subtle shadow-sm ring-1 ring-focus/10'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`
              : `min-w-24 rounded-lg border px-3 py-2 text-left ${selected
                ? 'border-primary bg-primary-subtle'
                : 'border-gray-200 hover:bg-gray-50'}`}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
