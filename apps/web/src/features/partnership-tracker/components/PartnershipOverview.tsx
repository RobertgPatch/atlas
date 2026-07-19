import { CalendarRange, Landmark, LineChart, Pencil } from 'lucide-react'
import type { PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'
import { PerformanceMetricStrip } from './PerformanceMetricStrip'

const currency = (value?: string | null) => value == null ? 'Not entered' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—'

export function PartnershipOverview({ summary, canEdit, onEdit }: { summary: PartnershipTrackerSummary; canEdit: boolean; onEdit: () => void }) {
  const partnership = summary.partnership
  const cards = [
    { label: 'Committed capital', value: currency(summary.currentCommittedCapital?.amount), detail: summary.currentCommittedCapital ? `Effective ${date(summary.currentCommittedCapital.date)}` : 'Add an effective-dated total', icon: Landmark },
    { label: 'Latest NAV', value: currency(summary.latestNav?.amount), detail: summary.latestNav ? `As of ${date(summary.latestNav.date)}` : 'Add a dated NAV observation', icon: LineChart },
    { label: 'K-1 history', value: summary.earliestK1Year == null ? 'No years' : summary.earliestK1Year === summary.latestTaxYear ? String(summary.latestTaxYear) : `${summary.earliestK1Year}–${summary.latestTaxYear}`, detail: summary.latestWorkflowStatus?.replaceAll('_', ' ') ?? 'Start any tax year', icon: CalendarRange },
  ]
  return <div className="space-y-5">
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-gray-950">{partnership.name}</h2><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{partnership.status}</span></div><p className="mt-1 text-sm text-gray-500">{partnership.entity.name} · {partnership.partnershipType}</p>{partnership.notes && <p className="mt-3 max-w-3xl text-sm text-gray-700">{partnership.notes}</p>}</div>{canEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"><Pencil className="h-4 w-4" />Edit partnership</button>}</div></section>
    <PerformanceMetricStrip summary={summary} />
    <div className="grid gap-4 md:grid-cols-3">{cards.map((card) => <section key={card.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-sm font-medium text-gray-500"><card.icon className="h-4 w-4" />{card.label}</div><p className="mt-3 text-2xl font-semibold text-gray-950">{card.value}</p><p className="mt-1 text-xs text-gray-500">{card.detail}</p></section>)}</div>
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-gray-950">Latest tax position</h3><dl className="mt-4 grid gap-4 sm:grid-cols-3"><div><dt className="text-xs uppercase tracking-wide text-gray-500">Ending outside basis</dt><dd className="mt-1 text-lg font-semibold text-gray-900">{currency(summary.latestEndingOutsideBasis)}</dd></div><div><dt className="text-xs uppercase tracking-wide text-gray-500">Latest tax year</dt><dd className="mt-1 text-lg font-semibold text-gray-900">{summary.latestTaxYear ?? '—'}</dd></div><div><dt className="text-xs uppercase tracking-wide text-gray-500">Warnings</dt><dd className="mt-1 text-lg font-semibold text-gray-900">{summary.warningCount}</dd></div></dl></section>
  </div>
}
