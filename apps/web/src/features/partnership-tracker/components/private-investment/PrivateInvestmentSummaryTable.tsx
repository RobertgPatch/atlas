import type { EntityFundPosition } from '../../../../../../../packages/types/src/partnership-tracker'
import { formatAccountingMoney, formatDate, formatMultiple, formatRatio, humanizePrivateInvestmentCode } from './privateInvestmentFormatting'

export function PrivateInvestmentSummaryTable({ positions }: { positions: EntityFundPosition[] }) {
  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
      <table className="w-full min-w-[1160px] border-collapse text-left text-xs">
        <caption className="sr-only">Lifetime investment metrics for matching entity-fund positions</caption>
        <thead>
          <tr className="border-b border-gray-300 bg-gray-50 text-gray-600">
            {['Entity', 'Fund', 'Asset Class', 'Total Committed', 'Remaining Commitment', 'Status', 'Vintage', 'Total Invested', 'Valuation', 'DPI', 'TVPI', 'Return'].map((label, index) => (
              <th key={label} scope="col" className={`whitespace-nowrap border-r border-gray-200 px-3 py-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] ${index < 2 ? 'sticky z-20 bg-gray-50' : ''}`} style={index === 0 ? { left: 0, minWidth: 180 } : index === 1 ? { left: 180, minWidth: 230 } : undefined}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((row) => (
            <tr key={row.positionKey} className="group border-b border-gray-200 bg-white transition-colors hover:bg-jackson-light">
              <th scope="row" className="sticky left-0 z-10 min-w-[180px] max-w-[180px] border-l-4 border-l-jackson-gold border-r border-gray-200 bg-white py-3 pl-3 pr-3 font-semibold text-gray-950 group-hover:bg-jackson-light">{row.entity.name}</th>
              <td className="sticky left-[180px] z-10 min-w-[230px] max-w-[230px] border-r border-gray-200 bg-white px-3 py-3 font-semibold text-gray-950 group-hover:bg-jackson-light">{row.partnership.name}</td>
              <td className="whitespace-nowrap px-3 py-3 text-gray-700">{row.assetClass}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums" title={row.totalCommitted ? `Effective ${formatDate(row.totalCommitted.date)}` : 'No effective commitment'}>{formatAccountingMoney(row.totalCommitted?.amount)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">{formatAccountingMoney(row.remainingCommitment)}</td>
              <td className="whitespace-nowrap px-3 py-3"><span className="rounded-sm bg-gray-50 px-2 py-1 text-[0.65rem] font-bold tracking-wide text-gray-700 ring-1 ring-inset ring-gray-300">{row.status}</span></td>
              <td className="px-3 py-3 text-center font-mono tabular-nums">{row.vintageYear ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-gray-900">{formatAccountingMoney(row.totalInvested, 'OUTFLOW')}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums" title={row.latestValuation ? `Valued ${formatDate(row.latestValuation.date)}` : 'No valuation entered'}>{formatAccountingMoney(row.latestValuation?.amount)}</td>
              <td className="px-3 py-3 text-right font-mono tabular-nums">{formatMultiple(row.dpi)}</td>
              <td className="px-3 py-3 text-right font-mono tabular-nums">{formatMultiple(row.tvpi)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums" title={row.irrType ? `${row.irrType} through ${formatDate(row.xirrTerminalDate)}` : humanizePrivateInvestmentCode(row.availability.xirr)}>{formatRatio(row.displayIrr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
