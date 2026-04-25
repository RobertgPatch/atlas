import { pool } from '../../infra/db/client.js'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { capitalRepository } from '../partnerships/capital.repository.js'
import { getInMemoryPartnershipOverlay } from '../partnerships/partnerships.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import type { PoolClient } from 'pg'
import type {
  ActivityDetailQuery,
  AssetClassSummaryQuery,
  PortfolioSummaryQuery,
  UpdateActivityDetailBody,
} from './reports.zod.js'

interface ReportTotals {
  originalCommitmentUsd: number
  calledPct: number | null
  unfundedUsd: number
  paidInUsd: number
  distributionsUsd: number
  residualValueUsd: number
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  irr: number | null
}

interface AggregatedMetricsRow {
  originalCommitmentUsd: number | null
  calledPct: number | null
  unfundedUsd: number | null
  paidInUsd: number | null
  distributionsUsd: number | null
  residualValueUsd: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  irr: number | null
}

interface PortfolioSummaryRow extends AggregatedMetricsRow {
  id: string
  entityId: string
  entityName: string
  entityType: string
  partnershipCount: number
  editability: {
    originalCommitmentEditable: boolean
    reason: string | null
    commitmentTarget:
      | {
          partnershipId: string
          commitmentId: string
          updatedAt: string
        }
      | null
  }
}

interface AssetClassSummaryRow extends AggregatedMetricsRow {
  id: string
  assetClass: string
  partnershipCount: number
}

interface PortfolioSummaryResponse {
  kpis: {
    totalCommitmentUsd: number
    totalDistributionsUsd: number
    weightedIrr: number | null
    weightedTvpi: number | null
  }
  rows: PortfolioSummaryRow[]
  totals: ReportTotals
  page: {
    size: number
    offset: number
    total: number
  }
}

interface AssetClassSummaryResponse {
  rows: AssetClassSummaryRow[]
  totals: ReportTotals
}

interface ActivityDetailRow {
  id: string
  entityId: string
  entityName: string
  partnershipId: string
  partnershipName: string
  taxYear: number
  beginningBasisUsd: number | null
  contributionsUsd: number | null
  interestUsd: number | null
  dividendsUsd: number | null
  capitalGainsUsd: number | null
  remainingK1Usd: number | null
  totalIncomeUsd: number | null
  distributionsUsd: number | null
  otherAdjustmentsUsd: number | null
  endingTaxBasisUsd: number | null
  endingGlBalanceUsd: number | null
  bookToBookAdjustmentUsd: number | null
  k1CapitalAccountUsd: number | null
  k1VsTaxDifferenceUsd: number | null
  excessDistributionUsd: number | null
  negativeBasis: boolean
  endingBasisUsd: number | null
  notes: string | null
  sourceSignals: {
    hasK1: boolean
    hasCapitalActivity: boolean
    hasFmv: boolean
    hasManualInput: boolean
  }
  finalizedFromK1DocumentId: string | null
  updatedAt: string
}

interface ActivityDetailResponse {
  rows: ActivityDetailRow[]
  page: {
    size: number
    offset: number
    total: number
  }
}

export interface ReportsScope {
  isAdmin: boolean
  entityIds: string[]
}

interface ActivityDetailEditContext {
  actorUserId: string
  scope: ReportsScope
}

interface ActivityDetailUndoState {
  rowId: string
  expectedUpdatedAt: string
  previousValues: {
    beginningBasisUsd: number | null
    contributionsUsd: number | null
    otherAdjustmentsUsd: number | null
    endingGlBalanceUsd: number | null
    notes: string | null
  }
}

interface PartnershipContext {
  partnershipId: string
  partnershipName: string
  assetClass: string | null
  entityId: string
  entityName: string
  entityType: string
}

interface PartnershipMetrics extends PartnershipContext {
  originalCommitmentUsd: number | null
  calledPct: number | null
  unfundedUsd: number | null
  paidInUsd: number
  distributionsUsd: number
  residualValueUsd: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  irr: number | null
  activeCommitment:
    | {
        commitmentId: string
        updatedAt: string
      }
    | null
}

type ReportsQuery = PortfolioSummaryQuery | AssetClassSummaryQuery

const normalizeAssetClass = (value: string | null | undefined): string => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : 'Unclassified'
}

const PORTFOLIO_SORT_FIELDS: Record<string, (row: PortfolioSummaryRow) => number | string | null> = {
  entityName: (row) => row.entityName,
  partnershipCount: (row) => row.partnershipCount,
  originalCommitmentUsd: (row) => row.originalCommitmentUsd,
  calledPct: (row) => row.calledPct,
  unfundedUsd: (row) => row.unfundedUsd,
  paidInUsd: (row) => row.paidInUsd,
  distributionsUsd: (row) => row.distributionsUsd,
  residualValueUsd: (row) => row.residualValueUsd,
  dpi: (row) => row.dpi,
  rvpi: (row) => row.rvpi,
  tvpi: (row) => row.tvpi,
  irr: (row) => row.irr,
}

const ASSET_CLASS_SORT_FIELDS: Record<string, (row: AssetClassSummaryRow) => number | string | null> = {
  assetClass: (row) => row.assetClass,
  partnershipCount: (row) => row.partnershipCount,
  originalCommitmentUsd: (row) => row.originalCommitmentUsd,
  calledPct: (row) => row.calledPct,
  unfundedUsd: (row) => row.unfundedUsd,
  paidInUsd: (row) => row.paidInUsd,
  distributionsUsd: (row) => row.distributionsUsd,
  residualValueUsd: (row) => row.residualValueUsd,
  dpi: (row) => row.dpi,
  rvpi: (row) => row.rvpi,
  tvpi: (row) => row.tvpi,
  irr: (row) => row.irr,
}

