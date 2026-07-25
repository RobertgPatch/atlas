import { moneyToCents } from '../k1-tracker/k1-tracker.calculation.js'
import {
  PARTNERSHIP_TYPES,
  PRIVATE_INVESTMENT_ACTIVITY_TYPES,
  type EntityFundPosition,
  type PrivateInvestmentActivityRow,
  type PrivateInvestmentActivityType,
  type PrivateInvestmentFacetSet,
  type PrivateInvestmentQuery,
  type PrivateInvestmentTrackerResponse,
  type PartnershipType,
  type PartnershipTrackerSummary,
} from './partnership-tracker.contracts.js'

export type PrivateInvestmentSourceRow = {
  sourceId: string
  sourceKind: 'NET_CASH_ACTIVITY' | 'CAPITAL_AND_NAV'
  entityId: string
  entityName: string
  partnershipId: string
  partnershipName: string
  date: string
  type: PrivateInvestmentActivityType
  amount: string
  sourceType: string
  note: string | null
  createdAt: string
}

const typeOrder = new Map(PRIVATE_INVESTMENT_ACTIVITY_TYPES.map((type, index) => [type, index]))
const today = (): string => new Date().toISOString().slice(0, 10)

export const comparePrivateInvestmentActivities = (
  left: PrivateInvestmentActivityRow,
  right: PrivateInvestmentActivityRow,
): number =>
  right.date.localeCompare(left.date)
  || right.createdAt.localeCompare(left.createdAt)
  || (typeOrder.get(left.type) ?? 0) - (typeOrder.get(right.type) ?? 0)
  || left.sourceId.localeCompare(right.sourceId)

export const mapPrivateInvestmentActivity = (row: PrivateInvestmentSourceRow): PrivateInvestmentActivityRow => ({
  rowId: `${row.sourceKind}:${row.sourceId}`,
  sourceId: row.sourceId,
  sourceKind: row.sourceKind,
  entity: { id: row.entityId, name: row.entityName },
  partnership: { id: row.partnershipId, name: row.partnershipName },
  date: row.date,
  type: row.type,
  amount: row.amount,
  displayDirection: row.type === 'CAPITAL_CALL'
    ? 'OUTFLOW'
    : row.type === 'VALUATION' ? 'POINT_IN_TIME' : 'INFLOW',
  sourceType: row.sourceType,
  note: row.note,
  createdAt: row.createdAt,
})

export const mapSummaryToEntityFundPosition = (summary: PartnershipTrackerSummary): EntityFundPosition => ({
  positionKey: `${summary.partnership.entity.id}:${summary.partnership.id}`,
  entity: summary.partnership.entity,
  partnership: { id: summary.partnership.id, name: summary.partnership.name },
  assetClass: summary.partnership.partnershipType,
  status: summary.partnership.status,
  metricScope: 'LIFETIME_FOR_MATCHED_POSITION',
  totalCommitted: summary.currentCommittedCapital,
  remainingCommitment: summary.unfundedCommitmentAmount,
  vintageYear: summary.vintageYear,
  totalInvested: summary.totalCapitalContributions ?? '0.00',
  nonRecallableDistributions: summary.totalDistributions ?? '0.00',
  recallableDistributions: summary.totalRecallableDistributions,
  latestValuation: summary.latestNav,
  dpi: summary.dpi,
  tvpi: summary.tvpi,
  xirr: summary.irr,
  xirrTerminalDate: summary.irrTerminalDate,
  xirrUsesCarriedForwardNav: summary.irrUsesCarriedForwardNav,
  simplifiedIrr: summary.simplifiedIrr,
  displayIrr: summary.displayIrr,
  irrType: summary.irrType,
  availability: {
    remainingCommitment: summary.performanceStatus.unfundedCommitment,
    dpi: summary.performanceStatus.dpi,
    tvpi: summary.performanceStatus.tvpi,
    xirr: summary.performanceStatus.irr,
    simplifiedIrr: summary.simplifiedIrr == null
      ? summary.performanceStatus.tvpi === 'AVAILABLE' ? 'INSUFFICIENT_HOLDING_PERIOD' : summary.performanceStatus.tvpi
      : 'AVAILABLE',
  },
})

const amountMagnitude = (value: string): bigint => {
  const cents = moneyToCents(value) ?? 0n
  return cents < 0n ? -cents : cents
}

const normalizeScopedQuery = (
  query: PrivateInvestmentQuery,
  summaries: PartnershipTrackerSummary[],
): PrivateInvestmentQuery => {
  const validEntityIds = new Set(summaries.map((summary) => summary.partnership.entity.id))
  const validAssetClasses = new Set(summaries.map((summary) => summary.partnership.partnershipType))
  const assetClasses = query.assetClasses.filter((assetClass) => validAssetClasses.has(assetClass))
  const entityIds = query.entityIds.filter((id) => validEntityIds.has(id)).sort()
  const validPartnershipIds = new Set(
    summaries
      .filter((summary) => (
        (!assetClasses.length || assetClasses.includes(summary.partnership.partnershipType))
        && (!entityIds.length || entityIds.includes(summary.partnership.entity.id))
      ))
      .map((summary) => summary.partnership.id),
  )
  return {
    ...query,
    assetClasses,
    entityIds,
    partnershipIds: query.partnershipIds.filter((id) => validPartnershipIds.has(id)).sort(),
  }
}

