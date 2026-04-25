import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import { authRepository } from '../auth/auth.repository.js'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { fmvRepository } from './fmv.repository.js'
import {
  createInMemoryCapitalActivity,
  createInMemoryCommitment,
  getInMemoryActiveCommitment,
  getInMemoryCapitalActivityEvent,
  getInMemoryCommitment,
  listInMemoryCapitalActivity,
  listInMemoryCommitments,
  listInMemorySourceYears,
  resetInMemoryCapitalStore,
  updateInMemoryCapitalActivity,
  updateInMemoryCommitment,
} from './capital.store.js'
import type {
  ActivityDetailRow,
  CapitalActivityEvent,
  CapitalDataSource,
  CreateCapitalActivityEventRequest,
  CreatePartnershipCommitmentRequest,
  PartnershipCapitalOverview,
  PartnershipCommitment,
  UpdateCapitalActivityEventRequest,
  UpdatePartnershipCommitmentRequest,
} from '../../../../../packages/types/src/partnership-management.js'

const IN_MEMORY_SCOPE = { isAdmin: true, entityIds: [] as string[] }

type Queryable = PoolClient | NonNullable<typeof pool>

type ResidualSource = Exclude<CapitalDataSource, 'calculated'> | 'none'

interface CapitalComputationSnapshot {
  commitments: PartnershipCommitment[]
  capitalActivity: CapitalActivityEvent[]
  reportedDistributionByYear: Map<number, number>
  finalizedK1ByYear: Map<number, string | null>
  latestResidualValueUsd: number | null
  latestResidualSource: ResidualSource
  fmvYears: Set<number>
}

