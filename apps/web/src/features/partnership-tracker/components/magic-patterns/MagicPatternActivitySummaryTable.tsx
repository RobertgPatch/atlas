import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { MagicCard, MagicStatusBadge } from './MagicPatternPrimitives'

type SummaryStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'calculated'

export interface MagicPatternActivitySummaryRow {
  label: string
  value: string
  basis: string
  context?: string
  status?: string
  statusTone?: SummaryStatusTone
  valueTone?: 'default' | 'inflow' | 'outflow'
}

export interface MagicPatternActivitySummaryGroup {
  label: string
  rows: MagicPatternActivitySummaryRow[]
}

function BasisTooltip({ label, basis }: { label: string; basis: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, above: false })
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const bounds = trigger.getBoundingClientRect()
    const width = Math.min(288, window.innerWidth - 24)
    const left = Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12))
    const above = bounds.bottom + 112 > window.innerHeight && bounds.top > 112
    setPosition({ top: above ? bounds.top - 8 : bounds.bottom + 8, left, above })
  }, [])
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])
  const show = () => { updatePosition(); setOpen(true) }
  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-label={`Coverage and calculation basis for ${label}`}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
      className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Info className="h-4 w-4" aria-hidden="true" />
    </button>
    {open ? createPortal(
      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none fixed z-[100] w-72 max-w-[calc(100vw-1.5rem)] rounded-md bg-slate-950 px-3 py-2.5 text-left text-xs leading-5 text-white shadow-lg"
        style={{ top: position.top, left: position.left, transform: position.above ? 'translateY(-100%)' : undefined }}
      >
        <span className="block font-semibold">Coverage / calculation basis</span>
        <span className="mt-0.5 block text-slate-200">{basis}</span>
      </div>,
      document.body,
    ) : null}
  </>
}

export function MagicPatternActivitySummaryTable({
  title,
  description,
  ariaLabel,
  groups,
  notice,
  actions,
  basisInTooltip = false,
}: {
  title: string
  description: string
  ariaLabel: string
  groups: MagicPatternActivitySummaryGroup[]
  notice?: ReactNode
  actions?: ReactNode
  basisInTooltip?: boolean
}) {
  return (
    <MagicCard className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {notice ?? actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {notice}
            {actions}
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse text-left ${basisInTooltip ? 'min-w-[46rem]' : 'min-w-[64rem]'}`} aria-label={ariaLabel}>
          <thead className="bg-slate-100 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-slate-600">
            <tr className="border-b border-slate-300">
              <th scope="col" className="px-4 py-2">Category</th>
              <th scope="col" className="px-4 py-2">Aggregation</th>
              <th scope="col" className="px-4 py-2 text-right">Total / value</th>
              {!basisInTooltip ? <th scope="col" className="px-4 py-2">Coverage / calculation basis</th> : null}
              <th scope="col" className="px-4 py-2">As of / status</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.label}>
              {group.rows.map((row, index) => (
                <tr
                  key={row.label}
                  className="border-b border-slate-200 bg-white last:border-b-0 hover:bg-slate-50/70"
                >
                  {index === 0 ? (
                    <th
                      scope="rowgroup"
                      rowSpan={group.rows.length}
                      className="w-40 border-r border-slate-200 bg-slate-50 px-4 py-3 text-left align-top text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-slate-600"
                    >
                      {group.label}
                    </th>
                  ) : null}
                  <th scope="row" className="px-4 py-3 text-left text-sm font-semibold text-slate-900">
                    {row.label}
                  </th>
                  <td
                    className={`px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums ${
                      row.valueTone === 'inflow'
                        ? 'text-emerald-700'
                        : row.valueTone === 'outflow'
                          ? 'text-red-800'
                          : 'text-slate-950'
                    }`}
                  >
                    {row.value}
                  </td>
                  {!basisInTooltip ? <td className="px-4 py-3 text-xs leading-5 text-slate-600">{row.basis}</td> : null}
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={row.context ? 'whitespace-nowrap font-mono' : undefined}>
                        {row.context ?? 'Current'}
                      </span>
                      {row.status ? (
                        <MagicStatusBadge tone={row.statusTone ?? 'neutral'}>{row.status}</MagicStatusBadge>
                      ) : null}
                      {basisInTooltip ? <BasisTooltip label={row.label} basis={row.basis} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </MagicCard>
  )
}