const ACTIVITY_DETAIL_SORT_FIELDS: Record<string, (row: ActivityDetailRow) => number | string | null> = {
  taxYear: (row) => row.taxYear,
  entityName: (row) => row.entityName,
  partnershipName: (row) => row.partnershipName,
  distributionsUsd: (row) => row.distributionsUsd,
  endingBasisUsd: (row) => row.endingBasisUsd,
  updatedAt: (row) => row.updatedAt,
}

const activityDetailUndoState = new Map<string, ActivityDetailUndoState>()

const FORBIDDEN_ENTITY_ERROR = 'FORBIDDEN_ENTITY'
const STALE_ACTIVITY_DETAIL_UPDATE_ERROR = 'STALE_ACTIVITY_DETAIL_UPDATE'
const ACTIVITY_DETAIL_UNDO_NOT_AVAILABLE_ERROR = 'ACTIVITY_DETAIL_UNDO_NOT_AVAILABLE'

const activityDetailUndoKey = (actorUserId: string, rowId: string): string =>
  `${actorUserId}:${rowId}`

const toNumericString = (value: number | null | undefined): string | null => {
  if (value == null || !Number.isFinite(value)) return null
  return String(value)
}

const toNumber = (value: unknown): number | null => {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const weightedAverage = <T>(
  rows: T[],
  valueOf: (row: T) => number | null | undefined,
  weightOf: (row: T) => number | null | undefined,
): number | null => {
  let numerator = 0
  let denominator = 0

  for (const row of rows) {
    const value = valueOf(row)
    const weight = weightOf(row)
    if (value == null || weight == null || !Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) {
      continue
    }
    numerator += value * weight
    denominator += weight
  }

  if (denominator <= 0) return null
  return numerator / denominator
}

const sumNullable = (rows: Array<number | null | undefined>): number =>
  rows.reduce<number>((sum, value) => sum + (value ?? 0), 0)

const normalizeDateRangeToYears = (dateRange: string | undefined): number | null => {
  if (!dateRange) return null
  if (dateRange === 'all') return null
  if (dateRange === '1y') return 1
  if (dateRange === '3y') return 3
  if (dateRange === '5y') return 5
  return null
}

const normalizeIsoTimestamp = (value: string | Date | null | undefined): string | null => {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return parsed.toISOString()
}

const assertActivityExpectedUpdatedAt = (
  expectedUpdatedAt: string | undefined,
  actualUpdatedAt: string | Date | null | undefined,
): void => {
  if (!expectedUpdatedAt) return

  const expected = new Date(expectedUpdatedAt).getTime()
  const actual = new Date(actualUpdatedAt ?? '').getTime()

  if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected !== actual) {
    throw new Error(STALE_ACTIVITY_DETAIL_UPDATE_ERROR)
  }
}

const normalizeSearch = (search: string | undefined): string => search?.trim().toLowerCase() ?? ''

const sortRows = <T>(
  rows: T[],
  sort: string | undefined,
  direction: 'asc' | 'desc',
  fields: Record<string, (row: T) => number | string | null>,
  defaultSort: keyof typeof fields,
  tieBreaker: (row: T) => string,
): T[] => {
  const accessor = fields[sort ?? String(defaultSort)] ?? fields[defaultSort]
  const directionMultiplier = direction === 'asc' ? 1 : -1

  return [...rows].sort((left, right) => {
    const a = accessor(left)
    const b = accessor(right)

    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b) * directionMultiplier
    }

    if (a == null && b == null) return tieBreaker(left).localeCompare(tieBreaker(right))
    if (a == null) return 1
    if (b == null) return -1

    return (Number(a) - Number(b)) * directionMultiplier ||
      tieBreaker(left).localeCompare(tieBreaker(right))
  })
}

const mapEditability = (items: PartnershipMetrics[]): PortfolioSummaryRow['editability'] => {
  if (items.length !== 1) {
    return {
      originalCommitmentEditable: false,
      reason: 'Only single-partnership entities can be edited in Phase 1.',
      commitmentTarget: null,
    }
  }

  const target = items[0].activeCommitment
  if (!target) {
    return {
      originalCommitmentEditable: false,
      reason: 'No active commitment available for editing.',
      commitmentTarget: null,
    }
  }

  return {
    originalCommitmentEditable: true,
    reason: null,
    commitmentTarget: {
      partnershipId: items[0].partnershipId,
      commitmentId: target.commitmentId,
      updatedAt: target.updatedAt,
    },
  }
}

const toTotals = (rows: AggregatedMetricsRow[]): ReportTotals => {
  const originalCommitmentUsd = sumNullable(rows.map((row) => row.originalCommitmentUsd))
  const paidInUsd = sumNullable(rows.map((row) => row.paidInUsd))
  const distributionsUsd = sumNullable(rows.map((row) => row.distributionsUsd))
  const hasResidual = rows.some((row) => row.residualValueUsd != null)
  const residualSum = sumNullable(rows.map((row) => row.residualValueUsd))
  const residualValueUsd = hasResidual ? residualSum : 0
  const paidInDenom = paidInUsd > 0 ? paidInUsd : null

  const totals: ReportTotals = {
    originalCommitmentUsd,
    calledPct: originalCommitmentUsd > 0 ? (paidInUsd / originalCommitmentUsd) * 100 : null,
    unfundedUsd: sumNullable(rows.map((row) => row.unfundedUsd)),
    paidInUsd,
    distributionsUsd,
    residualValueUsd: hasResidual ? residualSum : 0,
    dpi: paidInDenom != null ? distributionsUsd / paidInDenom : null,
    rvpi: paidInDenom != null && hasResidual ? residualSum / paidInDenom : null,
    tvpi:
      paidInDenom != null && hasResidual
        ? (distributionsUsd + residualValueUsd) / paidInDenom
        : null,
    irr: weightedAverage(rows, (row) => row.irr, (row) => row.originalCommitmentUsd),
  }

  return totals
}

