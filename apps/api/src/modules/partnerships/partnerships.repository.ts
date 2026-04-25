import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { capitalRepository } from './capital.repository.js'
import { fmvRepository } from './fmv.repository.js'
import type {
  PartnershipDirectoryRow,
  PartnershipDirectoryResponse,
  PartnershipDetail,
  Partnership,
} from '../../../../../packages/types/src/partnership-management.js'
import type {
  ListPartnershipsQuery,
  ExportPartnershipsQuery,
  CreatePartnershipBody,
  UpdatePartnershipBody,
} from './partnerships.zod.js'

// ---------------------------------------------------------------------------
// In-memory side-store for fields that the k1 PartnershipRecord doesn't carry
// (assetClass / status / notes). Used only when DATABASE_URL is unset.
// ---------------------------------------------------------------------------

interface InMemoryPartnershipOverlay {
  assetClass: string | null
  status: Partnership['status']
  notes: string | null
  createdAt: string
  updatedAt: string
}

const inMemoryOverlays = new Map<string, InMemoryPartnershipOverlay>()

function getOrCreateOverlay(id: string): InMemoryPartnershipOverlay {
  let overlay = inMemoryOverlays.get(id)
  if (!overlay) {
    const now = new Date().toISOString()
    overlay = { assetClass: null, status: 'ACTIVE', notes: null, createdAt: now, updatedAt: now }
    inMemoryOverlays.set(id, overlay)
  }
  return overlay
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SORT_COLUMN_MAP: Record<string, string> = {
  name: 'p.name',
  entity: 'e.name',
  assetClass: 'p.asset_class',
  latestK1Year: 'kpi.latest_k1_year',
  latestDistributionUsd: 'kpi.latest_distribution_usd',
  latestFmvAmountUsd: 'fmv.fmv_amount',
  status: 'p.status',
}

function buildScopeClause(scope: { isAdmin: boolean; entityIds: string[] }): {
  clause: string
  params: string[]
} {
  if (scope.isAdmin) return { clause: '', params: [] }
  if (scope.entityIds.length === 0) return { clause: 'and false', params: [] }
  const placeholders = scope.entityIds.map((_, i) => `$${i + 1}`).join(', ')
  return { clause: `and p.entity_id in (${placeholders})`, params: scope.entityIds }
}

function buildFilterClauses(
  filters: ListPartnershipsQuery | ExportPartnershipsQuery,
  startParamIdx: number,
): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  let idx = startParamIdx

  if (filters.search) {
    clauses.push(
      `(lower(p.name) like lower($${idx}) or lower(e.name) like lower($${idx}))`,
    )
    params.push(`%${filters.search}%`)
    idx++
  }
  if (filters.entityId) {
    clauses.push(`p.entity_id = $${idx}`)
    params.push(filters.entityId)
    idx++
  }
  if (filters.assetClass) {
    clauses.push(`lower(p.asset_class) = lower($${idx})`)
    params.push(filters.assetClass)
    idx++
  }
  if (filters.status && filters.status.length > 0) {
    const ph = filters.status.map((_, i) => `$${idx + i}`).join(', ')
    clauses.push(`p.status in (${ph})`)
    params.push(...filters.status)
    idx += filters.status.length
  }
  return { clauses, params }
}

// ---------------------------------------------------------------------------
// Core CTE used by list, totals, and export
// ---------------------------------------------------------------------------

