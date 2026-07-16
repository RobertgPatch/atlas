import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'
import { pool, withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_TRACKER_AUDIT_EVENTS } from '../audit/audit.events.js'
import { k1TrackerRepository } from '../k1-tracker/k1-tracker.repository.js'
import { recomputeActiveCommitmentMarker } from '../partnerships/capital.repository.js'
import type { K1TrackerFieldChange } from '../k1-tracker/k1-tracker.contracts.js'
import type {
  PartnershipAggregationQuery,
  PartnershipAggregationResponse,
  PartnershipCommitmentEntry,
  PartnershipManagementFeeEstimate,
  PartnershipNavEntry,
  PartnershipTrackerDetail,
  PartnershipTrackerListResponse,
  PartnershipTrackerSummary,
  PartnershipTrackerWorkflowStatus,
  PartnershipType,
} from './partnership-tracker.contracts.js'
import { PARTNERSHIP_TYPES } from './partnership-tracker.contracts.js'
import { composePartnershipAggregation } from './partnership-aggregation.js'
import { composePartnershipPerformance, type PartnershipAnnualPerformanceValue } from './partnership-performance.js'
import { calculateManagementFeeEstimate } from './management-fee.js'
import { PartnershipTrackerError, type PartnershipTrackerScope } from './partnership-tracker.types.js'

type PartnershipRow = QueryResultRow & {
  id: string; entity_id: string; entity_name: string; name: string; asset_class: string | null
  status: PartnershipTrackerSummary['partnership']['status']; notes: string | null
  inception_date: Date | string | null; management_fee_rate: string | null
  created_at: Date | string; updated_at: Date | string; current_commitment: string | null
  current_commitment_date: Date | string | null; latest_nav: string | null; latest_nav_date: Date | string | null
  earliest_k1_year: number | null; latest_k1_year: number | null; latest_workflow_status: string | null
  latest_ending_basis: string | null; latest_section_l_capital: string | null; warning_count: string; total_count: string
  annual_performance: PartnershipAnnualPerformanceValue[] | null
}
type CommitmentRow = QueryResultRow & {
  id: string; partnership_id: string; commitment_amount: string; effective_date: Date | string
  source_type: 'manual' | 'parsed'; notes: string | null; created_at: Date | string; updated_at: Date | string
  is_current: boolean
}
type NavRow = QueryResultRow & {
  id: string; partnership_id: string; fmv_amount: string; valuation_date: Date | string
  source_type: PartnershipNavEntry['sourceType']; notes: string | null; created_at: Date | string; updated_at: Date | string
}

const database = () => {
  if (!pool) throw new PartnershipTrackerError('DATABASE_UNAVAILABLE', 503, 'Partnership Tracker requires PostgreSQL.')
  return pool
}
const dateOnly = (value: Date | string): string => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value).slice(0, 10)
const iso = (value: Date | string): string => new Date(value).toISOString()
const money = (value: string | null): string | null => {
  if (value == null) return null
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [whole = '0', fraction = ''] = unsigned.split('.')
  return `${negative ? '-' : ''}${whole}.${(fraction + '00').slice(0, 2)}`
}
const ratio = (value: string | null): string | null => value == null ? null : Number(value).toFixed(8)
const workflow = (value: string | null): PartnershipTrackerWorkflowStatus | null =>
  value === 'IMPORTED' ? 'IN_PROGRESS' : value as PartnershipTrackerWorkflowStatus | null
const partnershipType = (value: string | null): PartnershipType =>
  PARTNERSHIP_TYPES.includes(value as PartnershipType) ? value as PartnershipType : 'Other'
const scoped = (entityId: string, scope: PartnershipTrackerScope) => scope.isAdmin || scope.entityIds.includes(entityId)
const validateInceptionDate = (value: string | null | undefined) => {
  if (value != null && value > new Date().toISOString().slice(0, 10)) {
    throw new PartnershipTrackerError('VALIDATION_ERROR', 400, 'Inception date cannot be in the future.')
  }
}

