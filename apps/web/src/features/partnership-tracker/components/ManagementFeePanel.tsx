import { Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'
import { usePartnershipManagementFees, usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'

const money = (value: string | null) => value == null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value))
const date = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
const statusText: Record<string, string> = {
  MISSING_INCEPTION_DATE: 'Add a partnership inception date to calculate fees.',
  MISSING_MANAGEMENT_FEE_RATE: 'Add an annual management fee rate to calculate fees.',
  MISSING_COMMITMENT: 'Add an effective committed-capital entry to calculate fees.',
}

export function ManagementFeePanel({ summary, canEdit }: { summary: PartnershipTrackerSummary; canEdit: boolean }) {
  const partnership = summary.partnership
  const estimate = usePartnershipManagementFees(partnership.id)
  const actions = usePartnershipTrackerActions()
  const [inceptionDate, setInceptionDate] = useState(partnership.inceptionDate ?? '')
  const [ratePercent, setRatePercent] = useState(partnership.managementFeeRate == null ? '' : String(Number(partnership.managementFeeRate) * 100))
  const [error, setError] = useState<string>()

  useEffect(() => {
    setInceptionDate(partnership.inceptionDate ?? '')
    setRatePercent(partnership.managementFeeRate == null ? '' : String(Number(partnership.managementFeeRate) * 100))
  }, [partnership.inceptionDate, partnership.managementFeeRate])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    const parsedRate = ratePercent === '' ? null : Number(ratePercent)
    if (parsedRate != null && (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100)) {
      setError('Management fee rate must be between 0% and 100%.')
      return
    }
    try {
      await actions.updatePartnership.mutateAsync({
        id: partnership.id,
        body: {
          inceptionDate: inceptionDate || null,
          managementFeeRate: parsedRate == null ? null : (parsedRate / 100).toFixed(8),
          expectedUpdatedAt: partnership.updatedAt,
        },
      })
    } catch {
      setError('Management fee configuration could not be saved.')
    }
  }

  return <section className="border border-gray-200 bg-white shadow-sm" aria-labelledby="management-fee-title">
    <div className="border-b border-gray-200 px-5 py-4"><h2 id="management-fee-title" className="text-base font-semibold text-gray-950">Management fees</h2><p className="mt-1 text-sm text-gray-500">Estimated from committed capital and active calendar days.</p></div>
    <form onSubmit={save} className="grid gap-4 border-b border-gray-200 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="text-sm font-medium text-gray-800">Partnership inception<input type="date" value={inceptionDate} max={new Date().toISOString().slice(0, 10)} disabled={!canEdit} onChange={(event) => setInceptionDate(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
      <label className="text-sm font-medium text-gray-800">Annual fee rate (%)<input type="number" min="0" max="100" step="0.0001" value={ratePercent} disabled={!canEdit} onChange={(event) => setRatePercent(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
      {canEdit && <button type="submit" disabled={actions.updatePartnership.isPending} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Save</button>}
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-3">{error}</p>}
    </form>
    <div className="px-5 py-4">
      {estimate.isLoading ? <p className="text-sm text-gray-500">Calculating management fees...</p> : estimate.isError ? <p role="alert" className="text-sm text-red-700">Management fee estimates could not be loaded.</p> : estimate.data ? <>
        <div className="flex flex-wrap items-baseline justify-between gap-3"><p className="text-sm text-gray-600">Calculated through {date(estimate.data.asOfDate)}</p><p className="text-sm font-medium text-gray-900">Cumulative estimate: {money(estimate.data.cumulativeEstimatedFee)}</p></div>
        {estimate.data.status !== 'AVAILABLE' && <p className="mt-3 text-sm text-amber-800">{statusText[estimate.data.status] ?? 'Management fee inputs are incomplete.'}</p>}
        {estimate.data.annualRows.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="p-2">Year</th><th className="p-2">Active period</th><th className="p-2">Days</th><th className="p-2">Weighted commitment</th><th className="p-2">Rate</th><th className="p-2 text-right">Estimated fee</th></tr></thead><tbody>{estimate.data.annualRows.map((row) => <tr key={row.calendarYear} className="border-b border-gray-100"><td className="p-2 font-medium">{row.calendarYear}</td><td className="p-2">{date(row.periodStart)} - {date(row.periodEnd)}</td><td className="p-2">{row.activeDays}/{row.daysInYear}</td><td className="p-2">{money(row.weightedCommittedCapital)}</td><td className="p-2">{(Number(row.annualRate) * 100).toFixed(2)}%</td><td className="p-2 text-right font-medium">{money(row.estimatedFee)}</td></tr>)}</tbody></table></div>}
      </> : null}
    </div>
  </section>
}
