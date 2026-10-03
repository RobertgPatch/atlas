import { useState, type ReactNode } from 'react'
import { PARTNERSHIP_TYPES } from '../../../../../../../packages/types/src/partnership-tracker'
import { colorTokens } from '../../../../../design-tokens.js'
import { MagicCard } from './MagicPatternPrimitives'
import { portfolioMoney, type PortfolioChartData } from './portfolioChartData'

const BLUE = colorTokens.visualization.seriesOne
const GREEN = colorTokens.semantic.success.foreground
const AMBER = colorTokens.visualization.seriesFour
const PIE_COLORS = [
  BLUE,
  GREEN,
  colorTokens.visualization.seriesTwo,
  colorTokens.visualization.seriesThree,
  AMBER,
  colorTokens.visualization.seriesFive,
  colorTokens.neutral.controlBorder,
]
const compact = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
}).format(value)

function ChartCard({ title, description, children, actions }: { title: string; description: string; children: ReactNode; actions?: ReactNode }) {
  return <MagicCard className="min-w-0 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>
      </div>
      {actions}
    </div>
    {children}
  </MagicCard>
}

function EmptyChart({ children }: { children: ReactNode }) {
  return <p className="px-5 py-12 text-center text-sm text-slate-500">{children}</p>
}

function Coverage({ covered, total }: { covered: number; total: number }) {
  if (covered === total) return null
  return <p className="border-t border-slate-200 px-5 py-2 text-xs text-slate-500">Based on {covered} of {total} selected owner records with amounts on file.</p>
}

export function PortfolioCommitmentProgress({ data }: { data: PortfolioChartData }) {
  const { committed, paidIn, ringPaid, remaining, coveredCount } = data.commitment
  if (coveredCount === 0 || committed <= 0n) return <ChartCard title="Commitment progress" description="Paid-in capital and unfunded commitment across selected partnerships.">
    <EmptyChart>No commitment and paid-in amounts are available for this selection.</EmptyChart>
  </ChartCard>
  const ringTotal = ringPaid + remaining
  const paidShare = ringTotal > 0n ? Number(ringPaid) / Number(ringTotal) : 0
  const circumference = 2 * Math.PI * 54
  const percent = (Number(paidIn) / Number(committed) * 100).toFixed(1)
  return <ChartCard title="Commitment progress" description="Paid-in capital and unfunded commitment across selected partnerships.">
    <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4 p-5">
      <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={`${portfolioMoney(paidIn)} paid in of ${portfolioMoney(committed)} committed; ${portfolioMoney(remaining)} remains`} className="shrink-0">
        <circle cx="80" cy="80" r="54" fill="none" stroke={colorTokens.neutral.controlBorder} strokeWidth="18" />
        {ringPaid > 0n ? <circle cx="80" cy="80" r="54" fill="none" stroke={BLUE} strokeWidth="18" strokeDasharray={`${paidShare * circumference} ${circumference}`} transform="rotate(-90 80 80)" /> : null}
        <text x="80" y="78" textAnchor="middle" fontSize="23" fontWeight="600" fill={colorTokens.neutral.textPrimary}>{percent}%</text>
        <text x="80" y="99" textAnchor="middle" fontSize="11" fill={colorTokens.neutral.textSecondary}>called</text>
      </svg>
      <dl className="min-w-[11rem] flex-1 space-y-3 text-sm">
        <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BLUE }} />Paid in</dt><dd className="font-mono font-semibold tabular-nums text-slate-950">{portfolioMoney(paidIn)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorTokens.neutral.controlBorder }} />Remaining</dt><dd className="font-mono font-semibold tabular-nums text-slate-950">{portfolioMoney(remaining)}</dd></div>
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-3"><dt className="text-slate-600">Committed</dt><dd className="font-mono font-semibold tabular-nums text-slate-950">{portfolioMoney(committed)}</dd></div>
      </dl>
    </div>
    {paidIn > committed ? <p className="mx-5 mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Paid-in capital exceeds total commitments by {portfolioMoney(paidIn - committed)}.</p> : null}
    <Coverage covered={coveredCount} total={data.recordCount} />
  </ChartCard>
}

