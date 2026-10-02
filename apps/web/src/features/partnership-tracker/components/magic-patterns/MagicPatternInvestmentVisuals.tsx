import type { K1TrackerCashFlowEvent } from '../../../../../../../packages/types/src/k1-tracker'
import type { InvestmentPerformance } from '../../../../../../../packages/types/src/partnership-tracker'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { colorTokens } from '../../../../../design-tokens.js'
import { capitalActivityLedger, formatLedgerMoney } from './capitalActivityLedger'
import { MagicCard } from './MagicPatternPrimitives'

const CHART_RED = colorTokens.semantic.danger.foreground
const CHART_GREEN = colorTokens.semantic.success.foreground
const CHART_AMBER = colorTokens.visualization.seriesFour
const CHART_BLUE = colorTokens.visualization.seriesOne
const GRID = colorTokens.neutral.border

const fromUnits = (value: bigint) => Number(value) / 10_000
const magnitude = (value: bigint) => value < 0n ? -value : value
const units = (value: string) => {
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const amount = BigInt(whole) * 10_000n + BigInt((fraction + '0000').slice(0, 4))
  return negative ? -amount : amount
}
const exactMoney = (value: bigint) => {
  const magnitude = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}$${(magnitude / 10_000n).toLocaleString('en-US')}.${String(magnitude % 10_000n).padStart(4, '0')}`
}
const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
}).format(value)
const compactMoney = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
}).format(value)
const shortDate = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`))

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <MagicCard className="overflow-hidden">
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>
    </div>
    {children}
  </MagicCard>
}

type DonutPart = { label: string; value: bigint; color: string }

function DonutFigure({ parts, centerValue, centerLabel, ariaLabel }: {
  parts: [DonutPart, DonutPart]
  centerValue: string
  centerLabel: string
  ariaLabel: string
}) {
  const total = parts[0].value + parts[1].value
  const circumference = 2 * Math.PI * 54
  const firstLength = total > 0n ? circumference * Number(parts[0].value) / Number(total) : 0
  const secondLength = circumference - firstLength
  return <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4 p-5">
    <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={ariaLabel} className="shrink-0">
      <circle cx="80" cy="80" r="54" fill="none" stroke={GRID} strokeWidth="18" />
      {parts[0].value > 0n ? <circle cx="80" cy="80" r="54" fill="none" stroke={parts[0].color} strokeWidth="18" strokeDasharray={`${firstLength} ${circumference}`} transform="rotate(-90 80 80)"><title>{parts[0].label}: {exactMoney(parts[0].value)}</title></circle> : null}
      {parts[1].value > 0n ? <circle cx="80" cy="80" r="54" fill="none" stroke={parts[1].color} strokeWidth="18" strokeDasharray={`${secondLength} ${circumference}`} strokeDashoffset={-firstLength} transform="rotate(-90 80 80)"><title>{parts[1].label}: {exactMoney(parts[1].value)}</title></circle> : null}
      <text x="80" y="78" textAnchor="middle" fontSize="23" fontWeight="600" fill={colorTokens.neutral.textPrimary}>{centerValue}</text>
      <text x="80" y="99" textAnchor="middle" fontSize="11" fill={colorTokens.neutral.textSecondary}>{centerLabel}</text>
    </svg>
    <dl className="min-w-[11rem] flex-1 space-y-3 text-sm">
      {parts.map((part) => <div key={part.label} className="flex items-start justify-between gap-3">
        <dt className="flex items-center gap-2 text-slate-600"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: part.color }} />{part.label}</dt>
        <dd className="font-mono font-semibold tabular-nums text-slate-950">{money(fromUnits(part.value))}</dd>
      </div>)}
    </dl>
  </div>
}

