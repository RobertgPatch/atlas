import type { ReactNode } from 'react'
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

export function MagicPatternActivitySummaryTable({
  title,
  description,
  ariaLabel,
  groups,
  notice,
  actions,
}: {
  title: string
  description: string
  ariaLabel: string
  groups: MagicPatternActivitySummaryGroup[]
  notice?: ReactNode
  actions?: ReactNode
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
        <table className="w-full min-w-[64rem] border-collapse text-left" aria-label={ariaLabel}>
          <thead className="bg-slate-100 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-slate-600">
            <tr className="border-b border-slate-300">
              <th scope="col" className="px-4 py-2">Category</th>
              <th scope="col" className="px-4 py-2">Aggregation</th>
              <th scope="col" className="px-4 py-2 text-right">Total / value</th>
              <th scope="col" className="px-4 py-2">Coverage / calculation basis</th>
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
                  <td className="px-4 py-3 text-xs leading-5 text-slate-600">{row.basis}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={row.context ? 'whitespace-nowrap font-mono' : undefined}>
                        {row.context ?? 'Current'}
                      </span>
                      {row.status ? (
                        <MagicStatusBadge tone={row.statusTone ?? 'neutral'}>{row.status}</MagicStatusBadge>
                      ) : null}
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