interface AggregatedMultiples {
  residualValueUsd: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
}

const aggregateMultiples = (
  rows: Array<{
    paidInUsd: number | null
    distributionsUsd: number | null
    residualValueUsd: number | null
  }>,
): AggregatedMultiples => {
  const paidInUsd = sumNullable(rows.map((row) => row.paidInUsd))
  const distributionsUsd = sumNullable(rows.map((row) => row.distributionsUsd))
  const hasResidual = rows.some((row) => row.residualValueUsd != null)
  const residualSum = sumNullable(rows.map((row) => row.residualValueUsd))
  const denom = paidInUsd > 0 ? paidInUsd : null

  return {
    residualValueUsd: hasResidual ? residualSum : null,
    dpi: denom != null ? distributionsUsd / denom : null,
    rvpi: denom != null && hasResidual ? residualSum / denom : null,
    tvpi:
      denom != null && hasResidual
        ? (distributionsUsd + residualSum) / denom
        : null,
  }
}

const getInMemoryPartnershipContexts = (
  query: ReportsQuery,
  scope: ReportsScope,
): PartnershipContext[] => {
  const entityLookup = new Map(k1Repository.listEntities().map((entity) => [entity.id, entity]))
  const search = normalizeSearch(query.search)

  return k1Repository
    .listPartnerships()
    .filter((row) => (scope.isAdmin ? true : scope.entityIds.includes(row.entityId)))
    .map((partnership) => {
      const entity = entityLookup.get(partnership.entityId)
      const overlay = getInMemoryPartnershipOverlay(partnership.id)
      return {
        partnershipId: partnership.id,
        partnershipName: partnership.name,
        assetClass: overlay.assetClass,
        entityId: partnership.entityId,
        entityName: entity?.name ?? 'Unknown Entity',
        entityType: 'UNKNOWN',
      }
    })
    .filter((row) => {
      if (query.entityId && row.entityId !== query.entityId) return false
      if (query.partnershipId && row.partnershipId !== query.partnershipId) return false
      if (query.entityType && row.entityType.toLowerCase() !== query.entityType.toLowerCase()) return false
      if (!search) return true
      return (
        row.entityName.toLowerCase().includes(search) ||
        row.partnershipName.toLowerCase().includes(search)
      )
    })
}

const getDbPartnershipContexts = async (
  query: ReportsQuery,
  scope: ReportsScope,
): Promise<PartnershipContext[]> => {
  if (!pool) return []

  const params: unknown[] = []
  const where: string[] = ['1=1']

  if (!scope.isAdmin) {
    if (scope.entityIds.length === 0) return []
    const placeholders = scope.entityIds.map((_, idx) => `$${idx + 1}`).join(', ')
    params.push(...scope.entityIds)
    where.push(`p.entity_id in (${placeholders})`)
  }

  if (query.entityId) {
    params.push(query.entityId)
    where.push(`p.entity_id = $${params.length}`)
  }

  if (query.partnershipId) {
    params.push(query.partnershipId)
    where.push(`p.id = $${params.length}`)
  }

  if (query.entityType) {
    params.push(query.entityType)
    where.push(`lower(e.entity_type) = lower($${params.length})`)
  }

  if (query.search) {
    params.push(`%${query.search.trim()}%`)
    where.push(`(lower(e.name) like lower($${params.length}) or lower(p.name) like lower($${params.length}))`)
  }

  const result = await pool.query(
    `
    select
      p.id as partnership_id,
      p.name as partnership_name,
      p.asset_class,
      e.id as entity_id,
      e.name as entity_name,
      e.entity_type
    from partnerships p
    join entities e on e.id = p.entity_id
    where ${where.join(' and ')}
    order by e.name asc, p.name asc
    `,
    params,
  )

  return result.rows.map((row) => ({
    partnershipId: row.partnership_id,
    partnershipName: row.partnership_name,
    assetClass: row.asset_class ?? null,
    entityId: row.entity_id,
    entityName: row.entity_name,
    entityType: row.entity_type ?? 'UNKNOWN',
  }))
}

const getAnnualRowsForPartnership = async (partnershipId: string): Promise<Array<{ taxYear: number; irr: number | null }>> => {
  if (!pool) {
    return reviewRepository
      ._debugAllAnnualActivity()
      .filter((row) => row.partnershipId === partnershipId)
      .map((row) => ({
        taxYear: row.taxYear,
        irr: null,
      }))
  }

  const result = await pool.query(
    `
    select tax_year, irr
    from partnership_annual_activity
    where partnership_id = $1
    order by tax_year desc, updated_at desc
    `,
    [partnershipId],
  )

  return result.rows.map((row) => ({
    taxYear: Number(row.tax_year),
    irr: toNumber(row.irr),
  }))
}