export function PortfolioDistributionPie({ data }: { data: PortfolioChartData }) {
  const { byType, total, coveredCount } = data.distributions
  if (total <= 0n) return <ChartCard title="Distributions by asset type" description="Reported distributions grouped by partnership type.">
    <EmptyChart>No distribution amounts are available for this selection.</EmptyChart>
  </ChartCard>
  const slices = byType.reduce<{ offset: number; stops: string[] }>((previous, item, sliceIndex) => {
    const index = PARTNERSHIP_TYPES.indexOf(item.type)
    const color = PIE_COLORS[index] ?? PIE_COLORS[0]!
    const next = sliceIndex === byType.length - 1 ? 100 : previous.offset + Number(item.amount) / Number(total) * 100
    return { offset: next, stops: [...previous.stops, `${color} ${previous.offset}% ${next}%`] }
  }, { offset: 0, stops: [] })
  return <ChartCard title="Distributions by asset type" description="Reported distributions grouped by partnership type.">
    <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-5 p-5">
      <div role="img" aria-label={`Distribution share by asset type: ${byType.map((item) => `${item.type} ${portfolioMoney(item.amount)}`).join('; ')}`} className="h-40 w-40 shrink-0 rounded-full" style={{ background: `conic-gradient(${slices.stops.join(', ')})` }} />
      <dl className="min-w-[12rem] flex-1 space-y-2.5 text-sm">
        {byType.map((item) => {
          const index = PARTNERSHIP_TYPES.indexOf(item.type)
          return <div key={item.type} className="flex items-start justify-between gap-3"><dt className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PIE_COLORS[index] }} />{item.type}</dt><dd className="text-right font-mono font-semibold tabular-nums text-slate-950">{portfolioMoney(item.amount)}<span className="block text-xs font-normal text-slate-500">{(Number(item.amount) / Number(total) * 100).toFixed(1)}%</span></dd></div>
        })}
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-2.5"><dt className="text-slate-600">Total distributed</dt><dd className="font-mono font-semibold tabular-nums text-slate-950">{portfolioMoney(total)}</dd></div>
      </dl>
    </div>
    <Coverage covered={coveredCount} total={data.recordCount} />
  </ChartCard>
}

export function PortfolioCashRecovery({ data }: { data: PortfolioChartData }) {
  const { paid, returned, eventCount } = data.cash
  const returnedMagnitude = returned < 0n ? -returned : returned
  const scale = [paid, returnedMagnitude, 1n].reduce((largest, value) => value > largest ? value : largest)
  return <ChartCard title="Cash recovery" description="Cash received compared with cash paid across selected partnerships.">
    {eventCount === 0 ? <EmptyChart>No settled cash activity is available for this selection.</EmptyChart> : <div className="space-y-5 p-5">
      <div role="img" aria-label={`Cash paid ${portfolioMoney(paid)}; net cash returned ${portfolioMoney(returned)}`} className="space-y-5">
        <div><div className="mb-2 flex justify-between gap-3 text-sm"><span className="text-slate-600">Cash paid (calls + call fees)</span><strong className="font-mono tabular-nums text-slate-950">{portfolioMoney(paid)}</strong></div><div className="h-4 rounded-sm bg-slate-200"><div className="h-4 rounded-sm bg-blue-600" style={{ width: `${Number(paid) / Number(scale) * 100}%` }} /></div></div>
        <div><div className="mb-2 flex justify-between gap-3 text-sm"><span className="text-slate-600">Net cash returned</span><strong className="font-mono tabular-nums text-slate-950">{portfolioMoney(returned)}</strong></div><div className="h-4 rounded-sm bg-slate-200"><div className={`h-4 rounded-sm ${returned < 0n ? 'bg-red-700' : 'bg-emerald-700'}`} style={{ width: `${Number(returnedMagnitude) / Number(scale) * 100}%` }} /></div></div>
      </div>
      <p className="border-t border-slate-200 pt-3 text-xs text-slate-600">{paid > 0n ? `${(Number(returned) / Number(paid) * 100).toFixed(1)}% of cash paid has been returned.` : 'No settled cash paid has been recorded.'}</p>
    </div>}
  </ChartCard>
}