const mapSummary = (row: PartnershipRow): PartnershipTrackerSummary => {
  const latestNav = row.latest_nav == null || row.latest_nav_date == null
    ? null
    : { amount: money(row.latest_nav)!, date: dateOnly(row.latest_nav_date) }
  const annualValues = Array.isArray(row.annual_performance) ? row.annual_performance.map((value) => ({
    taxYear: Number(value.taxYear),
    hasCanonicalContribution: Boolean(value.hasCanonicalContribution),
    capitalContributions: value.capitalContributions == null ? null : String(value.capitalContributions),
    legacyCapitalContributions: value.legacyCapitalContributions == null ? null : String(value.legacyCapitalContributions),
    distributions: value.distributions == null ? null : String(value.distributions),
  })) : []
  const performance = composePartnershipPerformance({
    annualValues,
    latestNav,
    inceptionDate: row.inception_date == null ? null : dateOnly(row.inception_date),
    currentCommitment: money(row.current_commitment),
    latestEndingOutsideBasis: money(row.latest_ending_basis),
  })
  return {
  partnership: {
    id: row.id,
    entity: { id: row.entity_id, name: row.entity_name },
    name: row.name,
    partnershipType: partnershipType(row.asset_class),
    status: row.status,
    notes: row.notes ?? null,
    inceptionDate: row.inception_date == null ? null : dateOnly(row.inception_date),
    managementFeeRate: ratio(row.management_fee_rate),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  },
  currentCommittedCapital: row.current_commitment == null || row.current_commitment_date == null
    ? null
    : { amount: money(row.current_commitment)!, date: dateOnly(row.current_commitment_date) },
  latestNav,
  earliestK1Year: row.earliest_k1_year,
  latestTaxYear: row.latest_k1_year,
  latestWorkflowStatus: workflow(row.latest_workflow_status),
  latestEndingOutsideBasis: money(row.latest_ending_basis),
  latestSectionLCapital: money(row.latest_section_l_capital),
  totalCapitalContributions: performance.totalCapitalContributions,
  totalDistributions: performance.totalDistributions,
  dpi: performance.dpi,
  tvpi: performance.tvpi,
  irr: performance.irr,
  irrTerminalDate: performance.irrTerminalDate,
  irrUsesCarriedForwardNav: performance.irrUsesCarriedForwardNav,
  annualizedCashOnCashYield: performance.annualizedCashOnCashYield,
  performanceAsOfDate: performance.performanceAsOfDate,
  unfundedCommitmentAmount: performance.unfundedCommitmentAmount,
  unfundedCommitmentPercentage: performance.unfundedCommitmentPercentage,
  unrealizedGain: performance.unrealizedGain,
  performanceStatus: performance.performanceStatus,
  warningCount: Number(row.warning_count ?? 0),
  }
}

