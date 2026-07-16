import type {
  PartnershipAggregateRow,
  PartnershipAggregationCoveredMoney,
  PartnershipAggregationCoveredRatio,
  PartnershipAggregationFacetOption,
  PartnershipAggregationFacetSet,
  PartnershipAggregationQuery,
  PartnershipAggregationResponse,
  PartnershipAggregationWorkflow,
  PartnershipDataQuality,
  PartnershipLifecycleStatus,
  PartnershipTrackerSummary,
  PartnershipType,
} from './partnership-tracker.contracts.js'
import {
  PARTNERSHIP_AGGREGATION_SORTS,
  PARTNERSHIP_AGGREGATION_WORKFLOWS,
  PARTNERSHIP_DATA_QUALITIES,
  PARTNERSHIP_TYPES,
} from './partnership-tracker.contracts.js'

const LIFECYCLE_STATUSES: PartnershipLifecycleStatus[] = ['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED']
const RATIO_SCALE = 100_000_000n

export const DEFAULT_PARTNERSHIP_AGGREGATION_QUERY: PartnershipAggregationQuery = {
  ownerIds: [],
  partnershipTypes: [],
  statuses: [],
  workflowStatuses: [],
  dataQuality: [],
  sort: 'partnership',
  direction: 'asc',
  page: 1,
  pageSize: 50,
}

const unique = <T>(values: readonly T[]) => [...new Set(values)]

const moneyToCents = (value: string): bigint => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new Error(`Invalid exact money value: ${value}`)
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))
  return match[1] ? -cents : cents
}

const centsToMoney = (value: bigint): string => {
  const negative = value < 0n
  const absolute = negative ? -value : value
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

const decimalToUnits = (value: string, places = 8): bigint => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) throw new Error(`Invalid decimal value: ${value}`)
  const fractional = (match[3] ?? '').padEnd(places, '0').slice(0, places)
  const units = BigInt(match[2]) * (10n ** BigInt(places)) + BigInt(fractional || '0')
  return match[1] ? -units : units
}

const ratioFromCents = (numerator: bigint, denominator: bigint): string | null => {
  if (denominator === 0n) return null
  const negative = (numerator < 0n) !== (denominator < 0n)
  const absoluteNumerator = numerator < 0n ? -numerator : numerator
  const absoluteDenominator = denominator < 0n ? -denominator : denominator
  const scaled = absoluteNumerator * RATIO_SCALE
  let units = scaled / absoluteDenominator
  if ((scaled % absoluteDenominator) * 2n >= absoluteDenominator) units += 1n
  if (negative) units = -units
  const absolute = units < 0n ? -units : units
  return `${units < 0n ? '-' : ''}${absolute / RATIO_SCALE}.${String(absolute % RATIO_SCALE).padStart(8, '0')}`
}

export const classifyPartnershipDataQuality = (summary: PartnershipTrackerSummary): PartnershipDataQuality => {
  if (summary.warningCount > 0) return 'WARNINGS'
  const required = [
    summary.currentCommittedCapital?.amount,
    summary.totalCapitalContributions,
    summary.totalDistributions,
    summary.latestNav?.amount,
    summary.unfundedCommitmentAmount,
    summary.dpi,
    summary.tvpi,
    summary.irr,
  ]
  return required.some((value) => value == null) ? 'MISSING_DATA' : 'COMPLETE'
}

const coveredMoney = (rows: PartnershipAggregateRow[], pick: (row: PartnershipAggregateRow) => string | null | undefined): PartnershipAggregationCoveredMoney => {
  let total = 0n
  let knownCount = 0
  for (const row of rows) {
    const value = pick(row)
    if (value == null) continue
    total += moneyToCents(value)
    knownCount += 1
  }
  return { amount: knownCount === 0 ? null : centsToMoney(total), knownCount, totalCount: rows.length }
}

const coveredRatio = (
  numerator: bigint | null,
  denominator: bigint | null,
  numeratorKnownCount: number,
  denominatorKnownCount: number,
  totalCount: number,
  completeCoverage: boolean,
): PartnershipAggregationCoveredRatio => {
  if (numerator == null || denominator == null) {
    return { value: null, status: 'NO_DATA', numeratorKnownCount, denominatorKnownCount, totalCount }
  }
  if (denominator === 0n) {
    return { value: null, status: 'ZERO_DENOMINATOR', numeratorKnownCount, denominatorKnownCount, totalCount }
  }
  return {
    value: ratioFromCents(numerator, denominator),
    status: completeCoverage ? 'AVAILABLE' : 'PARTIAL_COVERAGE',
    numeratorKnownCount,
    denominatorKnownCount,
    totalCount,
  }
}

const titleCaseStatus = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

const facetsFor = <T extends string>(
  values: readonly T[],
  rows: PartnershipAggregateRow[],
  pick: (row: PartnershipAggregateRow) => T,
  label: (value: T) => string = titleCaseStatus,
): PartnershipAggregationFacetOption<T>[] => values.map((value) => ({
  value,
  label: label(value),
  count: rows.filter((row) => pick(row) === value).length,
})).filter((option) => option.count > 0)

