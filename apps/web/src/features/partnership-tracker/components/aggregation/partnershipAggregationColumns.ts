import type {
  PartnershipAggregateRow,
  PartnershipAggregationSort,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { formatLedgerDate, formatMultiple, formatPercent, formatWholeMoney, humanizeCode } from './aggregationFormatters'

export type PartnershipLedgerColumnId =
  | 'partnership' | 'owner' | 'type' | 'lifecycle' | 'workflow' | 'commitment'
  | 'paidIn' | 'distributions' | 'nav' | 'unfunded' | 'dpi' | 'tvpi' | 'irr'
  | 'taxYear' | 'warnings' | 'quality'

export interface PartnershipLedgerColumn {
  id: PartnershipLedgerColumnId
  label: string
  sort?: PartnershipAggregationSort
  width: number
  minWidth: number
}

export const partnershipLedgerColumns = [
  { id: 'partnership', label: 'Partnership', sort: 'partnership', width: 240, minWidth: 180 },
  { id: 'owner', label: 'Owner', sort: 'owner', width: 190, minWidth: 140 },
  { id: 'type', label: 'Type', sort: 'type', width: 145, minWidth: 115 },
  { id: 'lifecycle', label: 'Lifecycle', sort: 'status', width: 130, minWidth: 110 },
  { id: 'workflow', label: 'K-1 workflow', width: 150, minWidth: 120 },
  { id: 'commitment', label: 'Commitment', sort: 'commitment', width: 142, minWidth: 120 },
  { id: 'paidIn', label: 'Paid in', sort: 'paidIn', width: 132, minWidth: 112 },
  { id: 'distributions', label: 'Distributions', sort: 'distributions', width: 145, minWidth: 120 },
  { id: 'nav', label: 'Latest NAV', sort: 'nav', width: 155, minWidth: 125 },
  { id: 'unfunded', label: 'Unfunded', sort: 'unfunded', width: 142, minWidth: 120 },
  { id: 'dpi', label: 'DPI', sort: 'dpi', width: 94, minWidth: 82 },
  { id: 'tvpi', label: 'TVPI', sort: 'tvpi', width: 94, minWidth: 82 },
  { id: 'irr', label: 'IRR', sort: 'irr', width: 94, minWidth: 82 },
  { id: 'taxYear', label: 'Tax year', sort: 'latestTaxYear', width: 100, minWidth: 88 },
  { id: 'warnings', label: 'Warnings', sort: 'warningCount', width: 100, minWidth: 88 },
  { id: 'quality', label: 'Quality', width: 130, minWidth: 105 },
] as const satisfies readonly PartnershipLedgerColumn[]

const unavailable = (reason: string) => `Not available: ${reason}`
const moneyText = (value: string | null | undefined, missing: string) => formatWholeMoney(value) ?? unavailable(missing)

export function partnershipLedgerExportValue(row: PartnershipAggregateRow, columnId: PartnershipLedgerColumnId): string {
  switch (columnId) {
    case 'partnership': return row.partnership.name
    case 'owner': return row.partnership.entity.name
    case 'type': return row.partnership.partnershipType
    case 'lifecycle': return humanizeCode(row.partnership.status)
    case 'workflow': return row.latestWorkflowStatus ? humanizeCode(row.latestWorkflowStatus) : 'No K-1 year'
    case 'commitment': return moneyText(row.currentCommittedCapital?.amount, 'No commitment')
    case 'paidIn': return moneyText(row.totalCapitalContributions, 'No paid-in data')
    case 'distributions': return formatWholeMoney(row.totalDistributions ?? '0.00') ?? '$0'
    case 'nav': {
      const amount = moneyText(row.latestNav?.amount, 'No NAV')
      const date = formatLedgerDate(row.latestNav?.date)
      return date ? `${amount} - ${date}` : amount
    }
    case 'unfunded': return moneyText(row.unfundedCommitmentAmount, humanizeCode(row.performanceStatus.unfundedCommitment))
    case 'dpi': return formatMultiple(row.dpi) ?? unavailable(humanizeCode(row.performanceStatus.dpi))
    case 'tvpi': return formatMultiple(row.tvpi) ?? unavailable(humanizeCode(row.performanceStatus.tvpi))
    case 'irr': return formatPercent(row.irr) ?? unavailable(humanizeCode(row.performanceStatus.irr))
    case 'taxYear': return row.latestTaxYear == null ? unavailable('No K-1 year') : String(row.latestTaxYear)
    case 'warnings': return String(row.warningCount)
    case 'quality': return humanizeCode(row.dataQuality)
  }
}