export function PortfolioFundingOverTime({ data }: { data: PortfolioChartData }) {
  const [view, setView] = useState<'future' | 'historic'>('future')
  const { committed, called, coveredCount, history, future, currentYear, currentYearCalled, remaining, extendedWindowCount, assumedStartCount, assumedPaidInCount } = data.funding
  const rows = view === 'future'
    ? [
      { label: String(currentYear), amount: currentYearCalled, estimated: false, detail: 'Called this year' },
      ...future.map(({ year, amount }) => ({ label: String(year), amount, estimated: true, detail: 'Estimated annual requirement' })),
    ]
    : history.map(({ label, called, cumulative }) => ({ label, amount: cumulative, estimated: false, detail: `${portfolioMoney(called)} called in this period; cumulative total` }))
  const description = view === 'future'
    ? 'Annual funding requirements · current year actuals and estimated future calls.'
    : `Cumulative capital called against ${compact(Number(committed) / 10_000)} committed · up to five historic periods plus the current year.`
  const chartLabel = view === 'future'
    ? `Annual funding requirements against ${portfolioMoney(committed)} committed: ${rows.map(({ label, amount, estimated }) => `${label} ${portfolioMoney(amount)} ${estimated ? 'estimated' : 'actual'}`).join('; ')}`
    : `Cumulative capital called by year against ${portfolioMoney(committed)} committed: ${rows.map(({ label, amount }) => `${label} ${portfolioMoney(amount)}`).join('; ')}`
  const toggle = <div className="ml-auto inline-flex shrink-0 overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Funding view">
    {(['future', 'historic'] as const).map((mode) => <button
      key={mode}
      type="button"
      aria-pressed={view === mode}
      onClick={() => setView(mode)}
      className={`min-h-8 px-2.5 text-xs font-semibold capitalize focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${view === mode ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
    >{mode === 'future' ? 'Future' : 'Historic'}</button>)}
  </div>
  return <ChartCard title="Funding over time" description={description} actions={toggle}>
    {coveredCount === 0 ? <EmptyChart>No commitment amounts are available for this selection.</EmptyChart> : <>
      <div role="img" aria-label={chartLabel} className="space-y-4 px-5 py-4">
        {rows.map(({ label, amount, estimated, detail }) => {
          const percent = committed > 0n ? Number(amount) / Number(committed) * 100 : 0
          return <div key={label} data-funding-bar className="flex items-center gap-3 text-xs" title={`${label}: ${portfolioMoney(amount)} · ${detail} · ${percent.toFixed(1)}% of commitment`}>
            <span className="w-24 shrink-0 tabular-nums text-slate-600">{label}{view === 'future' ? <span className="ml-1 text-[0.62rem] text-slate-500">{estimated ? 'Est.' : 'Actual'}</span> : null}</span>
            <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-slate-200">
              <div className="h-full rounded-sm" style={{ width: `${Math.min(100, percent)}%`, backgroundColor: estimated ? AMBER : BLUE }} />
            </div>
            <span className="w-24 shrink-0 text-right font-mono font-semibold tabular-nums text-slate-950">{compact(Number(amount) / 10_000)} · {Math.round(percent)}%</span>
          </div>
        })}
      </div>
      <div className="mx-5 space-y-2 border-t border-slate-200 py-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-950">{view === 'historic' && called > committed ? `${portfolioMoney(called - committed)} called beyond current commitments` : `${portfolioMoney(remaining)} commitment remains`}</p>
        {view === 'future' ? <>
          {remaining === 0n ? <p>No uncalled commitment remains to forecast.</p> : <p>Estimates spread each partnership’s remaining commitment evenly over 5 minus its age in calendar years. A new partnership uses 20% per year. Actual calls update the remaining amount.</p>}
          {extendedWindowCount > 0 ? <p>{extendedWindowCount} owner {extendedWindowCount === 1 ? 'record is' : 'records are'} already at least five years old; their remaining capital is spread over the next five years.</p> : null}
          {assumedStartCount > 0 ? <p>{assumedStartCount} owner {assumedStartCount === 1 ? 'record has' : 'records have'} no inception or activity date; a five-year window is assumed.</p> : null}
          {assumedPaidInCount > 0 ? <p>{assumedPaidInCount} owner {assumedPaidInCount === 1 ? 'record has' : 'records have'} no calls recorded; the estimate assumes the full commitment is uncalled.</p> : null}
        </> : <p>Each bar shows capital called through the end of its year or range. Hover for the amount called within that period.</p>}
      </div>
    </>}
    <Coverage covered={coveredCount} total={data.recordCount} />
  </ChartCard>
}

export function PortfolioTopCharts({ data }: { data: PortfolioChartData }) {
  return <div data-pdf-chart-grid data-pdf-keep-together className="grid gap-4 xl:grid-cols-2" aria-label="Portfolio cash charts">
    <PortfolioCashRecovery data={data} />
    <PortfolioFundingOverTime data={data} />
  </div>
}

export function PortfolioSecondaryCharts({ data }: { data: PortfolioChartData }) {
  return <div data-pdf-chart-grid data-pdf-keep-together className="grid gap-4 xl:grid-cols-2" aria-label="Portfolio composition charts">
    <PortfolioCommitmentProgress data={data} />
    <PortfolioDistributionPie data={data} />
  </div>
}
