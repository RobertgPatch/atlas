import type { PrivateInvestmentActivityRow, PrivateInvestmentPageInfo } from '../../../../../../../packages/types/src/partnership-tracker'
import { formatAccountingMoney, formatDate, humanizePrivateInvestmentCode, privateInvestmentSourceLabel } from './privateInvestmentFormatting'

export function PrivateInvestmentActivityTable({
  activities,
  pageInfo,
  onPageChange,
  onPageSizeChange,
}: {
  activities: PrivateInvestmentActivityRow[]
  pageInfo: PrivateInvestmentPageInfo
  onPageChange: (page: number) => void
  onPageSizeChange: (size: 25 | 50 | 100) => void
}) {
  return (
    <div>
      <div className="max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <caption className="sr-only">Filtered cash flow and valuation activity, newest first</caption>
          <thead><tr className="border-b border-gray-300 bg-gray-50 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-600">{['Entity', 'Fund', 'Date', 'Cash Flow / Value', 'Type', 'Source'].map((label, index) => <th key={label} scope="col" className={`border-r border-gray-200 px-3 py-3 ${index === 0 ? 'sticky left-0 z-20 bg-gray-50' : ''}`}>{label}</th>)}</tr></thead>
          <tbody>
            {activities.map((row) => (
              <tr key={row.rowId} className="group border-b border-gray-200 bg-white transition-colors hover:bg-jackson-light">
                <th scope="row" className="sticky left-0 z-10 min-w-[180px] border-l-4 border-l-jackson-gold border-r border-gray-200 bg-white py-3 pl-3 pr-3 font-semibold text-gray-950 group-hover:bg-jackson-light">{row.entity.name}</th>
                <td className="px-3 py-3 font-medium text-gray-900">{row.partnership.name}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs tabular-nums">{formatDate(row.date)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums ${row.displayDirection === 'OUTFLOW' ? 'text-red-800' : row.displayDirection === 'INFLOW' ? 'text-emerald-800' : 'text-gray-900'}`}>{formatAccountingMoney(row.amount, row.displayDirection)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold">{humanizePrivateInvestmentCode(row.type)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-600" title={row.sourceType}>{privateInvestmentSourceLabel(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-gray-300 bg-white px-4 py-3 sm:flex-row sm:items-center">
        <label className="mr-auto flex min-h-11 items-center gap-2 text-sm text-gray-600">
          Rows per page
          <select value={pageInfo.pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value) as 25 | 50 | 100)} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 font-semibold text-gray-900 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30">
            <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </label>
        <p className="text-sm tabular-nums text-gray-600">Page {pageInfo.page} of {Math.max(1, pageInfo.totalPages)}</p>
        <div className="flex gap-2">
          <button type="button" disabled={!pageInfo.hasPreviousPage} onClick={() => onPageChange(pageInfo.page - 1)} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Previous</button>
          <button type="button" disabled={!pageInfo.hasNextPage} onClick={() => onPageChange(pageInfo.page + 1)} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Next</button>
        </div>
      </div>
    </div>
  )
}
