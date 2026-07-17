import type {
  PartnershipAggregateGroup,
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

export const partnershipLedgerColumns: readonly PartnershipLedgerColumn[] = [
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
]

const unavailable = (reason: string) => `Not available: ${reason}`
const moneyText = (value: string | null | undefined, missing: string) => formatWholeMoney(value) ?? unavailable(missing)

const groupedStatus = (values: string[], empty: string) => values.length === 0
  ? empty
  : values.length === 1 ? humanizeCode(values[0]) : `Mixed (${values.length})`

export function partnershipLedgerExportValue(group: PartnershipAggregateGroup, columnId: PartnershipLedgerColumnId): string {
  const singleMember = group.members.length === 1 ? group.members[0] : undefined
  switch (columnId) {
    case 'partnership': return group.name
    case 'owner': return `${group.ownerCount} ${group.ownerCount === 1 ? 'owner' : 'owners'}`
    case 'type': return group.partnershipType
    case 'lifecycle': return groupedStatus(group.lifecycleStatuses, 'No lifecycle status')
    case 'workflow': return groupedStatus(group.workflowStatuses, 'No K-1 year')
    case 'commitment': return moneyText(group.totals.committedCapital.amount, 'No commitment')
    case 'paidIn': return moneyText(group.totals.paidInCapital.amount, 'No paid-in data')
    case 'distributions': return formatWholeMoney(group.totals.distributions.amount ?? '0.00') ?? '$0'
    case 'nav': {
      const amount = moneyText(group.totals.latestNav.amount, 'No NAV')
      const earliest = formatLedgerDate(group.totals.navValuationRange.earliest)
      const latest = formatLedgerDate(group.totals.navValuationRange.latest)
      const date = earliest && latest && earliest !== latest ? `${earliest} - ${latest}` : latest
      return date ? `${amount} - ${date}` : amount
    }
    case 'unfunded': return moneyText(group.totals.unfundedCommitment.amount, 'No unfunded commitment')
    case 'dpi': return formatMultiple(group.totals.dpi.value) ?? unavailable(humanizeCode(group.totals.dpi.status))
    case 'tvpi': return formatMultiple(group.totals.tvpi.value) ?? unavailable(humanizeCode(group.totals.tvpi.status))
    case 'irr': return singleMember ? formatPercent(singleMember.irr) ?? unavailable(humanizeCode(singleMember.performanceStatus.irr)) : 'Owner detail only'
    case 'taxYear': return group.latestTaxYear == null ? unavailable('No K-1 year') : String(group.latestTaxYear)
    case 'warnings': return String(group.warningCount)
    case 'quality': return humanizeCode(group.dataQuality)
  }
}
