import type { PartnershipNavEntry } from '../../../../../../packages/types/src/partnership-tracker'

const currency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
const fullCurrency = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value))

export function NavHistoryChart({ items }: { items: PartnershipNavEntry[] }) {
  if (!items.length) return <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">Add a NAV entry to start the historical plot.</div>
  const width = 760; const height = 280; const left = 72; const right = 22; const top = 24; const bottom = 42
  const times = items.map((item) => Date.parse(`${item.valuationDate}T00:00:00Z`))
  const values = items.map((item) => Number(item.amount))
  const minTime = Math.min(...times); const maxTime = Math.max(...times)
  const rawMin = Math.min(...values); const rawMax = Math.max(...values)
  const padding = rawMax === rawMin ? Math.max(rawMax * 0.1, 1) : (rawMax - rawMin) * 0.1
  const minValue = Math.max(0, rawMin - padding); const maxValue = rawMax + padding
  const x = (time: number) => left + (maxTime === minTime ? (width - left - right) / 2 : ((time - minTime) / (maxTime - minTime)) * (width - left - right))
  const y = (value: number) => top + ((maxValue - value) / (maxValue - minValue || 1)) * (height - top - bottom)
  const points = items.map((item, index) => ({ item, x: x(times[index]!), y: y(values[index]!) }))
  const trend = values.at(-1)! - values[0]!
  const trendText = items.length === 1 ? `One NAV observation of ${fullCurrency(items[0]!.amount)}.` : `NAV ${trend === 0 ? 'was unchanged' : trend > 0 ? 'increased' : 'decreased'} by ${fullCurrency(String(Math.abs(trend)))} from the first observation to the latest.`
  const ticks = [0, 0.5, 1].map((fraction) => ({ value: minValue + (maxValue - minValue) * fraction, y: y(minValue + (maxValue - minValue) * fraction) }))
  return <figure aria-labelledby="nav-chart-title nav-chart-summary"><figcaption id="nav-chart-title" className="sr-only">Historical NAV line chart</figcaption><p id="nav-chart-summary" className="mb-3 text-sm text-gray-600">{trendText}</p><div className="w-full overflow-hidden"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="NAV values plotted proportionally by valuation date" className="h-auto w-full min-w-[32rem]" preserveAspectRatio="xMidYMid meet">
    {ticks.map((tick) => <g key={tick.value}><line x1={left} x2={width - right} y1={tick.y} y2={tick.y} stroke="#e5e7eb" /><text x={left - 8} y={tick.y + 4} textAnchor="end" fontSize="11" fill="#6b7280">{currency(tick.value)}</text></g>)}
    <line x1={left} x2={left} y1={top} y2={height - bottom} stroke="#9ca3af" /><line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="#9ca3af" />
    {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#b08d57" strokeWidth="3" strokeLinejoin="round" className="motion-reduce:transition-none" />}
    {points.map((point, index) => <g key={point.item.id}><circle cx={point.x} cy={point.y} r="5" fill="#b08d57" stroke="white" strokeWidth="2" tabIndex={0} role="img" aria-label={`${point.item.valuationDate}: ${fullCurrency(point.item.amount)}`}><title>{point.item.valuationDate}: {fullCurrency(point.item.amount)}</title></circle>{(index === 0 || index === points.length - 1) && <text x={point.x} y={height - 17} textAnchor={index === 0 ? 'start' : 'end'} fontSize="11" fill="#6b7280">{point.item.valuationDate}</text>}</g>)}
  </svg></div></figure>
}