const summaryRows = async (
  scope: PartnershipTrackerScope,
  filters: { search?: string; entityId?: string; partnershipType?: PartnershipType; status?: string; limit?: number; offset?: number; partnershipId?: string },
): Promise<PartnershipRow[]> => {
  const params: unknown[] = []
  const where: string[] = []
  if (!scope.isAdmin) { params.push(scope.entityIds); where.push(`p.entity_id = any($${params.length}::uuid[])`) }
  if (filters.partnershipId) { params.push(filters.partnershipId); where.push(`p.id = $${params.length}`) }
  if (filters.search) { params.push(`%${filters.search}%`); where.push(`(p.name ilike $${params.length} or e.name ilike $${params.length})`) }
  if (filters.entityId) { params.push(filters.entityId); where.push(`p.entity_id = $${params.length}`) }
  if (filters.partnershipType) { params.push(filters.partnershipType); where.push(`p.asset_class = $${params.length}`) }
  if (filters.status) { params.push(filters.status); where.push(`p.status = $${params.length}`) }
  let pagination = ''
  if (filters.limit != null) {
    params.push(filters.limit, filters.offset ?? 0)
    const limitIndex = params.length - 1
    const offsetIndex = params.length
    pagination = `limit $${limitIndex} offset $${offsetIndex}`
  }
  return (await database().query<PartnershipRow>(`
    select p.id, p.entity_id, e.name as entity_name, p.name, p.asset_class, p.status, p.notes,
      p.inception_date, p.management_fee_rate, p.created_at, p.updated_at,
      commitment.commitment_amount as current_commitment,
      commitment.effective_date as current_commitment_date,
      nav.fmv_amount as latest_nav,
      nav.valuation_date as latest_nav_date,
      years.earliest_k1_year,
      years.latest_k1_year,
      latest_year.workflow_status as latest_workflow_status,
      latest_year.ending_outside_basis as latest_ending_basis,
      latest_year.latest_section_l_capital,
      years.annual_performance,
      coalesce(years.warning_count, 0)::text as warning_count,
      count(*) over()::text as total_count
    from partnerships p
    join entities e on e.id = p.entity_id
    left join lateral (
      select c.commitment_amount, coalesce(c.commitment_date, c.created_at::date) as effective_date
      from partnership_commitments c
      where c.partnership_id = p.id and coalesce(c.commitment_date, c.created_at::date) <= current_date
      order by coalesce(c.commitment_date, c.created_at::date) desc, c.created_at desc, c.id desc limit 1
    ) commitment on true
    left join lateral (
      select f.fmv_amount, f.valuation_date
      from partnership_fmv_snapshots f where f.partnership_id = p.id
      order by f.valuation_date desc, f.created_at desc, f.id desc limit 1
    ) nav on true
    left join lateral (
      select min(y.tax_year) as earliest_k1_year, max(y.tax_year) as latest_k1_year,
        coalesce(sum(y.warning_count), 0) as warning_count,
        jsonb_agg(jsonb_build_object(
          'taxYear', y.tax_year,
          'hasCanonicalContribution', coalesce(annual.has_canonical_contribution, false),
          'capitalContributions', annual.capital_contributions::text,
          'legacyCapitalContributions', annual.legacy_capital_contributions::text,
          'distributions', annual.distributions::text
        ) order by y.tax_year) filter (where y.id is not null) as annual_performance
      from k1_tracker_years y
      left join lateral (
        select
          bool_or(v.field_key = 'capital_contributions') as has_canonical_contribution,
          max(v.amount) filter (where v.field_key = 'capital_contributions') as capital_contributions,
          max(v.amount) filter (where v.field_key = 'section_l_capital_contributed') as legacy_capital_contributions,
          max(v.amount) filter (where v.field_key = 'box_19_distributions') as distributions
        from k1_tracker_value_revisions v
        where v.tracker_year_id = y.id and v.is_active = true
      ) annual on true
      where y.partnership_id = p.id
    ) years on true
    left join lateral (
      select y.workflow_status, y.ending_outside_basis,
        (
          select v.amount from k1_tracker_value_revisions v
          where v.tracker_year_id = y.id and v.field_key = 'section_l_ending_capital' and v.is_active = true
          order by v.created_at desc, v.id desc limit 1
        ) as latest_section_l_capital
      from k1_tracker_years y where y.partnership_id = p.id
      order by y.tax_year desc, y.updated_at desc, y.id desc limit 1
    ) latest_year on true
    ${where.length ? `where ${where.join(' and ')}` : ''}
    order by lower(p.name), p.id
    ${pagination}
  `, params)).rows
}

const assertPartnership = async (partnershipId: string, scope: PartnershipTrackerScope, client: PoolClient | NonNullable<typeof pool>) => {
  const row = (await client.query<{ id: string; entity_id: string }>('select id, entity_id from partnerships where id = $1', [partnershipId])).rows[0]
  if (!row) throw new PartnershipTrackerError('PARTNERSHIP_NOT_FOUND', 404, 'Partnership was not found.')
  if (!scoped(row.entity_id, scope)) throw new PartnershipTrackerError('FORBIDDEN', 403, 'The partnership is outside your entity scope.')
  return row
}

const mapCommitment = (row: CommitmentRow): PartnershipCommitmentEntry => ({
  id: row.id,
  partnershipId: row.partnership_id,
  amount: money(row.commitment_amount)!,
  effectiveDate: dateOnly(row.effective_date),
  sourceType: row.source_type,
  note: row.notes ?? null,
  isCurrent: row.is_current,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})
const mapNav = (row: NavRow): PartnershipNavEntry => ({
  id: row.id,
  partnershipId: row.partnership_id,
  amount: money(row.fmv_amount)!,
  valuationDate: dateOnly(row.valuation_date),
  sourceType: row.source_type,
  note: row.notes ?? null,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})