export function CashMovementChart({ events }: { events: K1TrackerCashFlowEvent[] }) {
  const activityPlotRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  useEffect(() => {
    const element = activityPlotRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.floor(entry?.contentRect.width ?? 0)
      setAvailableWidth((current) => current === measured ? current : measured)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [events.length])
  const ordered = events.map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.activityDate.localeCompare(b.event.activityDate) || a.index - b.index)
  const ledger = capitalActivityLedger(events, '0')
  const points = ordered.map(({ event }) => {
    const amounts = ledger.get(event.id)!
    return {
      event,
      gross: fromUnits(amounts.gross),
      fees: fromUnits(amounts.feesAndCarry),
      grossLabel: formatLedgerMoney(amounts.gross),
      feesLabel: formatLedgerMoney(amounts.feesAndCarry),
    }
  })

  if (points.length === 0) return <ChartCard title="Cash activity" description="Capital calls, distributions, and fees by date.">
    <p className="px-4 py-10 text-center text-sm text-slate-500">Record a capital call or distribution to see cash activity.</p>
  </ChartCard>

  const width = Math.max(520, points.length * 76 + 100, availableWidth)
  const left = 78
  const right = width - 20
  const plotWidth = right - left
  const x = (index: number) => left + (index + 0.5) * plotWidth / points.length
  const barTop = 20
  const barBottom = 165
  const barZero = (barTop + barBottom) / 2
  const barHalfHeight = (barBottom - barTop) / 2 - 13
  const maxBar = Math.max(1, ...points.map((point) => Math.max(
    Math.max(0, point.gross),
    Math.abs(Math.min(0, point.gross) + point.fees),
  )))
  const barY = (value: number) => barZero - value / maxBar * barHalfHeight
  const activityAriaLabel = `Cash activity bars by activity date: ${points.map((point) => {
    const kind = point.event.kind === 'CAPITAL_CALL' ? 'Capital call' : point.event.kind === 'RECALLABLE_DISTRIBUTION' ? 'Recallable distribution' : 'Distribution'
    const fees = point.fees !== 0 ? `; fees and carry ${point.feesLabel}` : ''
    const status = point.event.settlementStatus === 'ANNOUNCED' ? ' (announced)' : ''
    return `${shortDate(point.event.activityDate)} ${kind} ${point.grossLabel}${fees}${status}`
  }).join('; ')}`
  return <ChartCard title="Cash activity" description="Capital calls, distributions, and fees by date. Announced amounts are outlined.">
    <div className="p-4">
      <section className="min-w-0" aria-label="Activity graphic">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Activity</h4>
        <div className="mb-2 flex min-h-10 flex-wrap content-start gap-x-4 gap-y-1 text-xs text-slate-600" aria-hidden="true">
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-red-700" />Capital calls</span>
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-700" />Distributions</span>
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-orange-700" />Fees &amp; carry</span>
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-slate-600" />Announced</span>
        </div>
        <div ref={activityPlotRef} className="overflow-x-auto">
          <svg width={width} height="220" viewBox={`0 0 ${width} 220`} role="img" aria-label={activityAriaLabel} className="max-w-none">
            {[barTop + 13, barZero, barBottom - 13].map((y) => <line key={y} x1={left} x2={right} y1={y} y2={y} stroke={GRID} strokeDasharray={y === barZero ? undefined : '3 4'} />)}
            <text x={left - 9} y={barTop + 17} textAnchor="end" fontSize="10" fill="#64748b">{compactMoney(maxBar)}</text>
            <text x={left - 9} y={barZero + 4} textAnchor="end" fontSize="10" fill="#64748b">$0</text>
            <text x={left - 9} y={barBottom - 9} textAnchor="end" fontSize="10" fill="#64748b">{compactMoney(-maxBar)}</text>
            {points.map((point, index) => {
              const center = x(index)
              const pending = point.event.settlementStatus === 'ANNOUNCED'
              const grossEnd = barY(point.gross)
              const feesEnd = barY(Math.min(0, point.gross) + point.fees)
              const feesStart = barY(Math.min(0, point.gross))
              const grossColor = point.event.kind === 'CAPITAL_CALL' ? CHART_RED : CHART_GREEN
              return <g key={point.event.id}>
                {point.gross !== 0 ? <rect x={center - 16} y={Math.min(barZero, grossEnd)} width="20" height={Math.max(2, Math.abs(grossEnd - barZero))} rx="2" fill={pending ? '#fff' : grossColor} stroke={grossColor} strokeWidth="1.5" strokeDasharray={pending ? '3 2' : undefined}>
                  <title>{shortDate(point.event.activityDate)}: {point.event.kind === 'CAPITAL_CALL' ? 'Capital call' : 'Distribution'} {point.grossLabel}{pending ? ' (announced)' : ''}</title>
                </rect> : null}
                {point.fees < 0 ? <rect x={center + 6} y={Math.min(feesStart, feesEnd)} width="10" height={Math.max(2, Math.abs(feesEnd - feesStart))} rx="1" fill={pending ? '#fff' : CHART_AMBER} stroke={CHART_AMBER} strokeWidth="1.5" strokeDasharray={pending ? '3 2' : undefined}>
                  <title>{shortDate(point.event.activityDate)}: Fees and carry -${point.event.feesAndCarry ?? '0'} USD{pending ? ' (announced)' : ''}</title>
                </rect> : null}
                <text x={center} y="208" textAnchor="middle" fontSize="10" fill="#64748b">{shortDate(point.event.activityDate)}</text>
              </g>
            })}
          </svg>
        </div>
      </section>
    </div>
  </ChartCard>
}

