import type { K1TrackerCashFlowEvent } from '../../../../../../../packages/types/src/k1-tracker'
import type { ReactNode } from 'react'
import { colorTokens } from '../../../../../design-tokens.js'
import { MagicCard } from './MagicPatternPrimitives'

const CHART_GREEN = colorTokens.semantic.success.foreground
const CHART_AMBER = colorTokens.visualization.seriesFour
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
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}$${(absolute / 10_000n).toLocaleString('en-US')}.${String(absolute % 10_000n).padStart(4, '0')}`
}
const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
}).format(value)

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

export function MagicPatternInvestmentVisuals({ events }: { events: K1TrackerCashFlowEvent[] }) {
  const hasDistributionMix = events.some((event) => event.settlementStatus !== 'ANNOUNCED' && event.kind === 'DISTRIBUTION' && units(event.amount) !== 0n)
    && events.some((event) => event.settlementStatus !== 'ANNOUNCED' && event.kind === 'RECALLABLE_DISTRIBUTION' && units(event.amount) !== 0n)
  if (!hasDistributionMix) return null
  return <section aria-label="Investment visual summary">
    <DistributionMix events={events} />
  </section>
}