const filterAnnualRows = (
  annualRows: Array<{ taxYear: number; irr: number | null }>,
  query: ReportsQuery,
): Array<{ taxYear: number; irr: number | null }> => {
  if (query.taxYear) {
    return annualRows.filter((row) => row.taxYear === query.taxYear)
  }

  const rangeYears = normalizeDateRangeToYears(query.dateRange)
  if (!rangeYears) return annualRows

  const currentYear = new Date().getUTCFullYear()
  const minTaxYear = currentYear - rangeYears + 1
  return annualRows.filter((row) => row.taxYear >= minTaxYear)
}

const hasTemporalFilters = (query: ReportsQuery): boolean =>
  Boolean(query.taxYear) || normalizeDateRangeToYears(query.dateRange) != null

const buildPartnershipMetrics = async (
  query: ReportsQuery,
  scope: ReportsScope,
): Promise<PartnershipMetrics[]> => {
  const partnershipContexts = pool
    ? await getDbPartnershipContexts(query, scope)
    : getInMemoryPartnershipContexts(query, scope)

  const partnershipRows: PartnershipMetrics[] = []

  for (const context of partnershipContexts) {
    const annualRows = await getAnnualRowsForPartnership(context.partnershipId)
    const annualRowsInScope = filterAnnualRows(annualRows, query)
    if (hasTemporalFilters(query) && annualRowsInScope.length === 0) {
      continue
    }

    const overview = await capitalRepository.calculateCapitalOverview(context.partnershipId)
    const commitments = await capitalRepository.listCommitments(context.partnershipId)
    const activeCommitment = commitments.find((row) => row.status === 'ACTIVE')

    const latestAnnual = annualRowsInScope[0] ?? null

    partnershipRows.push({
      ...context,
      originalCommitmentUsd: overview.originalCommitmentUsd,
      calledPct: overview.percentCalled,
      unfundedUsd: overview.unfundedUsd,
      paidInUsd: overview.paidInUsd,
      distributionsUsd: overview.reportedDistributionsUsd,
      residualValueUsd: overview.residualValueUsd,
      dpi: overview.dpi,
      rvpi: overview.rvpi,
      tvpi: overview.tvpi,
      irr: latestAnnual?.irr ?? null,
      activeCommitment: activeCommitment
        ? {
            commitmentId: activeCommitment.id,
            updatedAt:
              normalizeIsoTimestamp(activeCommitment.updatedAt) ??
              new Date().toISOString(),
          }
        : null,
    })
  }

  return partnershipRows
}

const getInMemoryActivityDetailRows = (
  query: ActivityDetailQuery,
  scope: ReportsScope,
): ActivityDetailRow[] => {
  const entityLookup = new Map(k1Repository.listEntities().map((entity) => [entity.id, entity]))
  const partnershipLookup = new Map(
    k1Repository.listPartnerships().map((partnership) => [partnership.id, partnership]),
  )
  const search = normalizeSearch(query.search)
  const rangeYears = normalizeDateRangeToYears(query.dateRange)
  const minTaxYear =
    rangeYears == null
      ? null
      : new Date().getUTCFullYear() - rangeYears + 1

  return reviewRepository
    ._debugAllAnnualActivity()
    .map((row) => {
      const manualRow = row as unknown as {
        beginningBasisAmount?: string | null
        contributionsAmount?: string | null
        remainingK1Amount?: string | null
        otherAdjustmentsAmount?: string | null
        endingTaxBasisAmount?: string | null
        endingGlBalance?: string | null
        bookToBookAdjustmentAmount?: string | null
        k1VsTaxDifferenceAmount?: string | null
        excessDistributionAmount?: string | null
        negativeBasisFlag?: boolean
        endingBasisAmount?: string | null
        notes?: string | null
      }
      const entity = entityLookup.get(row.entityId)
      const partnership = partnershipLookup.get(row.partnershipId)
      return {
        id: row.id,
        entityId: row.entityId,
        entityName: entity?.name ?? 'Unknown Entity',
        partnershipId: row.partnershipId,
        partnershipName: partnership?.name ?? 'Unknown Partnership',
        taxYear: row.taxYear,
        beginningBasisUsd: toNumber(manualRow.beginningBasisAmount),
        contributionsUsd: toNumber(manualRow.contributionsAmount ?? row.paidInAmount),
        interestUsd: null,
        dividendsUsd: null,
        capitalGainsUsd: null,
        remainingK1Usd: toNumber(manualRow.remainingK1Amount),
        totalIncomeUsd: null,
        distributionsUsd: toNumber(row.reportedDistributionAmount),
        otherAdjustmentsUsd: toNumber(manualRow.otherAdjustmentsAmount),
        endingTaxBasisUsd: toNumber(manualRow.endingTaxBasisAmount),
        endingGlBalanceUsd: toNumber(manualRow.endingGlBalance),
        bookToBookAdjustmentUsd: toNumber(manualRow.bookToBookAdjustmentAmount),
        k1CapitalAccountUsd: null,
        k1VsTaxDifferenceUsd: toNumber(manualRow.k1VsTaxDifferenceAmount),
        excessDistributionUsd: toNumber(manualRow.excessDistributionAmount),
        negativeBasis: Boolean(manualRow.negativeBasisFlag),
        endingBasisUsd: toNumber(manualRow.endingBasisAmount),
        notes: manualRow.notes ?? null,
        sourceSignals: {
          hasK1: row.sourceHasK1,
          hasCapitalActivity: row.sourceHasCapitalActivity,
          hasFmv: row.sourceHasFmv,
          hasManualInput: row.sourceHasManualInput,
        },
        finalizedFromK1DocumentId: row.finalizedFromK1DocumentId,
        updatedAt: row.updatedAt.toISOString(),
      }
    })
    .filter((row) => {
      if (!scope.isAdmin && !scope.entityIds.includes(row.entityId)) return false
      if (query.entityId && row.entityId !== query.entityId) return false
      if (query.partnershipId && row.partnershipId !== query.partnershipId) return false
      if (query.taxYear && row.taxYear !== query.taxYear) return false
      if (minTaxYear != null && row.taxYear < minTaxYear) return false
      if (!search) return true

      return (
        row.entityName.toLowerCase().includes(search) ||
        row.partnershipName.toLowerCase().includes(search)
      )
    })
}

