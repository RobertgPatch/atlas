import type {
  PartnershipAggregateRow,
  PartnershipAggregationResponse,
} from '../../../../../packages/types/src/partnership-tracker'

export type InvestmentGroupBy = 'fund' | 'assetClass' | 'entity' | 'none'
export type InvestmentSortDirection = 'asc' | 'desc'

export type InvestmentPositionStatus = 'Active' | 'Pending' | 'Winding down' | 'Closed'

export interface InvestmentActivityRecord {
  id: string
  fundId: string
  fundName: string
  sponsor: string | null
  assetClass: string
  ownerId: string
  ownerName: string
  ownerType: string
  vintage: number | null
  commitment: number | null
  invested: number | null
  unfunded: number | null
  distributions: number | null
  currentValue: number | null
  lastActivityDate: string | null
  lastActivityType: string | null
  status: InvestmentPositionStatus
}

export interface InvestmentActivityTotals {
  commitment: number | null
  invested: number | null
  unfunded: number | null
  distributions: number | null
  currentValue: number | null
}

export interface InvestmentFundOption {
  id: string
  name: string
  assetClass: string
  owners: Array<{
    id: string
    recordId: string
    name: string
    ownerType: string
    assetClass: string
  }>
}

const moneyToNumber = (value: string | null | undefined) => {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const statusLabel = (value: PartnershipAggregateRow['partnership']['status']): InvestmentPositionStatus => {
  if (value === 'PENDING') return 'Pending'
  if (value === 'LIQUIDATED') return 'Winding down'
  if (value === 'CLOSED') return 'Closed'
  return 'Active'
}

const latestActivity = (row: PartnershipAggregateRow) => {
  const candidates = [
    row.latestNav?.date ? { date: row.latestNav.date, type: 'Valuation' } : null,
    row.currentCommittedCapital?.date
      ? { date: row.currentCommittedCapital.date, type: 'Commitment' }
      : null,
    row.performanceAsOfDate
      ? { date: row.performanceAsOfDate, type: 'Portfolio update' }
      : null,
  ].filter((candidate): candidate is { date: string; type: string } => candidate !== null)

  return candidates.sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
}

export function recordsFromAggregation(
  aggregation: PartnershipAggregationResponse,
  entityTypes: ReadonlyMap<string, string> = new Map(),
): InvestmentActivityRecord[] {
  return aggregation.items.flatMap((group) =>
    group.members.map((row) => {
      const activity = latestActivity(row)
      const vintageText = row.partnership.inceptionDate?.slice(0, 4)
      const vintage = vintageText && /^\d{4}$/.test(vintageText) ? Number(vintageText) : null

      return {
        id: row.partnership.id,
        fundId: group.groupKey,
        fundName: group.name,
        sponsor: row.partnership.fundManager,
        assetClass: row.partnership.partnershipType,
        ownerId: row.partnership.entity.id,
        ownerName: row.partnership.entity.name,
        ownerType: entityTypes.get(row.partnership.entity.id) ?? 'Entity',
        vintage,
        commitment: moneyToNumber(row.currentCommittedCapital?.amount),
        invested: moneyToNumber(row.totalCapitalContributions),
        unfunded: moneyToNumber(row.unfundedCommitmentAmount),
        distributions: moneyToNumber(row.totalDistributions),
        currentValue: moneyToNumber(row.latestNav?.amount),
        lastActivityDate: activity?.date ?? null,
        lastActivityType: activity?.type ?? null,
        status: statusLabel(row.partnership.status),
      }
    }),
  )
}

function sumKnown(
  rows: InvestmentActivityRecord[],
  pick: (row: InvestmentActivityRecord) => number | null,
) {
  let total = 0
  let known = 0
  for (const row of rows) {
    const value = pick(row)
    if (value == null) continue
    total += value
    known += 1
  }
  return known === 0 ? null : total
}

export function totalsOf(rows: InvestmentActivityRecord[]): InvestmentActivityTotals {
  return {
    commitment: sumKnown(rows, (row) => row.commitment),
    invested: sumKnown(rows, (row) => row.invested),
    unfunded: sumKnown(rows, (row) => row.unfunded),
    distributions: sumKnown(rows, (row) => row.distributions),
    currentValue: sumKnown(rows, (row) => row.currentValue),
  }
}

export function multipleOf(
  totals: Pick<InvestmentActivityTotals, 'invested' | 'distributions' | 'currentValue'>,
) {
  if (totals.invested == null || totals.invested <= 0) return null
  if (totals.distributions == null || totals.currentValue == null) return null
  return (totals.distributions + totals.currentValue) / totals.invested
}

export function buildFundOptions(records: InvestmentActivityRecord[]): InvestmentFundOption[] {
  const funds = new Map<string, InvestmentFundOption>()
  for (const record of records) {
    const owner = {
      id: record.ownerId,
      recordId: record.id,
      name: record.ownerName,
      ownerType: record.ownerType,
      assetClass: record.assetClass,
    }
    const existing = funds.get(record.fundId)
    if (existing) existing.owners.push(owner)
    else {
      funds.set(record.fundId, {
        id: record.fundId,
        name: record.fundName,
        assetClass: record.assetClass,
        owners: [owner],
      })
    }
  }

  return [...funds.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function formatCurrency(value: number | null, decimals = 0) {
  if (value == null) return '—'
  const formatted = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return value < 0 ? `(${formatted})` : formatted
}

export function formatCompactCurrency(value: number | null) {
  if (value == null) return 'Not available'
  const absolute = Math.abs(value)
  const formatted = absolute >= 1_000_000_000
    ? `$${(absolute / 1_000_000_000).toFixed(2)}B`
    : absolute >= 1_000_000
      ? `$${(absolute / 1_000_000).toFixed(2)}M`
      : absolute >= 1_000
        ? `$${(absolute / 1_000).toFixed(1)}K`
        : `$${absolute.toFixed(0)}`
  return value < 0 ? `(${formatted})` : formatted
}

export function formatMultiple(value: number | null) {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}x`
}

export function formatPercent(value: number | null, decimals = 1) {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(decimals)}%`
}

export function formatDate(value: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!match) return value ?? '—'
  return `${match[2]}/${match[3]}/${match[1]}`
}

const csvCell = (value: string | number | null) => {
  if (value == null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildInvestmentCsv(records: InvestmentActivityRecord[]) {
  const header = [
    'Fund',
    'Asset class',
    'Owner entity',
    'Entity type',
    'Vintage',
    'Commitment',
    'Total invested',
    'Unfunded',
    'Distributions',
    'Current value',
    'Net multiple',
    'Last activity',
    'Status',
  ]
  const rows = records.map((record) => [
    record.fundName,
    record.assetClass,
    record.ownerName,
    record.ownerType,
    record.vintage,
    record.commitment,
    record.invested,
    record.unfunded,
    record.distributions,
    record.currentValue,
    multipleOf(record),
    record.lastActivityDate,
    record.status,
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
