import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { K1TrackerYearSummary } from '../../../../../packages/types/src/k1-tracker'

const currency = (value: string | null) => value == null
  ? 'Not available'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value))

const rows: Array<{ label: string; render: (year: K1TrackerYearSummary) => string }> = [
  { label: 'Capital Contributed', render: (year) => currency(year.capitalContributed) },
  { label: 'Distributions', render: (year) => currency(year.distributions) },
  { label: 'Ending Outside Basis', render: (year) => currency(year.endingOutsideBasis) },
]

export function CompareYearsDrawer({
  years,
  onClose,
}: {
  years: K1TrackerYearSummary[]
  selectedYear?: number
  onClose: () => void
}) {
  const availableYears = useMemo(() => years.map((year) => year.taxYear), [years])
  const [chosen, setChosen] = useState<number[]>(availableYears)
  const displayed = useMemo(() => years.filter((year) => chosen.includes(year.taxYear)), [chosen, years])
  const minimumWidth = 12 + displayed.length * 8

  const toggleYear = (taxYear: number) => {
    setChosen((current) => {
      if (!current.includes(taxYear)) return [...current, taxYear]
      return current.length === 1 ? current : current.filter((item) => item !== taxYear)
    })
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/40" role="presentation">
    <div className="flex h-[100dvh] w-full min-h-0 flex-col bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Compare tracker years">
      <div className="flex flex-none items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
        <div><h2 className="text-lg font-semibold text-gray-950">Compare years</h2><p className="text-sm text-gray-500">Select any available years.</p></div>
        <button type="button" onClick={onClose} aria-label="Close year comparison" className="rounded-md p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 p-5">
        <fieldset className="flex-none">
          <legend className="text-sm font-medium text-gray-800">Years</legend>
          <div className="mt-2 flex flex-wrap gap-2">{years.map((year) => {
            const active = chosen.includes(year.taxYear)
            return <button key={year.taxYear} type="button" aria-pressed={active} onClick={() => toggleYear(year.taxYear)} className={`rounded-md border px-3 py-2 text-sm ${active ? 'border-atlas-gold bg-amber-50' : 'border-gray-300'}`}>{year.taxYear}</button>
          })}</div>
        </fieldset>
        <div data-testid="compare-years-table-scroll" className="min-h-0 flex-1 overflow-auto border-y border-gray-200">
          <table className="w-full table-fixed text-left text-sm" style={{ minWidth: `${minimumWidth}rem` }}>
            <colgroup><col style={{ width: '12rem' }} />{displayed.map((year) => <col key={year.taxYear} style={{ minWidth: '8rem' }} />)}</colgroup>
            <thead className="sticky top-0 z-20 bg-white text-xs uppercase text-gray-500"><tr><th className="sticky left-0 z-30 w-48 bg-white p-3">Metric</th>{displayed.map((year) => <th key={year.taxYear} className="min-w-32 p-3">{year.taxYear}</th>)}</tr></thead>
            <tbody>{rows.map((row) => <tr key={row.label} className="border-t border-gray-100"><th className="sticky left-0 z-10 bg-white p-3 font-medium text-gray-700">{row.label}</th>{displayed.map((year) => <td key={year.taxYear} className="p-3 align-top">{row.render(year)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
}