const mapDbActivityDetailRow = (row: any): ActivityDetailRow => ({
  id: row.id,
  entityId: row.entity_id,
  entityName: row.entity_name,
  partnershipId: row.partnership_id,
  partnershipName: row.partnership_name,
  taxYear: Number(row.tax_year),
  beginningBasisUsd: toNumber(row.beginning_basis_amount),
  contributionsUsd: toNumber(row.contributions_amount ?? row.paid_in_amount),
  interestUsd: toNumber(row.interest_amount),
  dividendsUsd: toNumber(row.dividends_amount),
  capitalGainsUsd: toNumber(row.capital_gains_amount),
  remainingK1Usd: toNumber(row.remaining_k1_amount),
  totalIncomeUsd: toNumber(row.total_income_amount),
  distributionsUsd: toNumber(row.reported_distribution_amount),
  otherAdjustmentsUsd: toNumber(row.other_adjustments_amount),
  endingTaxBasisUsd: toNumber(row.ending_tax_basis_amount),
  endingGlBalanceUsd: toNumber(row.ending_gl_balance),
  bookToBookAdjustmentUsd: toNumber(row.book_to_book_adjustment_amount),
  k1CapitalAccountUsd: toNumber(row.k1_capital_account),
  k1VsTaxDifferenceUsd: toNumber(row.k1_vs_tax_difference_amount),
  excessDistributionUsd: toNumber(row.excess_distribution_amount),
  negativeBasis: Boolean(row.negative_basis_flag),
  endingBasisUsd: toNumber(row.ending_basis_amount),
  notes: row.notes ?? null,
  sourceSignals: {
    hasK1: Boolean(row.source_has_k1),
    hasCapitalActivity: Boolean(row.source_has_capital_activity),
    hasFmv: Boolean(row.source_has_fmv),
    hasManualInput: Boolean(row.source_has_manual_input),
  },
  finalizedFromK1DocumentId: row.finalized_from_k1_document_id ?? null,
  updatedAt: normalizeIsoTimestamp(row.updated_at) ?? new Date().toISOString(),
})

const getDbActivityDetailRows = async (
  query: ActivityDetailQuery,
  scope: ReportsScope,
): Promise<ActivityDetailRow[]> => {
  if (!pool) return []

  const params: unknown[] = []
  const where: string[] = ['1=1']

  if (!scope.isAdmin) {
    if (scope.entityIds.length === 0) return []
    const placeholders = scope.entityIds.map((_, idx) => `$${idx + 1}`).join(', ')
    params.push(...scope.entityIds)
    where.push(`a.entity_id in (${placeholders})`)
  }

  if (query.entityId) {
    params.push(query.entityId)
    where.push(`a.entity_id = $${params.length}`)
  }

  if (query.partnershipId) {
    params.push(query.partnershipId)
    where.push(`a.partnership_id = $${params.length}`)
  }

  if (query.taxYear) {
    params.push(query.taxYear)
    where.push(`a.tax_year = $${params.length}`)
  }

  const rangeYears = normalizeDateRangeToYears(query.dateRange)
  if (rangeYears != null) {
    const minTaxYear = new Date().getUTCFullYear() - rangeYears + 1
    params.push(minTaxYear)
    where.push(`a.tax_year >= $${params.length}`)
  }

  if (query.search) {
    params.push(`%${query.search.trim()}%`)
    where.push(`(lower(e.name) like lower($${params.length}) or lower(p.name) like lower($${params.length}))`)
  }

  const result = await pool.query(
    `
    select
      a.*,
      e.name as entity_name,
      p.name as partnership_name
    from partnership_annual_activity a
    join entities e on e.id = a.entity_id
    join partnerships p on p.id = a.partnership_id
    where ${where.join(' and ')}
    `,
    params,
  )

  return result.rows.map(mapDbActivityDetailRow)
}

interface InMemoryActivityDetailRow {
  id: string
  entityId: string
  partnershipId: string
  taxYear: number
  paidInAmount: string | null
  reportedDistributionAmount: string | null
  sourceHasK1: boolean
  sourceHasCapitalActivity: boolean
  sourceHasFmv: boolean
  sourceHasManualInput: boolean
  finalizedFromK1DocumentId: string | null
  updatedAt: Date
  beginningBasisAmount?: string | null
  contributionsAmount?: string | null
  otherAdjustmentsAmount?: string | null
  endingGlBalance?: string | null
  notes?: string | null
}

const isEntityInScope = (entityId: string, scope: ReportsScope): boolean =>
  scope.isAdmin || scope.entityIds.includes(entityId)

const getInMemoryActivityDetailRowById = (rowId: string): InMemoryActivityDetailRow | undefined =>
  reviewRepository
    ._debugAllAnnualActivity()
    .find((row) => row.id === rowId) as InMemoryActivityDetailRow | undefined