const BASE_CTE = `
  with
  latest_k1 as (
    -- "Latest Distribution" surfaces the most recent non-superseded K-1 with a
    -- distribution value (any lifecycle state). Finalization is ONLY required
    -- for the Expected Distribution History reconciliation (not computed here).
    select distinct on (kd.partnership_id)
      kd.partnership_id,
      kd.tax_year as latest_k1_year,
      coalesce(
        krd.reported_distribution_amount,
        (select coalesce(fv.reviewer_corrected_value, fv.normalized_value, fv.raw_value)
           from k1_field_values fv
          where fv.k1_document_id = kd.id
            and fv.field_name in ('box_19a_distribution', 'box_19_distributions')
          limit 1)
      ) as latest_distribution_usd
    from k1_documents kd
    left join k1_reported_distributions krd on krd.k1_document_id = kd.id
    where kd.superseded_by_document_id is null
      and kd.tax_year is not null
      and kd.partnership_id is not null
    order by
      kd.partnership_id,
      kd.tax_year desc,
      kd.finalized_at desc nulls last,
      kd.uploaded_at desc
  ),
  latest_fmv as (
    select distinct on (fmv.partnership_id)
      fmv.partnership_id,
      fmv.fmv_amount,
      fmv.valuation_date        as as_of_date,
      fmv.created_at
    from partnership_fmv_snapshots fmv
    order by fmv.partnership_id, fmv.created_at desc, fmv.valuation_date desc, fmv.id desc
  ),
  latest_commitment as (
    select distinct on (c.partnership_id)
      c.partnership_id,
      c.commitment_amount,
      c.source_type
    from partnership_commitments c
    where c.status = 'ACTIVE'
    order by c.partnership_id, c.created_at desc, c.id desc
  ),
  paid_in_totals as (
    select
      e.partnership_id,
      coalesce(
        sum(
          case
            when e.event_type in ('funded_contribution', 'other_adjustment') then e.amount
            else 0
          end
        ),
        0
      ) as paid_in_usd
    from capital_activity_events e
    group by e.partnership_id
  )
`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// In-memory fallback used when DATABASE_URL is not configured (local dev).
// Surfaces the K-1 module's in-memory partnerships (including those auto-created
// from K-1 uploads) so the Partnerships UI works without Postgres.

/** Resolve the latest K-1 (any status) for a partnership that has a distribution value. */
const latestFinalizedK1 = (partnershipId: string) => {
  // Consider all non-superseded K-1s with a known tax year, newest first.
  // "Latest Distribution" should reflect the most recently parsed value regardless
  // of finalization state — finalization gating is reserved for
  // "Expected Distribution History" reconciliation.
  const candidates = k1Repository
    .listK1sForPartnership(partnershipId)
    .filter((k) => k.taxYear != null)
    .sort(
      (a, b) =>
        (b.taxYear as number) - (a.taxYear as number) ||
        b.uploadedAt.getTime() - a.uploadedAt.getTime(),
    )
  for (const k of candidates) {
    const dist = reviewRepository.getEffectiveReportedDistribution(k.id)
    const amount = dist?.reportedDistributionAmount
    if (amount != null) {
      return { k1: k, distributionUsd: Number(amount) }
    }
  }
  // Fall back to newest K-1 with no distribution so year/KPI still populates.
  const top = candidates[0]
  return top ? { k1: top, distributionUsd: null } : null
}

const buildInMemoryDirectoryRow = (p: { id: string; name: string; entityId: string }): PartnershipDirectoryRow => {
  const entity = k1Repository.listEntities().find((e) => e.id === p.entityId)
  const latest = latestFinalizedK1(p.id)
  const overlay = getOrCreateOverlay(p.id)
  return {
    id: p.id,
    name: p.name,
    entity: { id: p.entityId, name: entity?.name ?? 'Unknown Entity' },
    assetClass: overlay.assetClass,
    status: overlay.status,
    latestK1Year: latest?.k1.taxYear ?? null,
    latestDistributionUsd: latest?.distributionUsd ?? null,
    latestFmv: null,
  }
}

const inMemoryPartnerships = (scope: { isAdmin: boolean; entityIds: string[] }) => {
  const all = k1Repository.listPartnerships()
  return scope.isAdmin ? all : all.filter((p) => scope.entityIds.includes(p.entityId))
}