const toNullableNumber = (value: unknown): number | null => {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const toNumericString = (value: number | null, scale = 2): string | null => {
  if (value == null || !Number.isFinite(value)) return null
  return value.toFixed(scale)
}

const normalizeResidualSource = (source: string | null | undefined): ResidualSource => {
  if (!source) return 'none'
  return source === 'k1' ? 'parsed' : 'manual'
}

function getCommitmentAnchorYear(commitment: PartnershipCommitment | null): number | null {
  if (!commitment) return null
  const date =
    commitment.commitmentDate ??
    commitment.commitmentStartDate ??
    commitment.commitmentEndDate
  if (!date) return null
  return Number(date.slice(0, 4))
}

function validateCommitmentDateRange(startDate: string | null, endDate: string | null): void {
  if (startDate && endDate && startDate > endDate) {
    throw new Error('INVALID_COMMITMENT_DATE_RANGE')
  }
}

function validateCapitalActivityAmount(eventType: string, amountUsd: number): void {
  if (amountUsd === 0) {
    throw new Error('INVALID_CAPITAL_ACTIVITY_AMOUNT')
  }
  if ((eventType === 'capital_call' || eventType === 'funded_contribution') && amountUsd < 0) {
    throw new Error('INVALID_CAPITAL_ACTIVITY_AMOUNT')
  }
}

function computeCapitalOverview(snapshot: CapitalComputationSnapshot): PartnershipCapitalOverview {
  const activeCommitment = snapshot.commitments.find((row) => row.status === 'ACTIVE') ?? null

  const paidInUsd = snapshot.capitalActivity.reduce((sum, event) => {
    if (event.eventType === 'funded_contribution' || event.eventType === 'other_adjustment') {
      return sum + event.amountUsd
    }
    return sum
  }, 0)

  const originalCommitmentUsd = activeCommitment?.commitmentAmountUsd ?? null
  const percentCalled =
    originalCommitmentUsd != null && originalCommitmentUsd > 0
      ? (paidInUsd / originalCommitmentUsd) * 100
      : null
  const unfundedUsd =
    originalCommitmentUsd != null
      ? originalCommitmentUsd - paidInUsd
      : null

  const reportedDistributionsUsd = [...snapshot.reportedDistributionByYear.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  )

  const residualValueUsd = snapshot.latestResidualValueUsd
  const paidInForMultiples = paidInUsd > 0 ? paidInUsd : null
  const dpi = paidInForMultiples != null ? reportedDistributionsUsd / paidInForMultiples : null
  const rvpi =
    paidInForMultiples != null && residualValueUsd != null
      ? residualValueUsd / paidInForMultiples
      : null
  const tvpi =
    paidInForMultiples != null && residualValueUsd != null
      ? (reportedDistributionsUsd + residualValueUsd) / paidInForMultiples
      : null

  return {
    originalCommitmentUsd,
    paidInUsd,
    percentCalled,
    unfundedUsd,
    reportedDistributionsUsd,
    residualValueUsd,
    dpi,
    rvpi,
    tvpi,
    valueSources: {
      originalCommitment: activeCommitment?.sourceType ?? 'none',
      paidIn: 'calculated',
      reportedDistributions: 'parsed',
      residualValue: snapshot.latestResidualSource,
      performanceMultiples: 'calculated',
    },
  }
}

function mapCommitmentRow(row: any): PartnershipCommitment {
  return {
    id: row.id,
    entityId: row.entity_id,
    partnershipId: row.partnership_id,
    commitmentAmountUsd: Number(row.commitment_amount),
    commitmentDate: row.commitment_date ?? null,
    commitmentStartDate: row.commitment_start_date ?? null,
    commitmentEndDate: row.commitment_end_date ?? null,
    status: row.status,
    sourceType: row.source_type,
    notes: row.notes ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    createdByEmail: row.created_by_email ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCapitalActivityRow(row: any): CapitalActivityEvent {
  return {
    id: row.id,
    entityId: row.entity_id,
    partnershipId: row.partnership_id,
    activityDate: row.activity_date,
    eventType: row.event_type,
    amountUsd: Number(row.amount),
    sourceType: row.source_type,
    notes: row.notes ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    createdByEmail: row.created_by_email ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapActivityDetailRow(row: any): ActivityDetailRow {
  return {
    id: row.id,
    entityId: row.entity_id,
    partnershipId: row.partnership_id,
    taxYear: Number(row.tax_year),
    reportedDistributionUsd: toNullableNumber(row.reported_distribution_amount),
    originalCommitmentUsd: toNullableNumber(row.original_commitment_amount),
    paidInUsd: toNullableNumber(row.paid_in_amount),
    percentCalled: toNullableNumber(row.percent_called),
    unfundedUsd: toNullableNumber(row.unfunded_amount),
    residualValueUsd: toNullableNumber(row.residual_value_amount),
    dpi: toNullableNumber(row.dpi),
    rvpi: toNullableNumber(row.rvpi),
    tvpi: toNullableNumber(row.tvpi),
    sourceSignals: {
      hasK1: Boolean(row.source_has_k1),
      hasCapitalActivity: Boolean(row.source_has_capital_activity),
      hasFmv: Boolean(row.source_has_fmv),
      hasManualInput: Boolean(row.source_has_manual_input),
    },
    finalizedFromK1DocumentId: row.finalized_from_k1_document_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listDbCommitments(partnershipId: string, db: Queryable): Promise<PartnershipCommitment[]> {
  const result = await db.query(
    `
    select c.*, u.email as created_by_email
    from partnership_commitments c
    left join users u on u.id = c.created_by_user_id
    where c.partnership_id = $1
    order by (c.status = 'ACTIVE') desc, c.created_at desc, c.id desc
    `,
    [partnershipId],
  )
  return result.rows.map(mapCommitmentRow)
}

async function listDbCapitalActivity(partnershipId: string, db: Queryable): Promise<CapitalActivityEvent[]> {
  const result = await db.query(
    `
    select e.*, u.email as created_by_email
    from capital_activity_events e
    left join users u on u.id = e.created_by_user_id
    where e.partnership_id = $1
    order by e.activity_date desc, e.created_at desc, e.id desc
    `,
    [partnershipId],
  )
  return result.rows.map(mapCapitalActivityRow)
}

async function getReportedDistributionsByYear(partnershipId: string): Promise<{
  byYear: Map<number, number>
  finalizedDocByYear: Map<number, string | null>
}> {
  if (!pool) {
    const byYear = new Map<number, number>()
    const finalizedDocByYear = new Map<number, string | null>()

    const finalizedDocs = k1Repository
      .listK1sForPartnership(partnershipId)
      .filter((k1) => k1.processingStatus === 'FINALIZED' && k1.taxYear != null)
      .sort((left, right) => {
        return (
          (right.taxYear as number) - (left.taxYear as number) ||
          right.uploadedAt.getTime() - left.uploadedAt.getTime()
        )
      })

    for (const doc of finalizedDocs) {
      const year = doc.taxYear as number
      const distribution = reviewRepository.getEffectiveReportedDistribution(doc.id)
      const amount = distribution?.reportedDistributionAmount
      const parsedAmount = amount != null ? Number(amount) : 0
      byYear.set(year, (byYear.get(year) ?? 0) + parsedAmount)
      if (!finalizedDocByYear.has(year)) {
        finalizedDocByYear.set(year, doc.id)
      }
    }

    return { byYear, finalizedDocByYear }
  }

  const [totalsResult, latestResult] = await Promise.all([
    pool.query(
      `
      select kd.tax_year, coalesce(sum(krd.reported_distribution_amount), 0) as amount_usd
      from k1_documents kd
      left join k1_reported_distributions krd on krd.k1_document_id = kd.id
      where kd.partnership_id = $1
        and kd.processing_status = 'FINALIZED'
        and kd.tax_year is not null
      group by kd.tax_year
      `,
      [partnershipId],
    ),
    pool.query(
      `
      select distinct on (kd.tax_year)
        kd.tax_year,
        kd.id as finalized_from_k1_document_id
      from k1_documents kd
      where kd.partnership_id = $1
        and kd.processing_status = 'FINALIZED'
        and kd.tax_year is not null
      order by kd.tax_year, kd.finalized_at desc nulls last, kd.updated_at desc, kd.id desc
      `,
      [partnershipId],
    ),
  ])

  const byYear = new Map<number, number>()
  const finalizedDocByYear = new Map<number, string | null>()

  for (const row of totalsResult.rows) {
    byYear.set(Number(row.tax_year), Number(row.amount_usd))
  }
  for (const row of latestResult.rows) {
    finalizedDocByYear.set(Number(row.tax_year), row.finalized_from_k1_document_id ?? null)
  }

  return { byYear, finalizedDocByYear }
}

async function getResidualSnapshot(partnershipId: string): Promise<{
  latestAmountUsd: number | null
  latestSource: ResidualSource
  years: Set<number>
}> {
  if (!pool) {
    const snapshots = await fmvRepository.listFmvSnapshots(partnershipId, IN_MEMORY_SCOPE)
    const years = new Set<number>()
    for (const snapshot of snapshots ?? []) {
      years.add(Number(snapshot.asOfDate.slice(0, 4)))
    }

    const latest = snapshots?.[0]
    return {
      latestAmountUsd: latest?.amountUsd ?? null,
      latestSource: normalizeResidualSource(latest?.source),
      years,
    }
  }

  const result = await pool.query(
    `
    select valuation_date, source_type, fmv_amount
    from partnership_fmv_snapshots
    where partnership_id = $1
    order by created_at desc, valuation_date desc, id desc
    `,
    [partnershipId],
  )

  const years = new Set<number>()
  for (const row of result.rows) {
    years.add(Number(String(row.valuation_date).slice(0, 4)))
  }

  const latest = result.rows[0]
  return {
    latestAmountUsd: latest ? Number(latest.fmv_amount) : null,
    latestSource: normalizeResidualSource(latest?.source_type),
    years,
  }
}

async function buildComputationSnapshot(partnershipId: string): Promise<CapitalComputationSnapshot> {
  const commitments = pool
    ? await listDbCommitments(partnershipId, pool)
    : listInMemoryCommitments(partnershipId)

  const capitalActivity = pool
    ? await listDbCapitalActivity(partnershipId, pool)
    : listInMemoryCapitalActivity(partnershipId)

  const [{ byYear, finalizedDocByYear }, residual] = await Promise.all([
    getReportedDistributionsByYear(partnershipId),
    getResidualSnapshot(partnershipId),
  ])

  return {
    commitments,
    capitalActivity,
    reportedDistributionByYear: byYear,
    finalizedK1ByYear: finalizedDocByYear,
    latestResidualValueUsd: residual.latestAmountUsd,
    latestResidualSource: residual.latestSource,
    fmvYears: residual.years,
  }
}

async function getExistingActivityYears(partnershipId: string): Promise<Set<number>> {
  if (!pool) {
    return new Set(
      reviewRepository
        ._debugAllAnnualActivity()
        .filter((row) => row.partnershipId === partnershipId)
        .map((row) => row.taxYear),
    )
  }

  const result = await pool.query(
    `select tax_year from partnership_annual_activity where partnership_id = $1`,
    [partnershipId],
  )
  return new Set(result.rows.map((row) => Number(row.tax_year)))
}

export const capitalRepository = {
  async listCommitments(partnershipId: string): Promise<PartnershipCommitment[]> {
    if (!pool) return listInMemoryCommitments(partnershipId)
    return listDbCommitments(partnershipId, pool)
  },

  async listCapitalActivity(partnershipId: string): Promise<CapitalActivityEvent[]> {
    if (!pool) return listInMemoryCapitalActivity(partnershipId)
    return listDbCapitalActivity(partnershipId, pool)
  },

  async createCommitment(
    partnershipId: string,
    entityId: string,
    body: CreatePartnershipCommitmentRequest,
    actorUserId: string,
    client: PoolClient | null,
  ): Promise<PartnershipCommitment> {
    validateCommitmentDateRange(body.commitmentStartDate ?? null, body.commitmentEndDate ?? null)

    if (!pool || !client) {
      const actorEmail = authRepository.getUserById(actorUserId)?.email ?? null
      const created = createInMemoryCommitment({
        partnershipId,
        entityId,
        actorUserId,
        actorEmail,
        body,
      })

      await auditRepository.record({
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.COMMITMENT_CREATED,
        objectType: 'partnership_commitment',
        objectId: created.id,
        before: null,
        after: created,
      })

      const preferredYear = Number(
        (created.commitmentDate ?? created.commitmentStartDate ?? new Date().toISOString().slice(0, 10)).slice(0, 4),
      )
      await this.syncActivityDetail(partnershipId, entityId, { preferredYear })
      return created
    }

    if ((body.status ?? 'ACTIVE') === 'ACTIVE') {
      await client.query(
        `
        update partnership_commitments
        set status = 'INACTIVE', updated_at = now()
        where partnership_id = $1 and status = 'ACTIVE'
        `,
        [partnershipId],
      )
    }

    const insertResult = await client.query(
      `
      insert into partnership_commitments
        (
          id,
          entity_id,
          partnership_id,
          commitment_amount,
          commitment_date,
          commitment_start_date,
          commitment_end_date,
          status,
          source_type,
          notes,
          created_by_user_id,
          created_at,
          updated_at
        )
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
      returning *
      `,
      [
        randomUUID(),
        entityId,
        partnershipId,
        body.commitmentAmountUsd,
        body.commitmentDate ?? null,
        body.commitmentStartDate ?? null,
        body.commitmentEndDate ?? null,
        body.status ?? 'ACTIVE',
        body.sourceType ?? 'manual',
        body.notes ?? null,
        actorUserId,
      ],
    )

    const row = insertResult.rows[0]
    const actorEmail = (
      await client.query<{ email: string }>('select email from users where id = $1', [actorUserId])
    ).rows[0]?.email ?? null

    const created = mapCommitmentRow({
      ...row,
      created_by_email: actorEmail,
    })

    await auditRepository.record(
      {
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.COMMITMENT_CREATED,
        objectType: 'partnership_commitment',
        objectId: created.id,
        before: null,
        after: row,
      },
      client,
    )

    const preferredYear = Number(
      (created.commitmentDate ?? created.commitmentStartDate ?? new Date().toISOString().slice(0, 10)).slice(0, 4),
    )
    await this.syncActivityDetail(partnershipId, entityId, { client, preferredYear })
    return created
  },

  async updateCommitment(
    partnershipId: string,
    commitmentId: string,
    patch: UpdatePartnershipCommitmentRequest,
    actorUserId: string,
    entityId: string,
    client: PoolClient | null,
  ): Promise<PartnershipCommitment | null> {
    if (!pool || !client) {
      const before = getInMemoryCommitment(partnershipId, commitmentId)
      if (!before) return null

      const nextStartDate =
        'commitmentStartDate' in patch ? patch.commitmentStartDate ?? null : before.commitmentStartDate
      const nextEndDate =
        'commitmentEndDate' in patch ? patch.commitmentEndDate ?? null : before.commitmentEndDate
      validateCommitmentDateRange(nextStartDate, nextEndDate)

      const updated = updateInMemoryCommitment({
        partnershipId,
        commitmentId,
        patch,
      })
      if (!updated) return null

      await auditRepository.record({
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.COMMITMENT_UPDATED,
        objectType: 'partnership_commitment',
        objectId: commitmentId,
        before,
        after: updated,
      })

      const preferredYear = Number(
        (updated.commitmentDate ?? updated.commitmentStartDate ?? new Date().toISOString().slice(0, 10)).slice(0, 4),
      )
      await this.syncActivityDetail(partnershipId, entityId, { preferredYear })
      return updated
    }

    const beforeResult = await client.query(
      `
      select *
      from partnership_commitments
      where id = $1 and partnership_id = $2
      limit 1
      `,
      [commitmentId, partnershipId],
    )
    const before = beforeResult.rows[0]
    if (!before) return null

    const next = {
      commitmentAmountUsd:
        patch.commitmentAmountUsd !== undefined ? patch.commitmentAmountUsd : Number(before.commitment_amount),
      commitmentDate: 'commitmentDate' in patch ? patch.commitmentDate ?? null : before.commitment_date,
      commitmentStartDate:
        'commitmentStartDate' in patch ? patch.commitmentStartDate ?? null : before.commitment_start_date,
      commitmentEndDate:
        'commitmentEndDate' in patch ? patch.commitmentEndDate ?? null : before.commitment_end_date,
      status: patch.status ?? before.status,
      sourceType: patch.sourceType ?? before.source_type,
      notes: 'notes' in patch ? patch.notes ?? null : before.notes,
    }

    validateCommitmentDateRange(next.commitmentStartDate, next.commitmentEndDate)

    if (next.status === 'ACTIVE') {
      await client.query(
        `
        update partnership_commitments
        set status = 'INACTIVE', updated_at = now()
        where partnership_id = $1 and status = 'ACTIVE' and id <> $2
        `,
        [partnershipId, commitmentId],
      )
    }

    const updateResult = await client.query(
      `
      update partnership_commitments
      set
        commitment_amount = $3,
        commitment_date = $4,
        commitment_start_date = $5,
        commitment_end_date = $6,
        status = $7,
        source_type = $8,
        notes = $9,
        updated_at = now()
      where id = $1 and partnership_id = $2
      returning *
      `,
      [
        commitmentId,
        partnershipId,
        next.commitmentAmountUsd,
        next.commitmentDate,
        next.commitmentStartDate,
        next.commitmentEndDate,
        next.status,
        next.sourceType,
        next.notes,
      ],
    )

    const updatedRow = updateResult.rows[0]
    const actorEmail = (
      await client.query<{ email: string }>('select email from users where id = $1', [actorUserId])
    ).rows[0]?.email ?? null

    const updated = mapCommitmentRow({
      ...updatedRow,
      created_by_email: actorEmail,
    })

    await auditRepository.record(
      {
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.COMMITMENT_UPDATED,
        objectType: 'partnership_commitment',
        objectId: commitmentId,
        before,
        after: updatedRow,
      },
      client,
    )

    const preferredYear = Number(
      (updated.commitmentDate ?? updated.commitmentStartDate ?? new Date().toISOString().slice(0, 10)).slice(0, 4),
    )
    await this.syncActivityDetail(partnershipId, entityId, { client, preferredYear })
    return updated
  },

  async createCapitalActivity(
    partnershipId: string,
    entityId: string,
    body: CreateCapitalActivityEventRequest,
    actorUserId: string,
    client: PoolClient | null,
  ): Promise<CapitalActivityEvent> {
    validateCapitalActivityAmount(body.eventType, body.amountUsd)

    if (!pool || !client) {
      const actorEmail = authRepository.getUserById(actorUserId)?.email ?? null
      const created = createInMemoryCapitalActivity({
        partnershipId,
        entityId,
        actorUserId,
        actorEmail,
        body,
      })

      await auditRepository.record({
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.CAPITAL_ACTIVITY_CREATED,
        objectType: 'capital_activity_event',
        objectId: created.id,
        before: null,
        after: created,
      })

      await this.syncActivityDetail(partnershipId, entityId, {
        preferredYear: Number(created.activityDate.slice(0, 4)),
      })

      return created
    }

    const insertResult = await client.query(
      `
      insert into capital_activity_events
        (
          id,
          entity_id,
          partnership_id,
          activity_date,
          event_type,
          amount,
          source_type,
          notes,
          created_by_user_id,
          created_at,
          updated_at
        )
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
      returning *
      `,
      [
        randomUUID(),
        entityId,
        partnershipId,
        body.activityDate,
        body.eventType,
        body.amountUsd,
        body.sourceType ?? 'manual',
        body.notes ?? null,
        actorUserId,
      ],
    )

    const row = insertResult.rows[0]
    const actorEmail = (
      await client.query<{ email: string }>('select email from users where id = $1', [actorUserId])
    ).rows[0]?.email ?? null

    const created = mapCapitalActivityRow({
      ...row,
      created_by_email: actorEmail,
    })

    await auditRepository.record(
      {
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.CAPITAL_ACTIVITY_CREATED,
        objectType: 'capital_activity_event',
        objectId: created.id,
        before: null,
        after: row,
      },
      client,
    )

    await this.syncActivityDetail(partnershipId, entityId, {
      client,
      preferredYear: Number(created.activityDate.slice(0, 4)),
    })

    return created
  },

  async updateCapitalActivity(
    partnershipId: string,
    eventId: string,
    patch: UpdateCapitalActivityEventRequest,
    actorUserId: string,
    entityId: string,
    client: PoolClient | null,
  ): Promise<CapitalActivityEvent | null> {
    if (!pool || !client) {
      const before = getInMemoryCapitalActivityEvent(partnershipId, eventId)
      if (!before) return null

      const nextEventType = patch.eventType ?? before.eventType
      const nextAmount = patch.amountUsd !== undefined ? patch.amountUsd : before.amountUsd
      validateCapitalActivityAmount(nextEventType, nextAmount)

      const updated = updateInMemoryCapitalActivity({ partnershipId, eventId, patch })
      if (!updated) return null

      await auditRepository.record({
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.CAPITAL_ACTIVITY_UPDATED,
        objectType: 'capital_activity_event',
        objectId: eventId,
        before,
        after: updated,
      })

      await this.syncActivityDetail(partnershipId, entityId, {
        preferredYear: Number((updated.activityDate ?? before.activityDate).slice(0, 4)),
      })

      return updated
    }

    const beforeResult = await client.query(
      `
      select *
      from capital_activity_events
      where id = $1 and partnership_id = $2
      limit 1
      `,
      [eventId, partnershipId],
    )
    const before = beforeResult.rows[0]
    if (!before) return null

    const next = {
      activityDate: patch.activityDate ?? before.activity_date,
      eventType: patch.eventType ?? before.event_type,
      amountUsd: patch.amountUsd !== undefined ? patch.amountUsd : Number(before.amount),
      sourceType: patch.sourceType ?? before.source_type,
      notes: 'notes' in patch ? patch.notes ?? null : before.notes,
    }

    validateCapitalActivityAmount(next.eventType, next.amountUsd)

    const updateResult = await client.query(
      `
      update capital_activity_events
      set
        activity_date = $3,
        event_type = $4,
        amount = $5,
        source_type = $6,
        notes = $7,
        updated_at = now()
      where id = $1 and partnership_id = $2
      returning *
      `,
      [eventId, partnershipId, next.activityDate, next.eventType, next.amountUsd, next.sourceType, next.notes],
    )

    const updatedRow = updateResult.rows[0]
    const actorEmail = (
      await client.query<{ email: string }>('select email from users where id = $1', [actorUserId])
    ).rows[0]?.email ?? null

    const updated = mapCapitalActivityRow({
      ...updatedRow,
      created_by_email: actorEmail,
    })

    await auditRepository.record(
      {
        actorUserId,
        eventName: PARTNERSHIP_AUDIT_EVENTS.CAPITAL_ACTIVITY_UPDATED,
        objectType: 'capital_activity_event',
        objectId: eventId,
        before,
        after: updatedRow,
      },
      client,
    )

    await this.syncActivityDetail(partnershipId, entityId, {
      client,
      preferredYear: Number(next.activityDate.slice(0, 4)),
    })

    return updated
  },

  async calculateCapitalOverview(partnershipId: string): Promise<PartnershipCapitalOverview> {
    const snapshot = await buildComputationSnapshot(partnershipId)
    return computeCapitalOverview(snapshot)
  },

  async listActivityDetail(partnershipId: string): Promise<ActivityDetailRow[]> {
    if (!pool) {
      return reviewRepository
        ._debugAllAnnualActivity()
        .filter((row) => row.partnershipId === partnershipId)
        .sort((left, right) => right.taxYear - left.taxYear || right.updatedAt.getTime() - left.updatedAt.getTime())
        .map((row) => ({
          id: row.id,
          entityId: row.entityId,
          partnershipId: row.partnershipId,
          taxYear: row.taxYear,
          reportedDistributionUsd: toNullableNumber(row.reportedDistributionAmount),
          originalCommitmentUsd: toNullableNumber(row.originalCommitmentAmount),
          paidInUsd: toNullableNumber(row.paidInAmount),
          percentCalled: toNullableNumber(row.percentCalled),
          unfundedUsd: toNullableNumber(row.unfundedAmount),
          residualValueUsd: toNullableNumber(row.residualValueAmount),
          dpi: toNullableNumber(row.dpi),
          rvpi: toNullableNumber(row.rvpi),
          tvpi: toNullableNumber(row.tvpi),
          sourceSignals: {
            hasK1: row.sourceHasK1,
            hasCapitalActivity: row.sourceHasCapitalActivity,
            hasFmv: row.sourceHasFmv,
            hasManualInput: row.sourceHasManualInput,
          },
          finalizedFromK1DocumentId: row.finalizedFromK1DocumentId,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }))
    }

    const result = await pool.query(
      `
      select *
      from partnership_annual_activity
      where partnership_id = $1
      order by tax_year desc, updated_at desc
      `,
      [partnershipId],
    )

    return result.rows.map(mapActivityDetailRow)
  },

  async syncActivityDetail(
    partnershipId: string,
    entityId: string,
    options?: { client?: PoolClient | null; preferredYear?: number },
  ): Promise<void> {
    const snapshot = await buildComputationSnapshot(partnershipId)
    const overview = computeCapitalOverview(snapshot)
    const activeCommitment = snapshot.commitments.find((row) => row.status === 'ACTIVE') ?? null

    const commitmentYear = getCommitmentAnchorYear(activeCommitment)
    const capitalYears = new Set<number>(
      snapshot.capitalActivity.map((event) => Number(event.activityDate.slice(0, 4))),
    )
    const existingYears = await getExistingActivityYears(partnershipId)

    const allYears = new Set<number>([
      ...snapshot.reportedDistributionByYear.keys(),
      ...snapshot.fmvYears,
      ...capitalYears,
      ...existingYears,
      ...listInMemorySourceYears(partnershipId),
    ])

    if (commitmentYear != null) allYears.add(commitmentYear)
    if (options?.preferredYear != null && Number.isFinite(options.preferredYear)) {
      allYears.add(options.preferredYear)
    }

    if (allYears.size === 0) return

    const sortedYears = [...allYears].sort((left, right) => right - left)

    if (!pool || !options?.client) {
      for (const year of sortedYears) {
        const hasK1 = snapshot.reportedDistributionByYear.has(year)
        const hasCapitalActivity = capitalYears.has(year)
        const hasFmv = snapshot.fmvYears.has(year)
        const hasManualInput =
          Boolean(activeCommitment && activeCommitment.sourceType === 'manual' && (commitmentYear == null || commitmentYear === year)) ||
          snapshot.capitalActivity.some(
            (event) => Number(event.activityDate.slice(0, 4)) === year && event.sourceType === 'manual',
          )

        reviewRepository.upsertPartnershipAnnualActivity({
          entityId,
          partnershipId,
          taxYear: year,
          reportedDistributionAmount: toNumericString(snapshot.reportedDistributionByYear.get(year) ?? null, 2),
          originalCommitmentAmount: toNumericString(overview.originalCommitmentUsd, 2),
          percentCalled: toNumericString(overview.percentCalled, 4),
          unfundedAmount: toNumericString(overview.unfundedUsd, 2),
          paidInAmount: toNumericString(overview.paidInUsd, 2),
          residualValueAmount: toNumericString(overview.residualValueUsd, 2),
          dpi: toNumericString(overview.dpi, 4),
          rvpi: toNumericString(overview.rvpi, 4),
          tvpi: toNumericString(overview.tvpi, 4),
          sourceHasK1: hasK1,
          sourceHasCapitalActivity: hasCapitalActivity,
          sourceHasFmv: hasFmv,
          sourceHasManualInput: hasManualInput,
          commitmentSourceType: activeCommitment?.sourceType ?? null,
          paidInSourceType: 'calculated',
          distributionSourceType: hasK1 ? 'parsed' : null,
          residualValueSourceType:
            snapshot.latestResidualSource === 'none' ? null : snapshot.latestResidualSource,
          returnMetricsSourceType: overview.paidInUsd > 0 ? 'calculated' : null,
          finalizedFromK1DocumentId: snapshot.finalizedK1ByYear.get(year) ?? null,
        })
      }
      return
    }

    for (const year of sortedYears) {
      const hasK1 = snapshot.reportedDistributionByYear.has(year)
      const hasCapitalActivity = capitalYears.has(year)
      const hasFmv = snapshot.fmvYears.has(year)
      const hasManualInput =
        Boolean(activeCommitment && activeCommitment.sourceType === 'manual' && (commitmentYear == null || commitmentYear === year)) ||
        snapshot.capitalActivity.some(
          (event) => Number(event.activityDate.slice(0, 4)) === year && event.sourceType === 'manual',
        )

      await options.client.query(
        `
        insert into partnership_annual_activity
          (
            id,
            entity_id,
            partnership_id,
            tax_year,
            reported_distribution_amount,
            original_commitment_amount,
            percent_called,
            unfunded_amount,
            paid_in_amount,
            residual_value_amount,
            dpi,
            rvpi,
            tvpi,
            source_has_k1,
            source_has_capital_activity,
            source_has_fmv,
            source_has_manual_input,
            commitment_source_type,
            paid_in_source_type,
            distribution_source_type,
            residual_value_source_type,
            return_metrics_source_type,
            finalized_from_k1_document_id,
            created_at,
            updated_at
          )
        values
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $20,
            $21,
            $22,
            $23,
            now(),
            now()
          )
        on conflict (entity_id, partnership_id, tax_year)
        do update set
          reported_distribution_amount = excluded.reported_distribution_amount,
          original_commitment_amount = excluded.original_commitment_amount,
          percent_called = excluded.percent_called,
          unfunded_amount = excluded.unfunded_amount,
          paid_in_amount = excluded.paid_in_amount,
          residual_value_amount = excluded.residual_value_amount,
          dpi = excluded.dpi,
          rvpi = excluded.rvpi,
          tvpi = excluded.tvpi,
          source_has_k1 = excluded.source_has_k1,
          source_has_capital_activity = excluded.source_has_capital_activity,
          source_has_fmv = excluded.source_has_fmv,
          source_has_manual_input = excluded.source_has_manual_input,
          commitment_source_type = excluded.commitment_source_type,
          paid_in_source_type = excluded.paid_in_source_type,
          distribution_source_type = excluded.distribution_source_type,
          residual_value_source_type = excluded.residual_value_source_type,
          return_metrics_source_type = excluded.return_metrics_source_type,
          finalized_from_k1_document_id = excluded.finalized_from_k1_document_id,
          updated_at = now()
        `,
        [
          randomUUID(),
          entityId,
          partnershipId,
          year,
          toNumericString(snapshot.reportedDistributionByYear.get(year) ?? null, 2),
          toNumericString(overview.originalCommitmentUsd, 2),
          toNumericString(overview.percentCalled, 4),
          toNumericString(overview.unfundedUsd, 2),
          toNumericString(overview.paidInUsd, 2),
          toNumericString(overview.residualValueUsd, 2),
          toNumericString(overview.dpi, 4),
          toNumericString(overview.rvpi, 4),
          toNumericString(overview.tvpi, 4),
          hasK1,
          hasCapitalActivity,
          hasFmv,
          hasManualInput,
          activeCommitment?.sourceType ?? null,
          'calculated',
          hasK1 ? 'parsed' : null,
          snapshot.latestResidualSource === 'none' ? null : snapshot.latestResidualSource,
          overview.paidInUsd > 0 ? 'calculated' : null,
          snapshot.finalizedK1ByYear.get(year) ?? null,
        ],
      )
    }
  },

  _debugReset(): void {
    resetInMemoryCapitalStore()
  },
}