export const partnershipTrackerRepository = {
  async getAggregation(scope: PartnershipTrackerScope, query: PartnershipAggregationQuery): Promise<PartnershipAggregationResponse> {
    const rows = await summaryRows(scope, {})
    return composePartnershipAggregation(rows.map(mapSummary), query)
  },

  async listPartnerships(scope: PartnershipTrackerScope, filters: { search?: string; entityId?: string; partnershipType?: PartnershipType; status?: string; limit: number; cursor?: string }): Promise<PartnershipTrackerListResponse> {
    const offset = Number(filters.cursor ?? 0)
    const rows = await summaryRows(scope, { ...filters, offset })
    const total = Number(rows[0]?.total_count ?? 0)
    return { items: rows.map(mapSummary), total, nextCursor: offset + rows.length < total ? String(offset + rows.length) : null }
  },

  async getPartnership(partnershipId: string, scope: PartnershipTrackerScope): Promise<PartnershipTrackerDetail> {
    await assertPartnership(partnershipId, scope, database())
    const [summaries, k1, commitments, nav] = await Promise.all([
      summaryRows(scope, { partnershipId, limit: 1, offset: 0 }),
      k1TrackerRepository.getPartnership(partnershipId, scope, { syncSources: false }),
      this.listCommitments(partnershipId, scope),
      this.listNav(partnershipId, scope),
    ])
    const summary = summaries[0]
    if (!summary) throw new PartnershipTrackerError('PARTNERSHIP_NOT_FOUND', 404, 'Partnership was not found.')
    const canEdit = scope.isAdmin
    return {
      summary: mapSummary(summary),
      years: k1.years.map((year) => ({ ...year, status: workflow(year.status)! })),
      commitments: commitments.items,
      navEntries: nav.items,
      permissions: { canEditPartnership: canEdit, canEditK1: canEdit, canEditCommitment: canEdit, canEditNav: canEdit, canSignoff: canEdit },
    }
  },

  async createPartnership(body: { entityId: string; name: string; partnershipType: PartnershipType; notes?: string | null; inceptionDate?: string | null; managementFeeRate?: string | null }, actorUserId: string, scope: PartnershipTrackerScope) {
    validateInceptionDate(body.inceptionDate)
    const id = await withTransaction(async (client) => {
      const entity = (await client.query<{ id: string }>('select id from entities where id = $1', [body.entityId])).rows[0]
      if (!entity) throw new PartnershipTrackerError('PARTNERSHIP_NOT_FOUND', 404, 'Entity was not found.')
      if (!scoped(body.entityId, scope)) throw new PartnershipTrackerError('FORBIDDEN', 403, 'The entity is outside your scope.')
      const duplicate = (await client.query('select 1 from partnerships where entity_id = $1 and lower(trim(name)) = lower(trim($2)) limit 1', [body.entityId, body.name])).rows[0]
      if (duplicate) throw new PartnershipTrackerError('DUPLICATE_PARTNERSHIP_NAME', 409, 'A partnership with this name already exists for the entity.')
      const partnershipId = randomUUID()
      const row = (await client.query(`insert into partnerships (id, entity_id, name, asset_class, status, notes, inception_date, management_fee_rate, created_at, updated_at)
        values ($1,$2,$3,$4,'ACTIVE',$5,$6,$7,now(),now()) returning *`, [partnershipId, body.entityId, body.name.trim(), body.partnershipType, body.notes ?? null, body.inceptionDate ?? null, body.managementFeeRate ?? null])).rows[0]
      await auditRepository.record({ actorUserId, eventName: PARTNERSHIP_TRACKER_AUDIT_EVENTS.PARTNERSHIP_CREATED, objectType: 'partnership', objectId: partnershipId, before: null, after: row }, client)
      return partnershipId
    })
    const rows = await summaryRows(scope, { partnershipId: id, limit: 1, offset: 0 })
    return { partnership: mapSummary(rows[0]!), nextAction: 'ADD_K1_YEAR' as const }
  },

  async updatePartnership(partnershipId: string, patch: { entityId?: string; name?: string; partnershipType?: PartnershipType; status?: PartnershipTrackerSummary['partnership']['status']; notes?: string | null; inceptionDate?: string | null; managementFeeRate?: string | null; expectedUpdatedAt: string }, actorUserId: string, scope: PartnershipTrackerScope): Promise<PartnershipTrackerSummary> {
    validateInceptionDate(patch.inceptionDate)
    await withTransaction(async (client) => {
      await assertPartnership(partnershipId, scope, client)
      const before = (await client.query('select * from partnerships where id = $1 for update', [partnershipId])).rows[0]
      if (!before) throw new PartnershipTrackerError('PARTNERSHIP_NOT_FOUND', 404, 'Partnership was not found.')
      const targetEntityId = patch.entityId ?? before.entity_id
      const ownerChanged = targetEntityId !== before.entity_id
      if (ownerChanged) {
        const targetOwner = (await client.query<{ id: string }>('select id from entities where id = $1 for update', [targetEntityId])).rows[0]
        if (!targetOwner) throw new PartnershipTrackerError('OWNER_NOT_FOUND', 404, 'The selected owner was not found.')
        if (!scoped(targetEntityId, scope)) throw new PartnershipTrackerError('FORBIDDEN', 403, 'The selected owner is outside your scope.')
      }
      const targetName = patch.name?.trim() ?? before.name
      const duplicate = (await client.query('select 1 from partnerships where entity_id = $1 and id <> $2 and lower(trim(name)) = lower(trim($3)) limit 1', [targetEntityId, partnershipId, targetName])).rows[0]
      if (duplicate) throw new PartnershipTrackerError('DUPLICATE_PARTNERSHIP_NAME', 409, 'A partnership with this name already exists for the selected owner.')
      const result = await client.query(`update partnerships set
          entity_id = $2, name = coalesce($3, name), asset_class = coalesce($4, asset_class), status = coalesce($5, status),
          notes = case when $6::boolean then $7 else notes end,
          inception_date = case when $8::boolean then $9::date else inception_date end,
          management_fee_rate = case when $10::boolean then $11::numeric else management_fee_rate end,
          updated_at = now()
        where id = $1 and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $12::timestamptz)
        returning *`, [partnershipId, targetEntityId, patch.name?.trim() ?? null, patch.partnershipType ?? null, patch.status ?? null, Object.hasOwn(patch, 'notes'), patch.notes ?? null, Object.hasOwn(patch, 'inceptionDate'), patch.inceptionDate ?? null, Object.hasOwn(patch, 'managementFeeRate'), patch.managementFeeRate ?? null, patch.expectedUpdatedAt])
      if (!result.rows[0]) throw new PartnershipTrackerError('STALE_PARTNERSHIP_REVISION', 409, 'The partnership was changed by another user. Reload and try again.')
      const childRowCounts: Record<string, number> = {}
      if (ownerChanged) {
        for (const table of ['document_versions', 'k1_reported_distributions', 'partnership_commitments', 'capital_activity_events', 'partnership_annual_activity'] as const) {
          const moved = await client.query(`update ${table} set entity_id = $2 where partnership_id = $1 and entity_id = $3`, [partnershipId, targetEntityId, before.entity_id])
          childRowCounts[table] = moved.rowCount ?? 0
        }
        const importBatches = await client.query('update k1_tracker_import_batches set entity_id = $2 where target_partnership_id = $1 and entity_id = $3', [partnershipId, targetEntityId, before.entity_id])
        childRowCounts.k1_tracker_import_batches = importBatches.rowCount ?? 0
        const trackerYears = await client.query<{ id: string; revision: number }>(`update k1_tracker_years
          set entity_id = $2, revision = revision + 1, workflow_status = 'NEEDS_REVIEW', updated_by_user_id = $4, updated_at = now()
          where partnership_id = $1 and entity_id = $3
          returning id, revision`, [partnershipId, targetEntityId, before.entity_id, actorUserId])
        childRowCounts.k1_tracker_years = trackerYears.rowCount ?? 0
        for (const year of trackerYears.rows) {
          await client.query(`insert into k1_tracker_signoffs (id, tracker_year_id, year_revision, signoff_type, signed_by_user_id, reason, created_at)
            values ($1,$2,$3,'INVALIDATED',$4,'Partnership owner changed',now())`, [randomUUID(), year.id, year.revision, actorUserId])
        }
      }
      await auditRepository.record({
        actorUserId,
        eventName: PARTNERSHIP_TRACKER_AUDIT_EVENTS.PARTNERSHIP_UPDATED,
        objectType: 'partnership',
        objectId: partnershipId,
        before,
        after: ownerChanged ? { ...result.rows[0], ownerReassignment: { sourceEntityId: before.entity_id, targetEntityId, childRowCounts } } : result.rows[0],
      }, client)
    })
    const rows = await summaryRows(scope, { partnershipId, limit: 1, offset: 0 })
    return mapSummary(rows[0]!)
  },

  async listCommitments(partnershipId: string, scope: PartnershipTrackerScope, asOfDate?: string) {
    await assertPartnership(partnershipId, scope, database())
    const effectiveDate = asOfDate ?? new Date().toISOString().slice(0, 10)
    const rows = (await database().query<CommitmentRow>(`
      with history as (
        select c.*, coalesce(c.commitment_date, c.created_at::date) as effective_date
        from partnership_commitments c where c.partnership_id = $1
      ), current_entry as (
        select id from history where effective_date <= $2::date
        order by effective_date desc, created_at desc, id desc limit 1
      )
      select history.*, history.id = current_entry.id as is_current
      from history left join current_entry on true
      order by history.effective_date asc, history.created_at asc, history.id asc`, [partnershipId, effectiveDate])).rows
    const items = rows.map(mapCommitment)
    return { items, effectiveEntry: items.find((entry) => entry.isCurrent) ?? null }
  },

  async getManagementFees(partnershipId: string, scope: PartnershipTrackerScope, asOfDate = new Date().toISOString().slice(0, 10)): Promise<PartnershipManagementFeeEstimate> {
    await assertPartnership(partnershipId, scope, database())
    const partnership = (await database().query<{ inception_date: Date | string | null; management_fee_rate: string | null }>(
      'select inception_date, management_fee_rate from partnerships where id = $1',
      [partnershipId],
    )).rows[0]!
    const inceptionDate = partnership.inception_date == null ? null : dateOnly(partnership.inception_date)
    if (inceptionDate && asOfDate < inceptionDate) {
      throw new PartnershipTrackerError('VALIDATION_ERROR', 400, 'Management fee as-of date cannot be before inception.')
    }
    const commitments = (await database().query<{ amount: string; effective_date: Date | string }>(`
      select commitment_amount as amount, coalesce(commitment_date, created_at::date) as effective_date
      from partnership_commitments
      where partnership_id = $1 and coalesce(commitment_date, created_at::date) <= $2::date
      order by coalesce(commitment_date, created_at::date), created_at, id
    `, [partnershipId, asOfDate])).rows.map((entry) => ({ amount: money(entry.amount)!, effectiveDate: dateOnly(entry.effective_date) }))
    return calculateManagementFeeEstimate({
      partnershipId,
      inceptionDate,
      annualRate: ratio(partnership.management_fee_rate),
      asOfDate,
      commitments,
    })
  },

  async createCommitment(partnershipId: string, body: { amount: string; effectiveDate: string; note?: string | null }, actorUserId: string, scope: PartnershipTrackerScope) {
    const id = randomUUID()
    await withTransaction(async (client) => {
      const partnership = await assertPartnership(partnershipId, scope, client)
      const row = (await client.query(`insert into partnership_commitments
        (id, entity_id, partnership_id, commitment_amount, commitment_date, status, source_type, notes, created_by_user_id, created_at, updated_at)
        values ($1,$2,$3,$4,$5,'INACTIVE','manual',$6,$7,now(),now()) returning *`, [id, partnership.entity_id, partnershipId, body.amount, body.effectiveDate, body.note ?? null, actorUserId])).rows[0]
      await recomputeActiveCommitmentMarker(client, partnershipId)
      await auditRepository.record({ actorUserId, eventName: PARTNERSHIP_TRACKER_AUDIT_EVENTS.COMMITMENT_CREATED, objectType: 'partnership_commitment', objectId: id, before: null, after: row }, client)
    })
    return (await this.listCommitments(partnershipId, scope)).items.find((entry) => entry.id === id)!
  },

  async updateCommitment(partnershipId: string, commitmentId: string, patch: { amount?: string; effectiveDate?: string; note?: string | null; expectedUpdatedAt: string }, actorUserId: string, scope: PartnershipTrackerScope) {
    await withTransaction(async (client) => {
      await assertPartnership(partnershipId, scope, client)
      const before = (await client.query('select * from partnership_commitments where id = $1 and partnership_id = $2 for update', [commitmentId, partnershipId])).rows[0]
      if (!before) throw new PartnershipTrackerError('COMMITMENT_NOT_FOUND', 404, 'Committed-capital entry was not found.')
      const result = await client.query(`update partnership_commitments set
          commitment_amount = coalesce($3, commitment_amount), commitment_date = coalesce($4, commitment_date),
          notes = case when $5::boolean then $6 else notes end, updated_at = now()
        where id = $1 and partnership_id = $2 and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $7::timestamptz)
        returning *`, [commitmentId, partnershipId, patch.amount ?? null, patch.effectiveDate ?? null, Object.hasOwn(patch, 'note'), patch.note ?? null, patch.expectedUpdatedAt])
      if (!result.rows[0]) throw new PartnershipTrackerError('STALE_COMMITMENT_REVISION', 409, 'The committed-capital entry changed. Reload and try again.')
      await recomputeActiveCommitmentMarker(client, partnershipId)
      await auditRepository.record({ actorUserId, eventName: PARTNERSHIP_TRACKER_AUDIT_EVENTS.COMMITMENT_UPDATED, objectType: 'partnership_commitment', objectId: commitmentId, before, after: result.rows[0] }, client)
    })
    return (await this.listCommitments(partnershipId, scope)).items.find((entry) => entry.id === commitmentId)!
  },

  async deleteCommitment(partnershipId: string, commitmentId: string, expectedUpdatedAt: string, actorUserId: string, scope: PartnershipTrackerScope) {
    await withTransaction(async (client) => {
      await assertPartnership(partnershipId, scope, client)
      const row = (await client.query(`delete from partnership_commitments where id = $1 and partnership_id = $2
        and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz) returning *`, [commitmentId, partnershipId, expectedUpdatedAt])).rows[0]
      if (!row) {
        const exists = (await client.query('select 1 from partnership_commitments where id = $1 and partnership_id = $2', [commitmentId, partnershipId])).rows[0]
        throw new PartnershipTrackerError(exists ? 'STALE_COMMITMENT_REVISION' : 'COMMITMENT_NOT_FOUND', exists ? 409 : 404, exists ? 'The committed-capital entry changed. Reload and try again.' : 'Committed-capital entry was not found.')
      }
      await recomputeActiveCommitmentMarker(client, partnershipId)
      await auditRepository.record({ actorUserId, eventName: PARTNERSHIP_TRACKER_AUDIT_EVENTS.COMMITMENT_DELETED, objectType: 'partnership_commitment', objectId: commitmentId, before: row, after: null }, client)
    })
  },

  async listNav(partnershipId: string, scope: PartnershipTrackerScope) {
    await assertPartnership(partnershipId, scope, database())
    const rows = (await database().query<NavRow>(`select * from partnership_fmv_snapshots where partnership_id = $1
      order by valuation_date asc, created_at asc, id asc`, [partnershipId])).rows
    const items = rows.map(mapNav)
    return { items, latest: items.at(-1) ?? null }
  },

  async createNav(partnershipId: string, body: { amount: string; valuationDate: string; note?: string | null }, actorUserId: string, scope: PartnershipTrackerScope) {
    const id = randomUUID()
    try {
      await withTransaction(async (client) => {
        await assertPartnership(partnershipId, scope, client)
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`partnership-nav:${partnershipId}`])
        const duplicate = (await client.query('select 1 from partnership_fmv_snapshots where partnership_id = $1 and valuation_date = $2::date limit 1', [partnershipId, body.valuationDate])).rows[0]
        if (duplicate) throw new PartnershipTrackerError('DUPLICATE_NAV_DATE', 409, 'A NAV entry already exists for this valuation date.')
        const row = (await client.query(`insert into partnership_fmv_snapshots
          (id, partnership_id, valuation_date, fmv_amount, source_type, notes, created_by, created_at, updated_at)
          values ($1,$2,$3,$4,'manual',$5,$6,now(),now()) returning *`, [id, partnershipId, body.valuationDate, body.amount, body.note ?? null, actorUserId])).rows[0]
        await auditRepository.record({ actorUserId, eventName: PARTNERSHIP_TRACKER_AUDIT_EVENTS.NAV_CREATED, objectType: 'partnership_nav', objectId: id, before: null, after: row }, client)
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new PartnershipTrackerError('DUPLICATE_NAV_DATE', 409, 'A NAV entry already exists for this valuation date.')
      throw error
    }
    return (await this.listNav(partnershipId, scope)).items.find((entry) => entry.id === id)!
  },

  async updateNav(partnershipId: string, navEntryId: string, patch: { amount?: string; valuationDate?: string; note?: string | null; expectedUpdatedAt: string }, actorUserId: string, scope: PartnershipTrackerScope) {
    try {
      await withTransaction(async (client) => {
        await assertPartnership(partnershipId, scope, client)
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`partnership-nav:${partnershipId}`])
        const before = (await client.query('select * from partnership_fmv_snapshots where id = $1 and partnership_id = $2 for update', [navEntryId, partnershipId])).rows[0]
        if (!before) throw new PartnershipTrackerError('NAV_NOT_FOUND', 404, 'NAV entry was not found.')
        if (patch.valuationDate) {
          const duplicate = (await client.query('select 1 from partnership_fmv_snapshots where partnership_id = $1 and id <> $2 and valuation_date = $3::date limit 1', [partnershipId, navEntryId, patch.valuationDate])).rows[0]
          if (duplicate) throw new PartnershipTrackerError('DUPLICATE_NAV_DATE', 409, 'A NAV entry already exists for this valuation date.')
        }
        const result = await client.query(`update partnership_fmv_snapshots set
            fmv_amount = coalesce($3, fmv_amount), valuation_date = coalesce($4, valuation_date),
            notes = case when $5::boolean then $6 else notes end, updated_at = now()
          where id = $1 and partnership_id = $2 and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $7::timestamptz)
          returning *`, [navEntryId, partnershipId, patch.amount ?? null, patch.valuationDate ?? null, Object.hasOwn(patch, 'note'), patch.note ?? null, patch.expectedUpdatedAt])
        if (!result.rows[0]) throw new PartnershipTrackerError('STALE_NAV_REVISION', 409, 'The NAV entry changed. Reload and try again.')
        await auditRepository.record({ actorUserId, eventName: PARTNERSHIP_TRACKER_AUDIT_EVENTS.NAV_UPDATED, objectType: 'partnership_nav', objectId: navEntryId, before, after: result.rows[0] }, client)
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new PartnershipTrackerError('DUPLICATE_NAV_DATE', 409, 'A NAV entry already exists for this valuation date.')
      throw error
    }
    return (await this.listNav(partnershipId, scope)).items.find((entry) => entry.id === navEntryId)!
  },

  async deleteNav(partnershipId: string, navEntryId: string, expectedUpdatedAt: string, actorUserId: string, scope: PartnershipTrackerScope) {
    await withTransaction(async (client) => {
      await assertPartnership(partnershipId, scope, client)
      const row = (await client.query(`delete from partnership_fmv_snapshots where id = $1 and partnership_id = $2
        and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz) returning *`, [navEntryId, partnershipId, expectedUpdatedAt])).rows[0]
      if (!row) {
        const exists = (await client.query('select 1 from partnership_fmv_snapshots where id = $1 and partnership_id = $2', [navEntryId, partnershipId])).rows[0]
        throw new PartnershipTrackerError(exists ? 'STALE_NAV_REVISION' : 'NAV_NOT_FOUND', exists ? 409 : 404, exists ? 'The NAV entry changed. Reload and try again.' : 'NAV entry was not found.')
      }
      await auditRepository.record({ actorUserId, eventName: PARTNERSHIP_TRACKER_AUDIT_EVENTS.NAV_DELETED, objectType: 'partnership_nav', objectId: navEntryId, before: row, after: null }, client)
    })
  },

  async getYear(partnershipId: string, taxYear: number, scope: PartnershipTrackerScope) {
    const detail = await k1TrackerRepository.getYear(partnershipId, taxYear, scope, { syncSources: false })
    return { ...detail, status: workflow(detail.status)!, calculation: { ...detail.calculation, summary: { ...detail.calculation.summary, status: workflow(detail.calculation.summary.status)! } } }
  },
  createYear(partnershipId: string, taxYear: number, actorUserId: string, scope: PartnershipTrackerScope) {
    return k1TrackerRepository.createYear(partnershipId, taxYear, [], actorUserId, scope)
  },
  updateYear(partnershipId: string, taxYear: number, expectedRevision: number, changes: K1TrackerFieldChange[], actorUserId: string, scope: PartnershipTrackerScope) {
    return k1TrackerRepository.updateYear(partnershipId, taxYear, expectedRevision, changes, actorUserId, scope)
  },
  calculateYear(partnershipId: string, taxYear: number, expectedRevision: number, changes: K1TrackerFieldChange[], scope: PartnershipTrackerScope) {
    return k1TrackerRepository.calculateDraft(partnershipId, taxYear, expectedRevision, changes, scope)
  },
  deleteYear(partnershipId: string, taxYear: number, expectedRevision: number, actorUserId: string, scope: PartnershipTrackerScope) {
    return k1TrackerRepository.deleteYear(partnershipId, taxYear, expectedRevision, actorUserId, scope)
  },
  async signoff(partnershipId: string, taxYear: number, expectedRevision: number, action: 'PREPARE' | 'REVIEW' | 'INVALIDATE', reason: string | null | undefined, actorUserId: string, scope: PartnershipTrackerScope) {
    const mapped = action === 'PREPARE' ? 'PREPARED' : action === 'REVIEW' ? 'REVIEWED' : 'INVALIDATED'
    await k1TrackerRepository.signoff(partnershipId, taxYear, expectedRevision, mapped, reason, actorUserId, scope)
    return this.getYear(partnershipId, taxYear, scope)
  },
}