const composeFacets = (rows: PartnershipAggregateRow[]): PartnershipAggregationFacetSet => {
  const ownerCounts = new Map<string, { label: string; count: number }>()
  for (const row of rows) {
    const owner = row.partnership.entity
    const current = ownerCounts.get(owner.id)
    ownerCounts.set(owner.id, { label: owner.name, count: (current?.count ?? 0) + 1 })
  }
  const owners = [...ownerCounts.entries()]
    .map(([value, item]) => ({ value, label: item.label, count: item.count }))
    .sort((left, right) => left.label.localeCompare(right.label, 'en', { sensitivity: 'base' }) || left.value.localeCompare(right.value))
  return {
    owners,
    partnershipTypes: facetsFor(PARTNERSHIP_TYPES, rows, (row) => row.partnership.partnershipType, (value) => value),
    statuses: facetsFor(LIFECYCLE_STATUSES, rows, (row) => row.partnership.status),
    workflowStatuses: facetsFor(PARTNERSHIP_AGGREGATION_WORKFLOWS, rows, (row) => row.latestWorkflowStatus ?? 'NO_K1_YEAR'),
    dataQuality: facetsFor(PARTNERSHIP_DATA_QUALITIES, rows, (row) => row.dataQuality),
  }
}

const normalizedQuery = (query: PartnershipAggregationQuery, baseRows: PartnershipAggregateRow[]): PartnershipAggregationQuery => {
  const availableOwners = new Set(baseRows.map((row) => row.partnership.entity.id))
  return {
    ...(query.search?.trim() ? { search: query.search.trim().slice(0, 200) } : {}),
    ownerIds: unique(query.ownerIds).filter((value) => availableOwners.has(value)).sort(),
    partnershipTypes: PARTNERSHIP_TYPES.filter((value) => query.partnershipTypes.includes(value)),
    statuses: LIFECYCLE_STATUSES.filter((value) => query.statuses.includes(value)),
    workflowStatuses: PARTNERSHIP_AGGREGATION_WORKFLOWS.filter((value) => query.workflowStatuses.includes(value)),
    dataQuality: PARTNERSHIP_DATA_QUALITIES.filter((value) => query.dataQuality.includes(value)),
    sort: PARTNERSHIP_AGGREGATION_SORTS.includes(query.sort) ? query.sort : 'partnership',
    direction: query.direction === 'desc' ? 'desc' : 'asc',
    page: Number.isInteger(query.page) && query.page > 0 ? query.page : 1,
    pageSize: query.pageSize === 25 || query.pageSize === 100 ? query.pageSize : 50,
  }
}

const filterRows = (rows: PartnershipAggregateRow[], query: PartnershipAggregationQuery) => rows.filter((row) => {
  const search = query.search?.toLocaleLowerCase()
  if (search && !row.partnership.name.toLocaleLowerCase().includes(search) && !row.partnership.entity.name.toLocaleLowerCase().includes(search)) return false
  if (query.ownerIds.length && !query.ownerIds.includes(row.partnership.entity.id)) return false
  if (query.partnershipTypes.length && !query.partnershipTypes.includes(row.partnership.partnershipType)) return false
  if (query.statuses.length && !query.statuses.includes(row.partnership.status)) return false
  const workflow: PartnershipAggregationWorkflow = row.latestWorkflowStatus ?? 'NO_K1_YEAR'
  if (query.workflowStatuses.length && !query.workflowStatuses.includes(workflow)) return false
  if (query.dataQuality.length && !query.dataQuality.includes(row.dataQuality)) return false
  return true
})

const compareText = (left: string, right: string) => left.localeCompare(right, 'en', { sensitivity: 'base' }) || left.localeCompare(right, 'en')

const rank = <T extends string>(values: readonly T[], value: T) => values.indexOf(value)

const sortValue = (row: PartnershipAggregateRow, sort: PartnershipAggregationQuery['sort']): string | number | bigint | null => {
  switch (sort) {
    case 'partnership': return row.partnership.name
    case 'owner': return row.partnership.entity.name
    case 'type': return rank(PARTNERSHIP_TYPES, row.partnership.partnershipType)
    case 'status': return rank(LIFECYCLE_STATUSES, row.partnership.status)
    case 'commitment': return row.currentCommittedCapital ? moneyToCents(row.currentCommittedCapital.amount) : null
    case 'paidIn': return row.totalCapitalContributions == null ? null : moneyToCents(row.totalCapitalContributions)
    case 'distributions': return row.totalDistributions == null ? null : moneyToCents(row.totalDistributions)
    case 'nav': return row.latestNav == null ? null : moneyToCents(row.latestNav.amount)
    case 'unfunded': return row.unfundedCommitmentAmount == null ? null : moneyToCents(row.unfundedCommitmentAmount)
    case 'dpi': return row.dpi == null ? null : decimalToUnits(row.dpi)
    case 'tvpi': return row.tvpi == null ? null : decimalToUnits(row.tvpi)
    case 'irr': return row.irr == null ? null : decimalToUnits(row.irr)
    case 'latestTaxYear': return row.latestTaxYear
    case 'warningCount': return row.warningCount
  }
}