const getDbActivityDetailRowById = async (rowId: string, client: PoolClient): Promise<any | null> => {
  const result = await client.query(
    `
    select
      a.*,
      e.name as entity_name,
      p.name as partnership_name
    from partnership_annual_activity a
    join entities e on e.id = a.entity_id
    join partnerships p on p.id = a.partnership_id
    where a.id = $1
    limit 1
    `,
    [rowId],
  )

  return result.rows[0] ?? null
}

const toUndoSnapshotValues = (row: ActivityDetailRow): ActivityDetailUndoState['previousValues'] => ({
  beginningBasisUsd: row.beginningBasisUsd,
  contributionsUsd: row.contributionsUsd,
  otherAdjustmentsUsd: row.otherAdjustmentsUsd,
  endingGlBalanceUsd: row.endingGlBalanceUsd,
  notes: row.notes,
})

const applyInMemoryActivityPatch = (
  row: InMemoryActivityDetailRow,
  patch: UpdateActivityDetailBody,
): void => {
  if ('beginningBasisUsd' in patch) {
    row.beginningBasisAmount = toNumericString(patch.beginningBasisUsd ?? null)
  }
  if ('contributionsUsd' in patch) {
    row.contributionsAmount = toNumericString(patch.contributionsUsd ?? null)
  }
  if ('otherAdjustmentsUsd' in patch) {
    row.otherAdjustmentsAmount = toNumericString(patch.otherAdjustmentsUsd ?? null)
  }
  if ('endingGlBalanceUsd' in patch) {
    row.endingGlBalance = toNumericString(patch.endingGlBalanceUsd ?? null)
  }
  if ('notes' in patch) {
    row.notes = patch.notes ?? null
  }

  row.sourceHasManualInput = true
  row.updatedAt = new Date()
}