export function DistributionMix({ events }: { events: K1TrackerCashFlowEvent[] }) {
  const settled = events.filter((event) => event.settlementStatus !== 'ANNOUNCED')
  const sumKind = (kind: K1TrackerCashFlowEvent['kind']) => settled
    .filter((event) => event.kind === kind)
    .reduce((total, event) => total + magnitude(units(event.amount)), 0n)
  const ordinary = sumKind('DISTRIBUTION')
  const recallable = sumKind('RECALLABLE_DISTRIBUTION')
  const total = ordinary + recallable
  if (ordinary === 0n || recallable === 0n) return null
  return <ChartCard title="Distribution mix" description="Gross settled distributions by type; announced amounts are excluded.">
    <DonutFigure
      parts={[
        { label: 'Non-recallable', value: ordinary, color: CHART_GREEN },
        { label: 'Recallable', value: recallable, color: CHART_AMBER },
      ]}
      centerValue={`${(Number(recallable) / Number(total) * 100).toFixed(1)}%`}
      centerLabel="recallable"
      ariaLabel={`Distribution mix: ${money(fromUnits(ordinary))} non-recallable and ${money(fromUnits(recallable))} recallable`}
    />
  </ChartCard>
}

export function InvestmentValueBridge({ performance: p }: { performance: InvestmentPerformance }) {
  if (!p.residualValueDate) return <ChartCard title="Investment value bridge" description="How capital paid, cash returned, fees, and remaining value combine.">
    <p className="px-4 py-10 text-center text-sm text-slate-500">Record a NAV / FMV valuation to show the current value bridge. No valuation is treated as unavailable.</p>
  </ChartCard>

  const paidIn = units(p.paidInCapital)
  const grossDistributions = units(p.grossDistributions)
  const fees = units(p.feesAndCarry)
  const residual = units(p.residualValue)
  const changes = [
    { label: 'Paid in', change: -paidIn, color: CHART_RED },
    { label: 'Gross returns', change: grossDistributions, color: CHART_GREEN },
    { label: 'Fees & carry', change: fees, color: CHART_AMBER },
    { label: 'Remaining NAV', change: residual, color: CHART_GREEN },
  ]
  let running = 0n
  const steps = changes.map((step) => {
    const start = running
    running += step.change
    return { ...step, start, end: running }
  })
  const total = running
  const levels = [0n, ...steps.flatMap((step) => [step.start, step.end])].map(fromUnits)
  const rawMin = Math.min(...levels)
  const rawMax = Math.max(...levels)
  const pad = Math.max((rawMax - rawMin) * 0.12, 1)
  const min = rawMin - pad
  const max = rawMax + pad
  const top = 22
  const bottom = 222
  const y = (value: bigint) => bottom - (fromUnits(value) - min) / (max - min) * (bottom - top)
  const centers = [76, 196, 316, 436, 556]
  const width = 72

  return <ChartCard title="Investment value bridge" description="Signed cash flows plus the latest recorded NAV; the final bar shows the current net position.">
    <div className="overflow-x-auto px-3 py-4">
      <svg width="632" height="286" viewBox="0 0 632 286" role="img" aria-label={`Investment value bridge: ${exactMoney(paidIn)} paid in, ${exactMoney(grossDistributions)} gross distributions, ${exactMoney(fees)} fees and carry, ${exactMoney(residual)} remaining NAV, ${exactMoney(total)} net position`} className="mx-auto max-w-none">
        <line x1="36" x2="606" y1={y(0n)} y2={y(0n)} stroke={GRID} strokeDasharray="4 4" />
        {steps.map((step, index) => {
          const upper = Math.min(y(step.start), y(step.end))
          const barHeight = Math.max(2, Math.abs(y(step.end) - y(step.start)))
          return <g key={step.label}>
            {step.change !== 0n ? <rect x={centers[index]! - width / 2} y={upper} width={width} height={barHeight} rx="3" fill={step.color}>
              <title>{step.label}: {exactMoney(step.change)}</title>
            </rect> : null}
            {index < steps.length - 1 ? <line x1={centers[index]! + width / 2} x2={centers[index + 1]! - width / 2} y1={y(step.end)} y2={y(step.end)} stroke="#94a3b8" strokeDasharray="3 3" /> : null}
            <text x={centers[index]} y="250" textAnchor="middle" fontSize="11" fill="#475569">{step.label}</text>
            <text x={centers[index]} y="268" textAnchor="middle" fontSize="11" fontWeight="600" fill="#17263a">{compactMoney(fromUnits(step.change))}</text>
          </g>
        })}
        {total !== 0n ? <rect x={centers[4]! - width / 2} y={Math.min(y(0n), y(total))} width={width} height={Math.max(2, Math.abs(y(total) - y(0n)))} rx="3" fill={total >= 0n ? CHART_BLUE : CHART_RED}>
          <title>Net position: {exactMoney(total)}</title>
        </rect> : null}
        <text x={centers[4]} y="250" textAnchor="middle" fontSize="11" fill="#475569">Net position</text>
        <text x={centers[4]} y="268" textAnchor="middle" fontSize="11" fontWeight="600" fill="#17263a">{compactMoney(fromUnits(total))}</text>
      </svg>
    </div>
    <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">NAV as of {shortDate(p.residualValueDate)}. Net position = net distributions + NAV - paid-in capital.</p>
  </ChartCard>
}

export function MagicPatternInvestmentVisuals({ events, performance }: { events: K1TrackerCashFlowEvent[]; performance: InvestmentPerformance }) {
  const hasDistributionMix = events.some((event) => event.settlementStatus !== 'ANNOUNCED' && event.kind === 'DISTRIBUTION' && units(event.amount) !== 0n)
    && events.some((event) => event.settlementStatus !== 'ANNOUNCED' && event.kind === 'RECALLABLE_DISTRIBUTION' && units(event.amount) !== 0n)
  return <section aria-label="Investment visual summary" className="space-y-4">
    <CashMovementChart events={events} />
    <div className="grid gap-4 xl:grid-cols-2">
      {hasDistributionMix ? <DistributionMix events={events} /> : null}
      <div className={hasDistributionMix ? 'min-w-0' : 'min-w-0 xl:col-span-2'}>
        <InvestmentValueBridge performance={performance} />
      </div>
    </div>
  </section>
}