const compareKnown = (left: string | number | bigint, right: string | number | bigint) => {
  if (typeof left === 'string' && typeof right === 'string') return compareText(left, right)
  return left < right ? -1 : left > right ? 1 : 0
}

const sortRows = (rows: PartnershipAggregateRow[], query: PartnershipAggregationQuery) => [...rows].sort((left, right) => {
  const leftValue = sortValue(left, query.sort)
  const rightValue = sortValue(right, query.sort)
  if (leftValue == null || rightValue == null) {
    if (leftValue == null && rightValue == null) return compareText(left.partnership.name, right.partnership.name) || left.partnership.id.localeCompare(right.partnership.id)
    return leftValue == null ? 1 : -1
  }
  const primary = compareKnown(leftValue, rightValue)
  if (primary !== 0) return query.direction === 'desc' ? -primary : primary
  return compareText(left.partnership.name, right.partnership.name) || left.partnership.id.localeCompare(right.partnership.id)
})

const rollupFor = (rows: PartnershipAggregateRow[], asOfDate: string) => {
  const committedCapital = coveredMoney(rows, (row) => row.currentCommittedCapital?.amount)
  const paidInCapital = coveredMoney(rows, (row) => row.totalCapitalContributions)
  const distributions = coveredMoney(rows, (row) => row.totalDistributions)
  const latestNav = coveredMoney(rows, (row) => row.latestNav?.amount)
  const unfundedCommitment = coveredMoney(rows, (row) => row.unfundedCommitmentAmount)
  const paidInCents = paidInCapital.amount == null ? null : moneyToCents(paidInCapital.amount)
  const distributionCents = distributions.amount == null ? null : moneyToCents(distributions.amount)
  const navCents = latestNav.amount == null ? null : moneyToCents(latestNav.amount)
  const dpi = coveredRatio(
    distributionCents,
    paidInCents,
    distributions.knownCount,
    paidInCapital.knownCount,
    rows.length,
    distributions.knownCount === rows.length && paidInCapital.knownCount === rows.length,
  )
  const hasTvpiNumerator = distributionCents != null || navCents != null
  const tvpiNumerator = hasTvpiNumerator ? (distributionCents ?? 0n) + (navCents ?? 0n) : null
  const tvpi = coveredRatio(
    tvpiNumerator,
    paidInCents,
    Math.min(distributions.knownCount, latestNav.knownCount),
    paidInCapital.knownCount,
    rows.length,
    distributions.knownCount === rows.length && latestNav.knownCount === rows.length && paidInCapital.knownCount === rows.length,
  )
  const navDates = rows.flatMap((row) => row.latestNav?.date ? [row.latestNav.date] : []).sort()
  return {
    partnershipCount: rows.length,
    committedCapital,
    paidInCapital,
    distributions,
    latestNav,
    unfundedCommitment,
    dpi,
    tvpi,
    asOfDate,
    navValuationRange: { earliest: navDates.at(0) ?? null, latest: navDates.at(-1) ?? null },
  }
}

export const composePartnershipAggregation = (
  summaries: PartnershipTrackerSummary[],
  requestedQuery: PartnershipAggregationQuery = DEFAULT_PARTNERSHIP_AGGREGATION_QUERY,
  asOfDate = summaries[0]?.performanceAsOfDate ?? new Date().toISOString().slice(0, 10),
): PartnershipAggregationResponse => {
  const baseRows: PartnershipAggregateRow[] = summaries.map((summary) => ({ ...summary, dataQuality: classifyPartnershipDataQuality(summary) }))
  const facets = composeFacets(baseRows)
  const query = normalizedQuery({ ...DEFAULT_PARTNERSHIP_AGGREGATION_QUERY, ...requestedQuery }, baseRows)
  const filtered = filterRows(baseRows, query)
  const sorted = sortRows(filtered, query)
  const totalPages = sorted.length === 0 ? 0 : Math.ceil(sorted.length / query.pageSize)
  const page = totalPages === 0 ? 1 : Math.min(query.page, totalPages)
  const start = (page - 1) * query.pageSize
  const normalized = { ...query, page }
  return {
    query: normalized,
    rollup: rollupFor(filtered, asOfDate),
    facets,
    items: sorted.slice(start, start + query.pageSize),
    pageInfo: {
      page,
      pageSize: query.pageSize,
      totalItems: sorted.length,
      totalPages,
      hasPreviousPage: page > 1 && totalPages > 0,
      hasNextPage: page < totalPages,
    },
  }
}