export const reportsRepository = {
  async getPortfolioSummary(
    query: PortfolioSummaryQuery,
    scope: ReportsScope,
  ): Promise<PortfolioSummaryResponse> {
    const partnershipRows = await buildPartnershipMetrics(query, scope)

    const byEntity = new Map<string, PartnershipMetrics[]>()
    for (const row of partnershipRows) {
      const existing = byEntity.get(row.entityId)
      if (existing) {
        existing.push(row)
      } else {
        byEntity.set(row.entityId, [row])
      }
    }

    const rows: PortfolioSummaryRow[] = [...byEntity.values()].map((entityRows) => {
      const sample = entityRows[0]!
      const originalCommitmentUsd = sumNullable(entityRows.map((row) => row.originalCommitmentUsd))
      const paidInUsd = sumNullable(entityRows.map((row) => row.paidInUsd))
      const distributionsUsd = sumNullable(entityRows.map((row) => row.distributionsUsd))
      const unfundedUsd = sumNullable(entityRows.map((row) => row.unfundedUsd))
      const multiples = aggregateMultiples(entityRows)

      const distinctAssetClasses = new Set(
        entityRows
          .map((row) => row.assetClass?.trim())
          .filter((value): value is string => Boolean(value)),
      )
      const assetClassSummary =
        distinctAssetClasses.size === 0
          ? null
          : distinctAssetClasses.size === 1
            ? [...distinctAssetClasses][0]!
            : 'Mixed'

      return {
        id: sample.entityId,
        entityId: sample.entityId,
        entityName: sample.entityName,
        entityType: sample.entityType,
        assetClassSummary,
        partnershipCount: entityRows.length,
        originalCommitmentUsd,
        calledPct: originalCommitmentUsd > 0 ? (paidInUsd / originalCommitmentUsd) * 100 : null,
        unfundedUsd,
        paidInUsd,
        distributionsUsd,
        residualValueUsd: multiples.residualValueUsd,
        dpi: multiples.dpi,
        rvpi: multiples.rvpi,
        tvpi: multiples.tvpi,
        irr: weightedAverage(entityRows, (row) => row.irr, (row) => row.originalCommitmentUsd),
        editability: mapEditability(entityRows),
      }
    })

    const sortedRows = sortRows(
      rows,
      query.sort,
      query.direction,
      PORTFOLIO_SORT_FIELDS,
      'entityName',
      (row) => row.entityName,
    )
    const totals = toTotals(sortedRows)

    const pageSize = query.pageSize
    const offset = (query.page - 1) * pageSize
    const pageRows = sortedRows.slice(offset, offset + pageSize)

    return {
      kpis: {
        totalCommitmentUsd: totals.originalCommitmentUsd,
        totalDistributionsUsd: totals.distributionsUsd,
        weightedIrr: totals.irr,
        weightedTvpi: totals.tvpi,
      },
      rows: pageRows,
      totals,
      page: {
        size: pageSize,
        offset,
        total: sortedRows.length,
      },
    }
  },

  async getAssetClassSummary(
    query: AssetClassSummaryQuery,
    scope: ReportsScope,
  ): Promise<AssetClassSummaryResponse> {
    const partnershipRows = await buildPartnershipMetrics(query, scope)

    const byAssetClass = new Map<string, PartnershipMetrics[]>()
    for (const row of partnershipRows) {
      const key = normalizeAssetClass(row.assetClass)
      const existing = byAssetClass.get(key)
      if (existing) {
        existing.push(row)
      } else {
        byAssetClass.set(key, [row])
      }
    }

    const rows: AssetClassSummaryRow[] = [...byAssetClass.entries()].map(
      ([assetClass, classRows]) => {
        const originalCommitmentUsd = sumNullable(
          classRows.map((row) => row.originalCommitmentUsd),
        )
        const paidInUsd = sumNullable(classRows.map((row) => row.paidInUsd))
        const distributionsUsd = sumNullable(
          classRows.map((row) => row.distributionsUsd),
        )
        const unfundedUsd = sumNullable(classRows.map((row) => row.unfundedUsd))
        const multiples = aggregateMultiples(classRows)

        return {
          id: assetClass,
          assetClass,
          partnershipCount: classRows.length,
          originalCommitmentUsd,
          calledPct:
            originalCommitmentUsd > 0
              ? (paidInUsd / originalCommitmentUsd) * 100
              : null,
          unfundedUsd,
          paidInUsd,
          distributionsUsd,
          residualValueUsd: multiples.residualValueUsd,
          dpi: multiples.dpi,
          rvpi: multiples.rvpi,
          tvpi: multiples.tvpi,
          irr: weightedAverage(
            classRows,
            (row) => row.irr,
            (row) => row.originalCommitmentUsd,
          ),
        }
      },
    )

    const sortedRows = sortRows(
      rows,
      query.sort,
      query.direction,
      ASSET_CLASS_SORT_FIELDS,
      'assetClass',
      (row) => row.assetClass,
    )

    return {
      rows: sortedRows,
      totals: toTotals(sortedRows),
    }
  },

  async getActivityDetail(
    query: ActivityDetailQuery,
    scope: ReportsScope,
  ): Promise<ActivityDetailResponse> {
    const rows = pool
      ? await getDbActivityDetailRows(query, scope)
      : getInMemoryActivityDetailRows(query, scope)

    const sortedRows = sortRows(
      rows,
      query.sort,
      query.direction,
      ACTIVITY_DETAIL_SORT_FIELDS,
      'taxYear',
      (row) => `${row.entityName}:${row.partnershipName}:${row.taxYear}:${row.id}`,
    )

    const pageSize = query.pageSize
    const offset = (query.page - 1) * pageSize

    return {
      rows: sortedRows.slice(offset, offset + pageSize),
      page: {
        size: pageSize,
        offset,
        total: sortedRows.length,
      },
    }
  },

  async updateActivityDetailRow(
    rowId: string,
    patch: UpdateActivityDetailBody,
    context: ActivityDetailEditContext,
    client: PoolClient | null,
  ): Promise<ActivityDetailRow | null> {
    if (!pool || !client) {
      const target = getInMemoryActivityDetailRowById(rowId)
      if (!target) return null

      if (!isEntityInScope(target.entityId, context.scope)) {
        throw new Error(FORBIDDEN_ENTITY_ERROR)
      }

      assertActivityExpectedUpdatedAt(patch.expectedUpdatedAt, target.updatedAt)

      const beforeRows = getInMemoryActivityDetailRows(
        {
          page: 1,
          pageSize: 1,
          sort: 'updatedAt',
          direction: 'desc',
          entityId: target.entityId,
          partnershipId: target.partnershipId,
          taxYear: target.taxYear,
          dateRange: 'all',
        },
        { isAdmin: true, entityIds: [] },
      )
      const before = beforeRows.find((row) => row.id === rowId)
      if (!before) return null

      applyInMemoryActivityPatch(target, patch)

      const afterRows = getInMemoryActivityDetailRows(
        {
          page: 1,
          pageSize: 1,
          sort: 'updatedAt',
          direction: 'desc',
          entityId: target.entityId,
          partnershipId: target.partnershipId,
          taxYear: target.taxYear,
          dateRange: 'all',
        },
        { isAdmin: true, entityIds: [] },
      )
      const after = afterRows.find((row) => row.id === rowId)
      if (!after) return null

      activityDetailUndoState.set(
        activityDetailUndoKey(context.actorUserId, rowId),
        {
          rowId,
          expectedUpdatedAt: after.updatedAt,
          previousValues: toUndoSnapshotValues(before),
        },
      )

      await auditRepository.record({
        actorUserId: context.actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.REPORT_ACTIVITY_DETAIL_EDITED,
        objectType: 'partnership_annual_activity',
        objectId: rowId,
        before,
        after,
      })

      return after
    }

    const beforeRow = await getDbActivityDetailRowById(rowId, client)
    if (!beforeRow) return null

    if (!isEntityInScope(beforeRow.entity_id, context.scope)) {
      throw new Error(FORBIDDEN_ENTITY_ERROR)
    }

    assertActivityExpectedUpdatedAt(patch.expectedUpdatedAt, beforeRow.updated_at)
    const before = mapDbActivityDetailRow(beforeRow)

    const next = {
      beginningBasisUsd:
        'beginningBasisUsd' in patch
          ? patch.beginningBasisUsd ?? null
          : toNumber(beforeRow.beginning_basis_amount),
      contributionsUsd:
        'contributionsUsd' in patch
          ? patch.contributionsUsd ?? null
          : toNumber(beforeRow.contributions_amount),
      otherAdjustmentsUsd:
        'otherAdjustmentsUsd' in patch
          ? patch.otherAdjustmentsUsd ?? null
          : toNumber(beforeRow.other_adjustments_amount),
      endingGlBalanceUsd:
        'endingGlBalanceUsd' in patch
          ? patch.endingGlBalanceUsd ?? null
          : toNumber(beforeRow.ending_gl_balance),
      notes: 'notes' in patch ? patch.notes ?? null : (beforeRow.notes ?? null),
    }

    const updateResult = await client.query(
      `
      update partnership_annual_activity
      set
        beginning_basis_amount = $2,
        contributions_amount = $3,
        other_adjustments_amount = $4,
        ending_gl_balance = $5,
        notes = $6,
        source_has_manual_input = true,
        updated_at = now()
      where id = $1
      returning
        *,
        (select name from entities where id = entity_id) as entity_name,
        (select name from partnerships where id = partnership_id) as partnership_name
      `,
      [
        rowId,
        next.beginningBasisUsd,
        next.contributionsUsd,
        next.otherAdjustmentsUsd,
        next.endingGlBalanceUsd,
        next.notes,
      ],
    )

    const updatedRow = updateResult.rows[0]
    if (!updatedRow) return null

    const after = mapDbActivityDetailRow(updatedRow)

    activityDetailUndoState.set(
      activityDetailUndoKey(context.actorUserId, rowId),
      {
        rowId,
        expectedUpdatedAt: after.updatedAt,
        previousValues: toUndoSnapshotValues(before),
      },
    )

    await auditRepository.record(
      {
        actorUserId: context.actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.REPORT_ACTIVITY_DETAIL_EDITED,
        objectType: 'partnership_annual_activity',
        objectId: rowId,
        before,
        after,
      },
      client,
    )

    return after
  },

  async undoActivityDetailEdit(
    rowId: string,
    context: ActivityDetailEditContext,
    client: PoolClient | null,
  ): Promise<ActivityDetailRow | null> {
    const undoKey = activityDetailUndoKey(context.actorUserId, rowId)
    const undoState = activityDetailUndoState.get(undoKey)
    if (!undoState) {
      throw new Error(ACTIVITY_DETAIL_UNDO_NOT_AVAILABLE_ERROR)
    }

    if (!pool || !client) {
      const target = getInMemoryActivityDetailRowById(rowId)
      if (!target) {
        activityDetailUndoState.delete(undoKey)
        return null
      }

      if (!isEntityInScope(target.entityId, context.scope)) {
        throw new Error(FORBIDDEN_ENTITY_ERROR)
      }

      assertActivityExpectedUpdatedAt(undoState.expectedUpdatedAt, target.updatedAt)

      const beforeRows = getInMemoryActivityDetailRows(
        {
          page: 1,
          pageSize: 1,
          sort: 'updatedAt',
          direction: 'desc',
          entityId: target.entityId,
          partnershipId: target.partnershipId,
          taxYear: target.taxYear,
          dateRange: 'all',
        },
        { isAdmin: true, entityIds: [] },
      )
      const before = beforeRows.find((row) => row.id === rowId)
      if (!before) {
        activityDetailUndoState.delete(undoKey)
        return null
      }

      applyInMemoryActivityPatch(target, {
        beginningBasisUsd: undoState.previousValues.beginningBasisUsd,
        contributionsUsd: undoState.previousValues.contributionsUsd,
        otherAdjustmentsUsd: undoState.previousValues.otherAdjustmentsUsd,
        endingGlBalanceUsd: undoState.previousValues.endingGlBalanceUsd,
        notes: undoState.previousValues.notes,
      })

      const afterRows = getInMemoryActivityDetailRows(
        {
          page: 1,
          pageSize: 1,
          sort: 'updatedAt',
          direction: 'desc',
          entityId: target.entityId,
          partnershipId: target.partnershipId,
          taxYear: target.taxYear,
          dateRange: 'all',
        },
        { isAdmin: true, entityIds: [] },
      )
      const after = afterRows.find((row) => row.id === rowId)
      if (!after) {
        activityDetailUndoState.delete(undoKey)
        return null
      }

      activityDetailUndoState.delete(undoKey)

      await auditRepository.record({
        actorUserId: context.actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.REPORT_ACTIVITY_DETAIL_UNDONE,
        objectType: 'partnership_annual_activity',
        objectId: rowId,
        before,
        after,
      })

      return after
    }

    const beforeRow = await getDbActivityDetailRowById(rowId, client)
    if (!beforeRow) {
      activityDetailUndoState.delete(undoKey)
      return null
    }

    if (!isEntityInScope(beforeRow.entity_id, context.scope)) {
      throw new Error(FORBIDDEN_ENTITY_ERROR)
    }

    assertActivityExpectedUpdatedAt(undoState.expectedUpdatedAt, beforeRow.updated_at)
    const before = mapDbActivityDetailRow(beforeRow)

    const updateResult = await client.query(
      `
      update partnership_annual_activity
      set
        beginning_basis_amount = $2,
        contributions_amount = $3,
        other_adjustments_amount = $4,
        ending_gl_balance = $5,
        notes = $6,
        source_has_manual_input = true,
        updated_at = now()
      where id = $1
      returning
        *,
        (select name from entities where id = entity_id) as entity_name,
        (select name from partnerships where id = partnership_id) as partnership_name
      `,
      [
        rowId,
        undoState.previousValues.beginningBasisUsd,
        undoState.previousValues.contributionsUsd,
        undoState.previousValues.otherAdjustmentsUsd,
        undoState.previousValues.endingGlBalanceUsd,
        undoState.previousValues.notes,
      ],
    )

    const updatedRow = updateResult.rows[0]
    if (!updatedRow) {
      activityDetailUndoState.delete(undoKey)
      return null
    }

    const after = mapDbActivityDetailRow(updatedRow)
    activityDetailUndoState.delete(undoKey)

    await auditRepository.record(
      {
        actorUserId: context.actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.REPORT_ACTIVITY_DETAIL_UNDONE,
        objectType: 'partnership_annual_activity',
        objectId: rowId,
        before,
        after,
      },
      client,
    )

    return after
  },
}