export const partnershipsRepository = {
  async listPartnerships(
    filters: ListPartnershipsQuery,
    scope: { isAdmin: boolean; entityIds: string[] },
  ): Promise<PartnershipDirectoryResponse> {
    if (!pool) {
      let rows = inMemoryPartnerships(scope).map(buildInMemoryDirectoryRow)
      if (filters.search) {
        const q = filters.search.toLowerCase()
        rows = rows.filter(
          (r) => r.name.toLowerCase().includes(q) || r.entity.name.toLowerCase().includes(q),
        )
      }
      if (filters.entityId) rows = rows.filter((r) => r.entity.id === filters.entityId)
      if (filters.assetClass) rows = rows.filter((r) => r.assetClass === filters.assetClass)
      if (filters.status?.length) rows = rows.filter((r) => filters.status.includes(r.status))

      const total = rows.length
      const offset = (filters.page - 1) * filters.pageSize
      const pageRows = rows.slice(offset, offset + filters.pageSize)
      const totalDistributionsUsd = rows.reduce(
        (sum, r) => sum + (r.latestDistributionUsd ?? 0),
        0,
      )
      const capitalOverviews = await Promise.all(
        rows.map(async (row) => capitalRepository.calculateCapitalOverview(row.id)),
      )
      const totalCommitmentUsd = capitalOverviews.reduce(
        (sum, overview) => sum + (overview.originalCommitmentUsd ?? 0),
        0,
      )
      const totalPaidInUsd = capitalOverviews.reduce(
        (sum, overview) => sum + overview.paidInUsd,
        0,
      )
      const totalUnfundedUsd = capitalOverviews.reduce(
        (sum, overview) => sum + (overview.unfundedUsd ?? 0),
        0,
      )
      return {
        rows: pageRows,
        totals: {
          partnershipCount: total,
          totalDistributionsUsd,
          totalFmvUsd: 0,
          totalCommitmentUsd,
          totalPaidInUsd,
          totalUnfundedUsd,
        },
        page: { size: filters.pageSize, offset, total },
      }
    }

    const { clause: scopeClause, params: scopeParams } = buildScopeClause(scope)
    const filterBase = { ...filters, search: filters.search, entityId: filters.entityId, assetClass: filters.assetClass, status: filters.status }
    const { clauses: filterClauses, params: filterParams } = buildFilterClauses(
      filterBase,
      scopeParams.length + 1,
    )

    const allParams: unknown[] = [...scopeParams, ...filterParams]
    const whereBody = [scopeClause, ...filterClauses.map((c) => `and ${c}`)].filter(Boolean).join(' ')
    const whereClause = whereBody ? `where 1=1 ${whereBody}` : ''

    // Determine sort column
    const rawSort = filters.sort ?? 'name'
    const isDesc = rawSort.startsWith('-')
    const sortKey = isDesc ? rawSort.slice(1) : rawSort
    const sortCol = SORT_COLUMN_MAP[sortKey] ?? 'p.name'
    const sortDir = isDesc ? 'desc' : 'asc'

    const offset = (filters.page - 1) * filters.pageSize
    const limitIdx = allParams.length + 1
    const offsetIdx = allParams.length + 2
    allParams.push(filters.pageSize, offset)

    const rowsSql = `
      ${BASE_CTE}
      select
        p.id,
        p.name,
        e.id        as entity_id,
        e.name      as entity_name,
        p.asset_class,
        p.status,
        kpi.latest_k1_year,
        kpi.latest_distribution_usd,
        fmv.fmv_amount          as fmv_amount_usd,
        fmv.as_of_date          as fmv_as_of_date,
        fmv.created_at          as fmv_created_at,
        count(*) over ()        as total_count
      from partnerships p
      join entities e on e.id = p.entity_id
      left join latest_k1 kpi on kpi.partnership_id = p.id
      left join latest_fmv fmv on fmv.partnership_id = p.id
      ${whereClause}
      order by ${sortCol} ${sortDir} nulls last, p.id asc
      limit $${limitIdx} offset $${offsetIdx}
    `

    const totalsSql = `
      ${BASE_CTE}
      select
        count(*)::int                              as partnership_count,
        coalesce(sum(kpi.latest_distribution_usd), 0)::numeric as total_distributions_usd,
        coalesce(sum(fmv.fmv_amount), 0)::numeric  as total_fmv_usd,
        coalesce(sum(latest_commitment.commitment_amount), 0)::numeric as total_commitment_usd,
        coalesce(sum(paid_in_totals.paid_in_usd), 0)::numeric as total_paid_in_usd,
        coalesce(
          sum(coalesce(latest_commitment.commitment_amount, 0) - coalesce(paid_in_totals.paid_in_usd, 0)),
          0
        )::numeric as total_unfunded_usd
      from partnerships p
      join entities e on e.id = p.entity_id
      left join latest_k1 kpi on kpi.partnership_id = p.id
      left join latest_fmv fmv on fmv.partnership_id = p.id
      left join latest_commitment on latest_commitment.partnership_id = p.id
      left join paid_in_totals on paid_in_totals.partnership_id = p.id
      ${whereClause}
    `

    const [rowsResult, totalsResult] = await Promise.all([
      pool.query(rowsSql, allParams),
      pool.query(totalsSql, [...scopeParams, ...filterParams]),
    ])

    const total = rowsResult.rows[0]?.total_count ?? 0
    const rows: PartnershipDirectoryRow[] = rowsResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      entity: { id: r.entity_id, name: r.entity_name },
      assetClass: r.asset_class ?? null,
      status: r.status,
      latestK1Year: r.latest_k1_year ?? null,
      latestDistributionUsd: r.latest_distribution_usd ?? null,
      latestFmv: r.fmv_amount_usd != null
        ? { amountUsd: Number(r.fmv_amount_usd), asOfDate: r.fmv_as_of_date, createdAt: r.fmv_created_at }
        : null,
    }))

    const t = totalsResult.rows[0]
    return {
      rows,
      totals: {
        partnershipCount: Number(t.partnership_count),
        totalDistributionsUsd: Number(t.total_distributions_usd),
        totalFmvUsd: Number(t.total_fmv_usd),
        totalCommitmentUsd: Number(t.total_commitment_usd),
        totalPaidInUsd: Number(t.total_paid_in_usd),
        totalUnfundedUsd: Number(t.total_unfunded_usd),
      },
      page: { size: filters.pageSize, offset, total: Number(total) },
    }
  },

  async listForExport(
    filters: ExportPartnershipsQuery,
    scope: { isAdmin: boolean; entityIds: string[] },
  ): Promise<{ rows: PartnershipDirectoryRow[]; cappedAt5000: boolean }> {
    if (!pool) return { rows: [], cappedAt5000: false }

    const { clause: scopeClause, params: scopeParams } = buildScopeClause(scope)
    const { clauses: filterClauses, params: filterParams } = buildFilterClauses(
      filters,
      scopeParams.length + 1,
    )
    const allParams: unknown[] = [...scopeParams, ...filterParams]
    const whereBody = [scopeClause, ...filterClauses.map((c) => `and ${c}`)].filter(Boolean).join(' ')
    const whereClause = whereBody ? `where 1=1 ${whereBody}` : ''

    // Fetch cap+1 to detect overflow
    const limitIdx = allParams.length + 1
    allParams.push(5001)

    const sql = `
      ${BASE_CTE}
      select
        p.id, p.name,
        e.id as entity_id, e.name as entity_name,
        p.asset_class, p.status,
        kpi.latest_k1_year,
        kpi.latest_distribution_usd,
        fmv.fmv_amount as fmv_amount_usd,
        fmv.as_of_date as fmv_as_of_date,
        fmv.created_at as fmv_created_at
      from partnerships p
      join entities e on e.id = p.entity_id
      left join latest_k1 kpi on kpi.partnership_id = p.id
      left join latest_fmv fmv on fmv.partnership_id = p.id
      ${whereClause}
      order by p.name asc, p.id asc
      limit $${limitIdx}
    `
    const result = await pool.query(sql, allParams)
    const cappedAt5000 = result.rows.length > 5000
    const rows: PartnershipDirectoryRow[] = result.rows.slice(0, 5000).map((r) => ({
      id: r.id,
      name: r.name,
      entity: { id: r.entity_id, name: r.entity_name },
      assetClass: r.asset_class ?? null,
      status: r.status,
      latestK1Year: r.latest_k1_year ?? null,
      latestDistributionUsd: r.latest_distribution_usd ?? null,
      latestFmv: r.fmv_amount_usd != null
        ? { amountUsd: Number(r.fmv_amount_usd), asOfDate: r.fmv_as_of_date, createdAt: r.fmv_created_at }
        : null,
    }))
    return { rows, cappedAt5000 }
  },

  async getPartnershipById(
    id: string,
    scope: { isAdmin: boolean; entityIds: string[] },
  ): Promise<Partnership | null> {
    if (!pool) {
      const p = inMemoryPartnerships(scope).find((x) => x.id === id)
      if (!p) return null
      const entity = k1Repository.listEntities().find((e) => e.id === p.entityId)
      const overlay = getOrCreateOverlay(p.id)
      return {
        id: p.id,
        entity: { id: p.entityId, name: entity?.name ?? 'Unknown Entity' },
        name: p.name,
        assetClass: overlay.assetClass,
        status: overlay.status,
        notes: overlay.notes,
        createdAt: overlay.createdAt,
        updatedAt: overlay.updatedAt,
      }
    }
    const { clause: scopeClause, params: scopeParams } = buildScopeClause(scope)
    const idIdx = scopeParams.length + 1
    const sql = `
      select p.*, e.id as entity_id, e.name as entity_name
      from partnerships p
      join entities e on e.id = p.entity_id
      where p.id = $${idIdx} ${scopeClause}
    `
    const result = await pool.query(sql, [...scopeParams, id])
    const r = result.rows[0]
    if (!r) return null
    return {
      id: r.id,
      entity: { id: r.entity_id, name: r.entity_name },
      name: r.name,
      assetClass: r.asset_class ?? null,
      status: r.status,
      notes: r.notes ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  },

  async getPartnershipDetail(
    id: string,
    scope: { isAdmin: boolean; entityIds: string[] },
  ): Promise<PartnershipDetail | null> {
    if (!pool) {
      const partnership = await this.getPartnershipById(id, scope)
      if (!partnership) return null

      await capitalRepository.syncActivityDetail(id, partnership.entity.id)

      const k1s = k1Repository.listK1sForPartnership(id)

      const withDistribution = k1s.map((k) => {
        const dist = reviewRepository.getEffectiveReportedDistribution(k.id)
        const amount = dist?.reportedDistributionAmount
        return {
          record: k,
          reportedDistributionUsd: amount != null ? Number(amount) : null,
        }
      })

      const k1History = withDistribution
        .slice()
        .sort(
          (a, b) =>
            (b.record.taxYear ?? 0) - (a.record.taxYear ?? 0) ||
            b.record.uploadedAt.getTime() - a.record.uploadedAt.getTime(),
        )
        .map(({ record, reportedDistributionUsd }) => ({
          k1DocumentId: record.id,
          taxYear: record.taxYear ?? 0,
          processingStatus: record.processingStatus,
          reportedDistributionUsd,
          finalizedAt: null,
        }))

      // Expected distribution history = FINALIZED K-1s with a known tax year.
      const expectedDistributionHistory = withDistribution
        .filter(({ record }) => record.processingStatus === 'FINALIZED' && record.taxYear != null)
        .sort((a, b) => (b.record.taxYear as number) - (a.record.taxYear as number))
        .map(({ record, reportedDistributionUsd }) => ({
          taxYear: record.taxYear as number,
          reportedDistributionUsd,
          finalizedFromK1DocumentId: record.id,
        }))

      // "Latest Distribution" KPI reflects the most recently parsed value on
      // ANY non-superseded K-1 (not gated on finalization).
      const latestForKpi = withDistribution
        .filter(({ record }) => record.taxYear != null)
        .sort(
          (a, b) =>
            (b.record.taxYear as number) - (a.record.taxYear as number) ||
            b.record.uploadedAt.getTime() - a.record.uploadedAt.getTime(),
        )[0]

      const cumulativeReportedDistributionsUsd = expectedDistributionHistory.reduce(
        (sum, r) => sum + (r.reportedDistributionUsd ?? 0),
        0,
      )

      const fmvSnapshots = (await fmvRepository.listFmvSnapshots(id, scope)) ?? []

      const [commitments, capitalActivity, capitalOverview, activityDetail] = await Promise.all([
        capitalRepository.listCommitments(id),
        capitalRepository.listCapitalActivity(id),
        capitalRepository.calculateCapitalOverview(id),
        capitalRepository.listActivityDetail(id),
      ])

      return {
        partnership,
        kpis: {
          latestK1Year: latestForKpi?.record.taxYear ?? null,
          latestDistributionUsd: latestForKpi?.reportedDistributionUsd ?? null,
          latestFmvUsd: fmvSnapshots[0]?.amountUsd ?? null,
          cumulativeReportedDistributionsUsd,
        },
        k1History,
        expectedDistributionHistory,
        fmvSnapshots,
        commitments,
        capitalActivity,
        capitalOverview,
        activityDetail,
      }
    }

    const { clause: scopeClause, params: scopeParams } = buildScopeClause(scope)
    const idIdx = scopeParams.length + 1
    const allParams: unknown[] = [...scopeParams, id]

    // Fetch partnership + entity
    const partnershipSql = `
      select p.*, e.id as entity_id, e.name as entity_name
      from partnerships p
      join entities e on e.id = p.entity_id
      where p.id = $${idIdx} ${scopeClause}
    `
    const partnershipResult = await pool.query(partnershipSql, allParams)
    if (!partnershipResult.rows[0]) return null
    const pr = partnershipResult.rows[0]

    await capitalRepository.syncActivityDetail(id, pr.entity_id)

    const [
      kpisResult,
      k1HistResult,
      expDistResult,
      fmvResult,
      commitments,
      capitalActivity,
      capitalOverview,
      activityDetail,
    ] = await Promise.all([
      // KPIs
      pool.query(
        `
        select
          (select max(kd.tax_year)
           from k1_documents kd
           where kd.partnership_id = $1
             and kd.tax_year is not null)           as latest_k1_year,
          (select coalesce(
             krd.reported_distribution_amount,
             (select coalesce(fv.reviewer_corrected_value, fv.normalized_value, fv.raw_value)
                from k1_field_values fv
               where fv.k1_document_id = kd2.id
                 and fv.field_name in ('box_19a_distribution', 'box_19_distributions')
               limit 1)
           )
           from k1_documents kd2
           left join k1_reported_distributions krd on krd.k1_document_id = kd2.id
           where kd2.partnership_id = $1
             and kd2.tax_year is not null
             and kd2.superseded_by_document_id is null
           order by kd2.tax_year desc, kd2.finalized_at desc nulls last, kd2.uploaded_at desc
           limit 1)                                  as latest_distribution_usd,
          (select fmv.fmv_amount
           from partnership_fmv_snapshots fmv
           where fmv.partnership_id = $1
           order by fmv.created_at desc, fmv.valuation_date desc, fmv.id desc
           limit 1)                                  as latest_fmv_usd,
          (select coalesce(sum(paa.reported_distribution_amount), 0)
           from partnership_annual_activity paa
           where paa.partnership_id = $1)           as cumulative_usd
        `,
        [id],
      ),
      // K-1 history
      pool.query(
        `
        select kd.id as k1_document_id, kd.tax_year, kd.processing_status,
               krd.reported_distribution_amount as reported_distribution_usd,
               kd.finalized_at
        from k1_documents kd
        left join k1_reported_distributions krd on krd.k1_document_id = kd.id
        where kd.partnership_id = $1
        order by kd.tax_year desc, kd.created_at desc
        `,
        [id],
      ),
      // Expected distribution history
      pool.query(
        `
        select tax_year, reported_distribution_amount as reported_distribution_usd,
               finalized_from_k1_document_id
        from partnership_annual_activity
        where partnership_id = $1
          and (
            source_has_k1 = true
            or reported_distribution_amount is not null
            or finalized_from_k1_document_id is not null
          )
        order by tax_year desc
        `,
        [id],
      ),
      // FMV snapshots
      pool.query(
        `
        select fmv.id, fmv.partnership_id, fmv.valuation_date as as_of_date,
               fmv.fmv_amount as amount_usd, fmv.source_type as source,
               fmv.notes as note, fmv.created_at,
               u.id as recorded_by_user_id, u.email as recorded_by_email
        from partnership_fmv_snapshots fmv
        left join users u on u.id = fmv.created_by
        where fmv.partnership_id = $1
        order by fmv.created_at desc, fmv.valuation_date desc, fmv.id desc
        `,
        [id],
      ),
      capitalRepository.listCommitments(id),
      capitalRepository.listCapitalActivity(id),
      capitalRepository.calculateCapitalOverview(id),
      capitalRepository.listActivityDetail(id),
    ])

    const k = kpisResult.rows[0] ?? {}
    return {
      partnership: {
        id: pr.id,
        entity: { id: pr.entity_id, name: pr.entity_name },
        name: pr.name,
        assetClass: pr.asset_class ?? null,
        status: pr.status,
        notes: pr.notes ?? null,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      },
      kpis: {
        latestK1Year: k.latest_k1_year ?? null,
        latestDistributionUsd: k.latest_distribution_usd ?? null,
        latestFmvUsd: k.latest_fmv_usd ?? null,
        cumulativeReportedDistributionsUsd: Number(k.cumulative_usd ?? 0),
      },
      k1History: k1HistResult.rows.map((r) => ({
        k1DocumentId: r.k1_document_id,
        taxYear: r.tax_year,
        processingStatus: r.processing_status,
        reportedDistributionUsd: r.reported_distribution_usd ?? null,
        finalizedAt: r.finalized_at ?? null,
      })),
      expectedDistributionHistory: expDistResult.rows.map((r) => ({
        taxYear: r.tax_year,
        reportedDistributionUsd: r.reported_distribution_usd ?? null,
        finalizedFromK1DocumentId: r.finalized_from_k1_document_id ?? null,
      })),
      fmvSnapshots: fmvResult.rows.map((r) => ({
        id: r.id,
        partnershipId: r.partnership_id,
        asOfDate: r.as_of_date,
        amountUsd: Number(r.amount_usd),
        source: r.source,
        note: r.note ?? null,
        recordedByUserId: r.recorded_by_user_id ?? '',
        recordedByEmail: r.recorded_by_email ?? '',
        createdAt: r.created_at,
      })),
      commitments,
      capitalActivity,
      capitalOverview,
      activityDetail,
    }
  },

  async findByEntityAndName(
    entityId: string,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    if (!pool) {
      const needle = name.trim().toLowerCase()
      return k1Repository
        .listPartnerships()
        .some(
          (p) =>
            p.entityId === entityId &&
            p.name.trim().toLowerCase() === needle &&
            p.id !== excludeId,
        )
    }
    const params: unknown[] = [entityId, name.trim().toLowerCase()]
    let sql = `select 1 from partnerships where entity_id = $1 and lower(name) = $2`
    if (excludeId) {
      sql += ` and id != $3`
      params.push(excludeId)
    }
    const result = await pool.query(sql, params)
    return result.rows.length > 0
  },

  async insertPartnership(
    body: CreatePartnershipBody,
    actorUserId: string,
    client: PoolClient | null,
  ): Promise<Partnership> {
    if (!pool || !client) {
      const entity = k1Repository.listEntities().find((e) => e.id === body.entityId)
      if (!entity) throw new Error('ENTITY_NOT_FOUND')
      const created = k1Repository.createPartnership({
        entityId: body.entityId,
        name: body.name,
      })
      const overlay = getOrCreateOverlay(created.id)
      overlay.assetClass = body.assetClass ?? null
      overlay.status = body.status
      overlay.notes = body.notes ?? null
      overlay.updatedAt = new Date().toISOString()
      await auditRepository.record({
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.CREATED,
        objectType: 'partnership',
        objectId: created.id,
        before: null,
        after: { id: created.id, name: created.name, entity_id: created.entityId },
      })
      return {
        id: created.id,
        entity: { id: entity.id, name: entity.name },
        name: created.name,
        assetClass: overlay.assetClass,
        status: overlay.status,
        notes: overlay.notes,
        createdAt: overlay.createdAt,
        updatedAt: overlay.updatedAt,
      }
    }

    const id = randomUUID()
    const result = await client.query<{
      id: string; entity_id: string; name: string; asset_class: string | null
      status: string; notes: string | null; created_at: string; updated_at: string
    }>(
      `insert into partnerships (id, entity_id, name, asset_class, status, notes, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, now(), now())
       returning *`,
      [id, body.entityId, body.name, body.assetClass ?? null, body.status, body.notes ?? null],
    )
    const row = result.rows[0]

    // Fetch entity name for the response
    const entityResult = await client.query<{ name: string }>(
      `select name from entities where id = $1`,
      [body.entityId],
    )

    const fullRow = {
      id: row.id,
      entity_id: row.entity_id,
      name: row.name,
      asset_class: row.asset_class,
      status: row.status,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }

    await auditRepository.record(
      {
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.CREATED,
        objectType: 'partnership',
        objectId: id,
        before: null,
        after: fullRow,
      },
      client,
    )

    return {
      id: row.id,
      entity: { id: body.entityId, name: entityResult.rows[0]?.name ?? '' },
      name: row.name,
      assetClass: row.asset_class ?? null,
      status: row.status as Partnership['status'],
      notes: row.notes ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async updatePartnership(
    id: string,
    patch: UpdatePartnershipBody,
    actorUserId: string,
    client: PoolClient | null,
  ): Promise<Partnership | null> {
    if (!pool || !client) {
      // In-memory update path
      const p = k1Repository.getPartnership(id)
      if (!p) return null
      const entity = k1Repository.listEntities().find((e) => e.id === p.entityId)
      const overlay = getOrCreateOverlay(id)
      const before = {
        id,
        name: p.name,
        asset_class: overlay.assetClass,
        status: overlay.status,
        notes: overlay.notes,
      }
      if (patch.name !== undefined) p.name = patch.name
      if ('assetClass' in patch) overlay.assetClass = patch.assetClass ?? null
      if (patch.status !== undefined) overlay.status = patch.status
      if ('notes' in patch) overlay.notes = patch.notes ?? null
      overlay.updatedAt = new Date().toISOString()
      const after = {
        id,
        name: p.name,
        asset_class: overlay.assetClass,
        status: overlay.status,
        notes: overlay.notes,
      }
      await auditRepository.record({
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.UPDATED,
        objectType: 'partnership',
        objectId: id,
        before,
        after,
      })
      return {
        id,
        entity: { id: p.entityId, name: entity?.name ?? 'Unknown Entity' },
        name: p.name,
        assetClass: overlay.assetClass,
        status: overlay.status,
        notes: overlay.notes,
        createdAt: overlay.createdAt,
        updatedAt: overlay.updatedAt,
      }
    }

    // Fetch current row for before_json
    const beforeResult = await client.query(
      `select p.*, e.id as entity_id, e.name as entity_name from partnerships p join entities e on e.id = p.entity_id where p.id = $1`,
      [id],
    )
    if (!beforeResult.rows[0]) return null
    const before = beforeResult.rows[0]

    const sets: string[] = ['updated_at = now()']
    const params: unknown[] = []
    if (patch.name !== undefined) { params.push(patch.name); sets.push(`name = $${params.length}`) }
    if ('assetClass' in patch) { params.push(patch.assetClass ?? null); sets.push(`asset_class = $${params.length}`) }
    if (patch.status !== undefined) { params.push(patch.status); sets.push(`status = $${params.length}`) }
    if ('notes' in patch) { params.push(patch.notes ?? null); sets.push(`notes = $${params.length}`) }

    params.push(id)
    const result = await client.query(
      `update partnerships set ${sets.join(', ')} where id = $${params.length} returning *`,
      params,
    )
    const after = result.rows[0]

    await auditRepository.record(
      {
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.UPDATED,
        objectType: 'partnership',
        objectId: id,
        before,
        after,
      },
      client,
    )

    return {
      id: after.id,
      entity: { id: before.entity_id, name: before.entity_name },
      name: after.name,
      assetClass: after.asset_class ?? null,
      status: after.status as Partnership['status'],
      notes: after.notes ?? null,
      createdAt: after.created_at,
      updatedAt: after.updated_at,
    }
  },
}