const matchesQuery = (
  row: PrivateInvestmentActivityRow,
  query: PrivateInvestmentQuery,
  assetClassesByPartnershipId: ReadonlyMap<string, PartnershipType>,
): boolean => {
  const assetClass = assetClassesByPartnershipId.get(row.partnership.id)
  if (query.assetClasses.length && (!assetClass || !query.assetClasses.includes(assetClass))) return false
  if (query.entityIds.length && !query.entityIds.includes(row.entity.id)) return false
  if (query.partnershipIds.length && !query.partnershipIds.includes(row.partnership.id)) return false
  if (query.dateFrom && row.date < query.dateFrom) return false
  if (query.dateTo && row.date > query.dateTo) return false
  const amount = amountMagnitude(row.amount)
  if (query.amountMin && amount < amountMagnitude(query.amountMin)) return false
  if (query.amountMax && amount > amountMagnitude(query.amountMax)) return false
  return true
}

export const composePrivateInvestmentFacets = (
  baseActivities: PrivateInvestmentActivityRow[],
  summaries: PartnershipTrackerSummary[] = [],
): PrivateInvestmentFacetSet => {
  const assetClassCounts = new Map<PartnershipType, number>()
  const entities = new Map<string, { label: string; count: number }>()
  const partnerships = new Map<string, {
    label: string
    count: number
    entityId: string
    entityName: string
    assetClass: PartnershipType
  }>()
  for (const summary of summaries) {
    const { partnership } = summary
    assetClassCounts.set(partnership.partnershipType, assetClassCounts.get(partnership.partnershipType) ?? 0)
    entities.set(partnership.entity.id, { label: partnership.entity.name, count: 0 })
    partnerships.set(partnership.id, {
      label: partnership.name,
      count: 0,
      entityId: partnership.entity.id,
      entityName: partnership.entity.name,
      assetClass: partnership.partnershipType,
    })
  }
  for (const row of baseActivities) {
    const entity = entities.get(row.entity.id)
    entities.set(row.entity.id, { label: row.entity.name, count: (entity?.count ?? 0) + 1 })
    const partnership = partnerships.get(row.partnership.id)
    if (partnership) {
      assetClassCounts.set(partnership.assetClass, (assetClassCounts.get(partnership.assetClass) ?? 0) + 1)
    }
    partnerships.set(row.partnership.id, {
      label: row.partnership.name,
      count: (partnership?.count ?? 0) + 1,
      entityId: row.entity.id,
      entityName: row.entity.name,
      assetClass: partnership?.assetClass ?? 'Other',
    })
  }
  return {
    assetClasses: PARTNERSHIP_TYPES
      .filter((assetClass) => assetClassCounts.has(assetClass))
      .map((assetClass) => ({
      value: assetClass,
      label: assetClass,
      count: assetClassCounts.get(assetClass) ?? 0,
    })),
    entities: [...entities.entries()]
      .map(([value, option]) => ({ value, ...option }))
      .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value)),
    partnerships: [...partnerships.entries()]
      .map(([value, option]) => ({ value, ...option }))
      .sort((left, right) => left.label.localeCompare(right.label)
        || left.entityName.localeCompare(right.entityName)
        || left.value.localeCompare(right.value)),
  }
}

export type PrivateInvestmentComposition = PrivateInvestmentTrackerResponse & {
  allMatchingActivities: PrivateInvestmentActivityRow[]
}

export const composePrivateInvestmentTracker = (
  summaries: PartnershipTrackerSummary[],
  activityRows: PrivateInvestmentSourceRow[] | PrivateInvestmentActivityRow[],
  requestedQuery: PrivateInvestmentQuery,
  asOfDate = today(),
): PrivateInvestmentComposition => {
  const baseActivities = activityRows.map((row) => 'rowId' in row ? row : mapPrivateInvestmentActivity(row))
    .sort(comparePrivateInvestmentActivities)
  const query = normalizeScopedQuery(requestedQuery, summaries)
  const assetClassesByPartnershipId = new Map(
    summaries.map((summary) => [summary.partnership.id, summary.partnership.partnershipType] as const),
  )
  const allMatchingActivities = baseActivities.filter((row) => matchesQuery(row, query, assetClassesByPartnershipId))
  const matchingPartnershipIds = new Set(allMatchingActivities.map((row) => row.partnership.id))
  const hasActivityFilters = query.dateFrom != null
    || query.dateTo != null
    || query.amountMin != null
    || query.amountMax != null
  const positions = summaries
    .filter((summary) => (
      (!query.assetClasses.length || query.assetClasses.includes(summary.partnership.partnershipType))
      && (!query.entityIds.length || query.entityIds.includes(summary.partnership.entity.id))
      && (!query.partnershipIds.length || query.partnershipIds.includes(summary.partnership.id))
      && (!hasActivityFilters || matchingPartnershipIds.has(summary.partnership.id))
    ))
    .map(mapSummaryToEntityFundPosition)
    .sort((left, right) =>
      left.entity.name.localeCompare(right.entity.name)
      || left.partnership.name.localeCompare(right.partnership.name)
      || left.positionKey.localeCompare(right.positionKey))
  const totalItems = allMatchingActivities.length
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize)
  const page = totalPages === 0 ? 1 : Math.min(query.page, totalPages)
  const start = (page - 1) * query.pageSize
  const normalizedQuery = { ...query, page }

  return {
    query: normalizedQuery,
    positionMetricScope: 'LIFETIME_FOR_MATCHED_POSITIONS',
    positions,
    facets: composePrivateInvestmentFacets(baseActivities, summaries),
    activities: allMatchingActivities.slice(start, start + query.pageSize),
    pageInfo: {
      page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
    asOfDate,
    allMatchingActivities,
  }
}
