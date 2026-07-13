import { randomUUID } from 'node:crypto'
import { pool, withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import type {
  K1TrackerFieldChange,
  K1TrackerImportDecision,
  K1TrackerImportPreview,
  K1TrackerPartnershipDetail,
  K1TrackerPartnershipSummary,
  K1TrackerSignoffState,
  K1TrackerValue,
  K1TrackerYearDetail,
  K1TrackerYearSummary,
} from './k1-tracker.contracts.js'
import { calculateTrackerYear, centsToMoney, moneyToCents } from './k1-tracker.calculation.js'
import { K1_TRACKER_CALCULATION_VERSION, trackerFieldByK1Alias } from './k1-tracker.field-map.js'
import { hashTrackerWorkbook, parseTrackerWorkbook } from './k1-tracker.import.js'
import { upsertTrackerAnnualActivity } from './k1-tracker.projection.js'
import { isInScope, K1TrackerError, type Queryable, type TrackerScope, type TrackerValueRow, type TrackerYearInput, type TrackerYearRow } from './k1-tracker.types.js'

type PartnershipRow = { id: string; entity_id: string; partnership_name: string; entity_name: string }
type ImportRow = { id: string; entity_id: string; target_partnership_id: string | null; preview_payload: K1TrackerImportPreview; expires_at: Date | string; status: string; commit_decisions: K1TrackerImportDecision[] | null }
type SignoffRow = { signoff_type: 'PREPARED' | 'REVIEWED' | 'INVALIDATED'; signed_by_email: string | null; created_at: Date | string; reason: string | null }

const db = (): NonNullable<typeof pool> => {
  if (!pool) throw new K1TrackerError('DATABASE_REQUIRED')
  return pool
}
const expireStalePreviews = async (client: Queryable): Promise<void> => {
  await client.query(`update k1_tracker_import_batches set status = 'EXPIRED', preview_payload = '{}'::jsonb where status = 'PREVIEWED' and expires_at <= now()`)
}
const iso = (value: Date | string | null | undefined): string | null => value == null ? null : new Date(value).toISOString()
const cents = (value: string | null) => moneyToCents(value) ?? 0n
const scoped = (row: { entity_id: string }, scope: TrackerScope) => isInScope(row.entity_id, scope)

const partnershipFor = async (partnershipId: string, client: Queryable): Promise<PartnershipRow | null> => (
  await client.query<PartnershipRow>(`
    select p.id, p.entity_id, p.name as partnership_name, e.name as entity_name
    from partnerships p join entities e on e.id = p.entity_id where p.id = $1`, [partnershipId])
).rows[0] ?? null

const assertPartnership = async (partnershipId: string, scope: TrackerScope, client: Queryable): Promise<PartnershipRow> => {
  const partnership = await partnershipFor(partnershipId, client)
  if (!partnership) throw new K1TrackerError('TRACKER_NOT_FOUND')
  if (!scoped(partnership, scope)) throw new K1TrackerError('FORBIDDEN_TRACKER_ENTITY')
  return partnership
}

const activeValues = async (yearIds: string[], client: Queryable): Promise<TrackerValueRow[]> => {
  if (!yearIds.length) return []
  return (await client.query<TrackerValueRow>(`
    select v.*, u.email as created_by_email
    from k1_tracker_value_revisions v
    left join users u on u.id = v.created_by_user_id
    where v.tracker_year_id = any($1::uuid[]) and v.is_active = true
    order by v.created_at asc`, [yearIds])).rows
}

const sourceConflictsFor = async (
  yearId: string,
  client: Queryable,
): Promise<Array<{ fieldKey: K1TrackerValue['fieldKey']; message: string }>> => {
  const rows = (await client.query<{ field_key: K1TrackerValue['fieldKey']; source_type: string }>(`
    select distinct candidate.field_key, candidate.source_type
    from k1_tracker_value_revisions candidate
    join k1_tracker_value_revisions active
      on active.tracker_year_id = candidate.tracker_year_id
      and active.field_key = candidate.field_key
      and active.is_active = true
    where candidate.tracker_year_id = $1
      and candidate.is_active = false
      and candidate.source_type in ('WORKBOOK_IMPORT', 'FINALIZED_K1')
      and candidate.amount is distinct from active.amount
      and candidate.created_at > active.created_at
  `, [yearId])).rows
  return rows.map((row) => ({
    fieldKey: row.field_key,
    message: `A ${row.source_type.replaceAll('_', ' ').toLowerCase()} value differs from the active source and needs an Admin decision.`,
  }))
}

const refreshConflictCount = async (client: Queryable, yearId: string): Promise<number> => {
  const count = (await sourceConflictsFor(yearId, client)).length
  await client.query(`update k1_tracker_years set source_conflict_count = $2, workflow_status = case when $2 > 0 then 'NEEDS_REVIEW' else workflow_status end, updated_at = now() where id = $1`, [yearId, count])
  return count
}

const mapValue = (row: TrackerValueRow): K1TrackerValue => ({
  id: row.id, fieldKey: row.field_key, amount: row.amount == null ? null : centsToMoney(cents(row.amount)),
  originalSourceText: row.original_source_text, sourceType: row.source_type,
  sourceK1DocumentId: row.source_k1_document_id, sourceK1FieldValueId: row.source_k1_field_value_id,
  importBatchId: row.import_batch_id, sourceSheet: row.source_sheet, sourceCell: row.source_cell,
  carryforwardFromTaxYear: null, overrideReason: row.override_reason, isActive: row.is_active,
  createdByEmail: row.created_by_email ?? null, createdAt: iso(row.created_at)!,
})

const inputFor = (year: TrackerYearRow, values: TrackerValueRow[]): TrackerYearInput => ({
  id: year.id, taxYear: year.tax_year, revision: year.revision, status: year.workflow_status,
  values: Object.fromEntries(values.map((value) => [value.field_key, value.amount == null ? null : cents(value.amount)])),
})

const calculateRows = (years: TrackerYearRow[], values: TrackerValueRow[]) => {
  const valuesByYear = new Map<string, TrackerValueRow[]>()
  for (const value of values) valuesByYear.set(value.tracker_year_id, [...(valuesByYear.get(value.tracker_year_id) ?? []), value])
  let previous: Parameters<typeof calculateTrackerYear>[1]
  const calculations = new Map<string, ReturnType<typeof calculateTrackerYear>>()
  for (const year of [...years].sort((a, b) => a.tax_year - b.tax_year)) {
    const calculation = calculateTrackerYear(inputFor(year, valuesByYear.get(year.id) ?? []), previous)
    calculation.summary.sourceConflictCount = year.source_conflict_count
    if (year.source_conflict_count > 0) {
      calculation.checks.push({
        key: 'unresolved-source-conflicts', status: 'FAIL', actual: centsToMoney(BigInt(year.source_conflict_count) * 100n),
        expected: '0.00', difference: centsToMoney(BigInt(year.source_conflict_count) * 100n), tolerance: '0.00',
        message: `${year.source_conflict_count} source conflict(s) require an Admin decision.`,
      })
      calculation.summary.warningCount += year.source_conflict_count
      calculation.summary.status = 'NEEDS_REVIEW'
    }
    calculations.set(year.id, calculation)
    previous = {
      endingOutsideBasis: cents(calculation.summary.endingOutsideBasis),
      cumulativeSuspendedLoss: cents(calculation.summary.cumulativeSuspendedLoss),
      sectionLEndingCapital: cents(calculation.sectionL.reportedEnding as string | null),
      liabilities: {
        nonrecourse: cents(calculation.liabilities.nonrecourseEnding as string | null),
        qualifiedNonrecourse: cents(calculation.liabilities.qualifiedNonrecourseEnding as string | null),
        recourse: cents(calculation.liabilities.recourseEnding as string | null),
      },
    }
  }
  return { valuesByYear, calculations }
}

const signoffFor = async (year: TrackerYearRow, client: Queryable): Promise<K1TrackerSignoffState> => {
  const rows = (await client.query<SignoffRow>(`
    select s.signoff_type, u.email as signed_by_email, s.created_at, s.reason
    from k1_tracker_signoffs s left join users u on u.id = s.signed_by_user_id
    where s.tracker_year_id = $1 and s.year_revision = $2 order by s.created_at asc`, [year.id, year.revision])).rows
  const prepared = [...rows].reverse().find((row) => row.signoff_type === 'PREPARED')
  const reviewed = [...rows].reverse().find((row) => row.signoff_type === 'REVIEWED')
  const invalidated = [...rows].reverse().find((row) => row.signoff_type === 'INVALIDATED')
  return { yearRevision: year.revision, preparedByEmail: prepared?.signed_by_email ?? null, preparedAt: iso(prepared?.created_at), reviewedByEmail: reviewed?.signed_by_email ?? null, reviewedAt: iso(reviewed?.created_at), invalidatedAt: iso(invalidated?.created_at), invalidationReason: invalidated?.reason ?? null, history: rows.map((row) => ({ action: row.signoff_type, byEmail: row.signed_by_email, at: iso(row.created_at)!, reason: row.reason })) }
}

const detailFor = async (partnershipId: string, year: TrackerYearRow, allYears: TrackerYearRow[], client: Queryable): Promise<K1TrackerYearDetail> => {
  const values = await activeValues(allYears.map((item) => item.id), client)
  const { calculations, valuesByYear } = calculateRows(allYears, values)
  const calculated = calculations.get(year.id)!
  const calculation = { ...calculated, summary: { ...calculated.summary, status: year.workflow_status } }
  return {
    partnershipId, taxYear: year.tax_year, status: year.workflow_status, revision: year.revision,
    values: (valuesByYear.get(year.id) ?? []).map(mapValue), sourceConflicts: await sourceConflictsFor(year.id, client),
    calculation, signoff: await signoffFor(year, client),
  }
}

const yearRowsFor = async (partnershipId: string, client: Queryable, lock = false) => (
  await client.query<TrackerYearRow>(`select * from k1_tracker_years where partnership_id = $1 order by tax_year${lock ? ' for update' : ''}`, [partnershipId])
).rows

const persistProjection = async (client: Queryable, years: TrackerYearRow[], actorUserId: string | null): Promise<void> => {
  const values = await activeValues(years.map((item) => item.id), client)
  const { calculations, valuesByYear } = calculateRows(years, values)
  for (const year of years) {
    const calc = calculations.get(year.id)!
    const status = calc.summary.status === 'RECONCILED' ? 'NEEDS_REVIEW' : calc.summary.status
    await client.query(`update k1_tracker_years set workflow_status = $2, warning_count = $3, calculation_version = $4,
      ending_outside_basis = $5, cumulative_suspended_loss = $6, taxable_excess_distribution = $7, section_l_difference = $8,
      calculated_at = now(), updated_by_user_id = $9, updated_at = now() where id = $1`, [
      year.id, status, calc.summary.warningCount, K1_TRACKER_CALCULATION_VERSION,
      calc.summary.endingOutsideBasis, calc.summary.cumulativeSuspendedLoss, calc.summary.taxableExcessDistribution,
      calc.summary.sectionLDifference, actorUserId,
    ])
    const valueRows = valuesByYear.get(year.id) ?? []
    await upsertTrackerAnnualActivity(client, year, calc, {
      hasK1: valueRows.some((value) => value.source_type === 'FINALIZED_K1' || value.source_type === 'WORKBOOK_IMPORT'),
      hasManualInput: valueRows.some((value) => value.source_type === 'MANUAL_ENTRY' || value.source_type === 'MANUAL_OVERRIDE'),
      finalizedDocumentId: valueRows.find((value) => value.source_type === 'FINALIZED_K1')?.source_k1_document_id ?? null,
    })
  }
}

const reviseValues = async (client: Queryable, yearId: string, changes: K1TrackerFieldChange[], actorUserId: string | null, source: 'MANUAL' | 'IMPORT' | 'FINALIZED' = 'MANUAL', importBatchId?: string, sourceSheet?: string, sourceDocumentId?: string, sourceFieldValueIds?: Map<K1TrackerFieldChange['fieldKey'], string>) : Promise<{ conflicts: K1TrackerFieldChange['fieldKey'][]; changed: boolean }> => {
  const conflicts: K1TrackerFieldChange['fieldKey'][] = []
  let changed = false
  for (const change of changes) {
    const current = (await client.query<TrackerValueRow>('select * from k1_tracker_value_revisions where tracker_year_id = $1 and field_key = $2 and is_active', [yearId, change.fieldKey])).rows[0]
    if ((source === 'IMPORT' || source === 'FINALIZED') && current && current.amount === change.amount) continue
    if ((source === 'IMPORT' || source === 'FINALIZED') && current && current.amount !== change.amount) {
      const priorCandidate = (await client.query<{ id: string }>(`select id from k1_tracker_value_revisions where tracker_year_id = $1 and field_key = $2 and not is_active and source_type = $3 and amount is not distinct from $4 and import_batch_id is not distinct from $5 and source_k1_document_id is not distinct from $6 and source_k1_field_value_id is not distinct from $7 limit 1`, [
        yearId, change.fieldKey, source === 'FINALIZED' ? 'FINALIZED_K1' : 'WORKBOOK_IMPORT', change.amount, importBatchId ?? null,
        sourceDocumentId ?? null, sourceFieldValueIds?.get(change.fieldKey) ?? null,
      ])).rows[0]
      if (priorCandidate) { conflicts.push(change.fieldKey); continue }
      await client.query(`insert into k1_tracker_value_revisions (
        id, tracker_year_id, field_key, amount, source_type, import_batch_id, source_sheet, source_cell,
        source_k1_document_id, source_k1_field_value_id, is_active, created_by_user_id
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)`, [
        randomUUID(), yearId, change.fieldKey, change.amount,
        source === 'FINALIZED' ? 'FINALIZED_K1' : 'WORKBOOK_IMPORT', importBatchId ?? null,
        source === 'IMPORT' ? sourceSheet ?? 'Imported workbook' : null,
        source === 'IMPORT' ? 'mapped' : null, sourceDocumentId ?? null,
        sourceFieldValueIds?.get(change.fieldKey) ?? null, actorUserId,
      ])
      conflicts.push(change.fieldKey)
      changed = true
      continue
    }
    await client.query('update k1_tracker_value_revisions set is_active = false where tracker_year_id = $1 and field_key = $2 and is_active', [yearId, change.fieldKey])
    await client.query(`insert into k1_tracker_value_revisions (
      id, tracker_year_id, field_key, amount, source_type, import_batch_id, source_sheet, source_cell,
      override_reason, supersedes_value_revision_id, is_active, created_by_user_id, source_k1_document_id, source_k1_field_value_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)`, [
      randomUUID(), yearId, change.fieldKey, change.amount, source === 'IMPORT' ? 'WORKBOOK_IMPORT' : source === 'FINALIZED' ? 'FINALIZED_K1' : change.sourceType,
      importBatchId ?? null, source === 'IMPORT' ? sourceSheet ?? 'Imported workbook' : null, source === 'IMPORT' ? 'mapped' : null,
      change.overrideReason?.trim() ?? null, current?.id ?? null, actorUserId,
      sourceDocumentId ?? null, sourceFieldValueIds?.get(change.fieldKey) ?? null,
    ])
    changed = true
  }
  return { conflicts, changed }
}

const syncFinalizedSources = async (
  client: Queryable,
  partnership: PartnershipRow,
): Promise<void> => {
  const rows = (await client.query<{
    k1_document_id: string
    tax_year: number
    field_value_id: string
    field_name: string
    effective_value: string | null
  }>(`
    select distinct on (d.tax_year, fv.field_name) d.id as k1_document_id, d.tax_year, fv.id as field_value_id, fv.field_name,
      coalesce(fv.reviewer_corrected_value, fv.normalized_value, fv.raw_value) as effective_value
    from k1_documents d
    join k1_field_values fv on fv.k1_document_id = d.id
    where d.partnership_id = $1 and d.finalized_at is not null
    order by d.tax_year, fv.field_name, d.is_amended desc, d.updated_at desc, d.finalized_at desc
  `, [partnership.id])).rows
  if (!rows.length) return

  const byYear = new Map<number, typeof rows>()
  for (const row of rows) byYear.set(row.tax_year, [...(byYear.get(row.tax_year) ?? []), row])
  let years = await yearRowsFor(partnership.id, client, true)
  let changed = false
  for (const [taxYear, fields] of byYear) {
    let year = years.find((item) => item.tax_year === taxYear)
    if (!year) {
      year = (await client.query<TrackerYearRow>(`
        insert into k1_tracker_years (id, entity_id, partnership_id, tax_year, workflow_status)
        values ($1, $2, $3, $4, 'IMPORTED') returning *
      `, [randomUUID(), partnership.entity_id, partnership.id, taxYear])).rows[0]
      years = [...years, year].sort((a, b) => a.tax_year - b.tax_year)
      changed = true
    }
    const fieldIds = new Map<K1TrackerFieldChange['fieldKey'], string>()
    const changes: K1TrackerFieldChange[] = []
    for (const field of fields) {
      const definition = trackerFieldByK1Alias.get(field.field_name)
      const parsed = moneyToCents(field.effective_value)
      const amount = centsToMoney(definition && parsed != null && (definition.role === 'deduction' || definition.role === 'distribution') && parsed < 0n ? -parsed : parsed)
      if (!definition || amount == null || fieldIds.has(definition.key)) continue
      fieldIds.set(definition.key, field.field_value_id)
      changes.push({ fieldKey: definition.key, amount, sourceType: 'MANUAL_ENTRY' })
    }
    if (!changes.length) continue
    const revised = await reviseValues(client, year.id, changes, null, 'FINALIZED', undefined, undefined, fields[0]!.k1_document_id, fieldIds)
    await refreshConflictCount(client, year.id)
    changed ||= revised.changed
  }
  if (changed) await persistProjection(client, await yearRowsFor(partnership.id, client), null)
}

export const k1TrackerRepository = {
  async listPartnerships(scope: TrackerScope, filters: { search?: string; status?: string; limit: number }): Promise<{ items: K1TrackerPartnershipSummary[] }> {
    const params: unknown[] = []
    const clauses: string[] = []
    if (!scope.isAdmin) { params.push(scope.entityIds); clauses.push(`p.entity_id = any($${params.length}::uuid[])`) }
    if (filters.search) { params.push(`%${filters.search}%`); clauses.push(`p.name ilike $${params.length}`) }
    if (filters.status) { params.push(filters.status); clauses.push(`exists (select 1 from k1_tracker_years sy where sy.partnership_id = p.id and sy.workflow_status = $${params.length})`) }
    params.push(filters.limit)
    const rows = (await db().query<PartnershipRow & { year_count: string; first_tax_year: number | null; latest_tax_year: number | null; latest_status: K1TrackerPartnershipSummary['latestStatus']; latest_ending_basis: string | null; suspended_loss: string | null; warning_count: string }>(`
      select p.id, p.entity_id, p.name as partnership_name, e.name as entity_name, count(y.id)::text as year_count,
        min(y.tax_year) as first_tax_year, max(y.tax_year) as latest_tax_year,
        (array_agg(y.workflow_status order by y.tax_year desc))[1] as latest_status,
        (array_agg(y.ending_outside_basis order by y.tax_year desc))[1] as latest_ending_basis,
        (array_agg(y.cumulative_suspended_loss order by y.tax_year desc))[1] as suspended_loss,
        coalesce(sum(y.warning_count), 0)::text as warning_count
      from partnerships p join entities e on e.id = p.entity_id left join k1_tracker_years y on y.partnership_id = p.id
      ${clauses.length ? `where ${clauses.join(' and ')}` : ''}
      group by p.id, e.name order by p.name limit $${params.length}`, params)).rows
    return { items: rows.map((row) => ({ partnershipId: row.id, partnershipName: row.partnership_name, entityId: row.entity_id, entityName: row.entity_name, yearCount: Number(row.year_count), firstTaxYear: row.first_tax_year, latestTaxYear: row.latest_tax_year, latestStatus: row.latest_status, latestEndingOutsideBasis: row.latest_ending_basis, cumulativeSuspendedLoss: row.suspended_loss, warningCount: Number(row.warning_count) })) }
  },

  async getPartnership(partnershipId: string, scope: TrackerScope, options: { syncSources?: boolean } = {}): Promise<K1TrackerPartnershipDetail> {
    db()
    return withTransaction(async (client) => {
      const partnership = await assertPartnership(partnershipId, scope, client)
      if (options.syncSources !== false) await syncFinalizedSources(client, partnership)
      const years = await yearRowsFor(partnershipId, client)
      const { calculations } = calculateRows(years, await activeValues(years.map((year) => year.id), client))
      const summaries: K1TrackerYearSummary[] = years.map((year) => ({ ...calculations.get(year.id)!.summary, status: year.workflow_status }))
      const latest = summaries.at(-1)
      return { partnershipId, partnershipName: partnership.partnership_name, entityId: partnership.entity_id, entityName: partnership.entity_name, partnerName: null, years: summaries, yearCount: years.length, firstTaxYear: years[0]?.tax_year ?? null, latestTaxYear: latest?.taxYear ?? null, latestStatus: latest?.status ?? null, latestEndingOutsideBasis: latest?.endingOutsideBasis ?? null, cumulativeSuspendedLoss: latest?.cumulativeSuspendedLoss ?? null, warningCount: summaries.reduce((total, summary) => total + summary.warningCount, 0) }
    })
  },

  async getYear(partnershipId: string, taxYear: number, scope: TrackerScope, options: { syncSources?: boolean } = {}): Promise<K1TrackerYearDetail> {
    db()
    return withTransaction(async (client) => {
      const partnership = await assertPartnership(partnershipId, scope, client)
      if (options.syncSources !== false) await syncFinalizedSources(client, partnership)
      const years = await yearRowsFor(partnershipId, client)
      const year = years.find((row) => row.tax_year === taxYear)
      if (!year) throw new K1TrackerError('TRACKER_NOT_FOUND')
      return detailFor(partnershipId, year, years, client)
    })
  },

  async createYear(partnershipId: string, taxYear: number, changes: K1TrackerFieldChange[], actorUserId: string, scope: TrackerScope): Promise<K1TrackerYearDetail> {
    db()
    return withTransaction(async (client) => {
      const partnership = await assertPartnership(partnershipId, scope, client)
      const exists = await client.query<TrackerYearRow>('select * from k1_tracker_years where partnership_id = $1 and tax_year = $2', [partnershipId, taxYear])
      if (exists.rows[0]) throw new K1TrackerError('STALE_TRACKER_REVISION', 'A tracker year already exists')
      const inserted = (await client.query<TrackerYearRow>(`insert into k1_tracker_years (id, entity_id, partnership_id, tax_year, workflow_status, created_by_user_id, updated_by_user_id) values ($1,$2,$3,$4,'NOT_STARTED',$5,$5) returning *`, [randomUUID(), partnership.entity_id, partnershipId, taxYear, actorUserId])).rows[0]
      if (changes.length) await reviseValues(client, inserted.id, changes, actorUserId)
      const years = await yearRowsFor(partnershipId, client); await persistProjection(client, years, actorUserId)
      const projectedYears = await yearRowsFor(partnershipId, client)
      await auditRepository.record({ actorUserId, eventName: 'k1_tracker.year_created', objectType: 'k1_tracker_year', objectId: inserted.id, after: { partnershipId, taxYear } }, client as never)
      return detailFor(partnershipId, projectedYears.find((item) => item.id === inserted.id)!, projectedYears, client)
    })
  },

  async updateYear(partnershipId: string, taxYear: number, expectedRevision: number, changes: K1TrackerFieldChange[], actorUserId: string, scope: TrackerScope): Promise<{ year: K1TrackerYearDetail; invalidatedTaxYears: number[] }> {
    db()
    return withTransaction(async (client) => {
      await assertPartnership(partnershipId, scope, client); const years = await yearRowsFor(partnershipId, client, true)
      const year = years.find((row) => row.tax_year === taxYear); if (!year) throw new K1TrackerError('TRACKER_NOT_FOUND')
      if (year.revision !== expectedRevision) throw new K1TrackerError('STALE_TRACKER_REVISION')
      await reviseValues(client, year.id, changes, actorUserId)
      await refreshConflictCount(client, year.id)
      const affected = years.filter((item) => item.tax_year >= taxYear)
      await client.query('update k1_tracker_years set revision = revision + 1, workflow_status = $2, updated_by_user_id = $3, updated_at = now() where id = any($1::uuid[])', [affected.map((item) => item.id), 'NEEDS_REVIEW', actorUserId])
      for (const affectedYear of affected) {
        await client.query(
          `insert into k1_tracker_signoffs (id, tracker_year_id, year_revision, signoff_type, signed_by_user_id, reason)
           values ($1, $2, $3, 'INVALIDATED', $4, 'Material tracker value change')`,
          [randomUUID(), affectedYear.id, affectedYear.revision + 1, actorUserId],
        )
      }
      const updated = await yearRowsFor(partnershipId, client); await persistProjection(client, updated, actorUserId)
      const projected = await yearRowsFor(partnershipId, client)
      const finalYear = projected.find((item) => item.tax_year === taxYear)!
      await auditRepository.record({ actorUserId, eventName: 'k1_tracker.year_updated', objectType: 'k1_tracker_year', objectId: finalYear.id, after: { changes } }, client as never)
      return { year: await detailFor(partnershipId, finalYear, projected, client), invalidatedTaxYears: affected.filter((item) => item.tax_year > taxYear).map((item) => item.tax_year) }
    })
  },

  async calculateDraft(partnershipId: string, taxYear: number, expectedRevision: number, changes: K1TrackerFieldChange[], scope: TrackerScope) {
    await assertPartnership(partnershipId, scope, db()); const years = await yearRowsFor(partnershipId, db()); const year = years.find((item) => item.tax_year === taxYear)
    if (!year) throw new K1TrackerError('TRACKER_NOT_FOUND'); if (year.revision !== expectedRevision) throw new K1TrackerError('STALE_TRACKER_REVISION')
    const values = await activeValues(years.map((item) => item.id), db()); const target = values.filter((item) => item.tracker_year_id === year.id)
    for (const change of changes) { const current = target.find((value) => value.field_key === change.fieldKey); if (current) current.amount = change.amount; else target.push({ id: `draft-${change.fieldKey}`, tracker_year_id: year.id, field_key: change.fieldKey, amount: change.amount, original_source_text: null, source_type: change.sourceType, source_k1_document_id: null, source_k1_field_value_id: null, import_batch_id: null, source_sheet: null, source_cell: null, carryforward_from_year_id: null, override_reason: change.overrideReason ?? null, is_active: true, created_by_user_id: null, created_at: new Date() }) }
    const withoutTarget = values.filter((item) => item.tracker_year_id !== year.id); return calculateRows(years, [...withoutTarget, ...target]).calculations.get(year.id)!
  },

  async deleteYear(partnershipId: string, taxYear: number, expectedRevision: number, actorUserId: string, scope: TrackerScope): Promise<void> {
    db(); await withTransaction(async (client) => { await assertPartnership(partnershipId, scope, client); const years = await yearRowsFor(partnershipId, client, true); const year = years.find((item) => item.tax_year === taxYear); if (!year) throw new K1TrackerError('TRACKER_NOT_FOUND'); if (year.revision !== expectedRevision) throw new K1TrackerError('STALE_TRACKER_REVISION'); await client.query('delete from k1_tracker_years where id = $1', [year.id]); const remaining = await yearRowsFor(partnershipId, client); if (remaining.length) await persistProjection(client, remaining, actorUserId); await auditRepository.record({ actorUserId, eventName: 'k1_tracker.year_deleted', objectType: 'k1_tracker_year', objectId: year.id, before: { partnershipId, taxYear } }, client as never) })
  },

  async signoff(partnershipId: string, taxYear: number, expectedRevision: number, action: 'PREPARED' | 'REVIEWED' | 'INVALIDATED', reason: string | null | undefined, actorUserId: string, scope: TrackerScope): Promise<K1TrackerSignoffState> {
    db(); return withTransaction(async (client) => { await assertPartnership(partnershipId, scope, client); const years = await yearRowsFor(partnershipId, client, true); const year = years.find((item) => item.tax_year === taxYear); if (!year) throw new K1TrackerError('TRACKER_NOT_FOUND'); if (year.revision !== expectedRevision) throw new K1TrackerError('STALE_TRACKER_REVISION'); const current = await signoffFor(year, client); const calculation = (await detailFor(partnershipId, year, years, client)).calculation
      if (action === 'REVIEWED' && (!current.preparedAt || current.preparedByEmail == null || calculation.checks.some((check) => check.status !== 'PASS'))) throw new K1TrackerError('SIGNOFF_GATE_FAILED')
      if (action === 'REVIEWED' && current.preparedByEmail === (await client.query<{ email: string }>('select email from users where id = $1', [actorUserId])).rows[0]?.email) throw new K1TrackerError('SIGNOFF_GATE_FAILED')
      await client.query('insert into k1_tracker_signoffs (id, tracker_year_id, year_revision, signoff_type, signed_by_user_id, reason) values ($1,$2,$3,$4,$5,$6)', [randomUUID(), year.id, year.revision, action, actorUserId, reason?.trim() ?? null])
      await client.query(`update k1_tracker_years set workflow_status = $2, updated_by_user_id = $3, updated_at = now() where id = $1`, [year.id, action === 'REVIEWED' ? 'RECONCILED' : action === 'INVALIDATED' ? 'NEEDS_REVIEW' : year.workflow_status, actorUserId])
      await auditRepository.record({ actorUserId, eventName: `k1_tracker.signoff_${action.toLowerCase()}`, objectType: 'k1_tracker_year', objectId: year.id, after: { action, revision: year.revision, reason: reason?.trim() ?? null } }, client as never)
      return signoffFor(year, client) })
  },

  async previewImport(buffer: Buffer, filename: string, targetPartnershipId: string | null, actorUserId: string, scope: TrackerScope): Promise<K1TrackerImportPreview> {
    db(); const target = targetPartnershipId ? await assertPartnership(targetPartnershipId, scope, db()) : null
    if (!target && !scope.isAdmin) throw new K1TrackerError('FORBIDDEN_TRACKER_ENTITY')
    if (!target) throw new K1TrackerError('INVALID_IMPORT', 'Choose a target partnership before previewing a workbook.')
    await expireStalePreviews(db())
    const hash = hashTrackerWorkbook(buffer)
    const existing = (await db().query<ImportRow>(`
      select * from k1_tracker_import_batches
      where target_partnership_id = $1 and workbook_sha256 = $2 and status = 'PREVIEWED' and expires_at > now()
      order by created_at desc limit 1
    `, [targetPartnershipId, hash])).rows[0]
    if (existing) return existing.preview_payload
    const parsed = await parseTrackerWorkbook(buffer); const id = randomUUID(); const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const preview: K1TrackerImportPreview = { importBatchId: id, expiresAt, proposedPartnershipId: targetPartnershipId, ...parsed.preview, sheets: parsed.preview.sheets.map((sheet) => ({ ...sheet, proposedPartnershipId: targetPartnershipId })) }
    const serialized = JSON.stringify(preview)
    if (Buffer.byteLength(serialized) > 1_000_000) throw new K1TrackerError('INVALID_IMPORT', 'The import preview is too large to stage safely.')
    const safeFilename = filename.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 250)
    await db().query(`insert into k1_tracker_import_batches (id, entity_id, target_partnership_id, original_file_name, workbook_sha256, status, preview_payload, expires_at, created_by_user_id) values ($1,$2,$3,$4,$5,'PREVIEWED',$6::jsonb,$7,$8)`, [id, target.entity_id, targetPartnershipId, safeFilename || 'workbook.xlsx', preview.workbookHash, serialized, expiresAt, actorUserId])
    return preview
  },

  async commitImport(importBatchId: string, partnershipId: string, decisions: K1TrackerImportDecision[], actorUserId: string, scope: TrackerScope) {
    await expireStalePreviews(db())
    return withTransaction(async (client) => {
      const partnership = await assertPartnership(partnershipId, scope, client)
      const batch = (await client.query<ImportRow>('select * from k1_tracker_import_batches where id = $1 for update', [importBatchId])).rows[0]
      if (!batch) throw new K1TrackerError('IMPORT_NOT_FOUND')
      if (batch.status === 'COMMITTED' && batch.target_partnership_id === partnershipId) {
        return { importBatchId, partnershipId, importedTaxYears: decisions.filter((decision) => decision.action !== 'SKIP').map((decision) => decision.taxYear), skippedTaxYears: decisions.filter((decision) => decision.action === 'SKIP').map((decision) => decision.taxYear) }
      }
      if (batch.status !== 'PREVIEWED' || new Date(batch.expires_at) < new Date()) throw new K1TrackerError('IMPORT_EXPIRED')
      if (batch.entity_id !== partnership.entity_id) throw new K1TrackerError('FORBIDDEN_TRACKER_ENTITY')
      const importedTaxYears: number[] = []
      const skippedTaxYears: number[] = []
      for (const decision of decisions) {
        if (decision.action === 'SKIP') { skippedTaxYears.push(decision.taxYear); continue }
        const source = batch.preview_payload.sheets.find((sheet) => sheet.sheetName === decision.sheetName)?.years.find((item) => item.taxYear === decision.taxYear)
        if (!source) throw new K1TrackerError('IMPORT_NOT_FOUND', 'Selected preview year is absent')
        const years = await yearRowsFor(partnershipId, client, true)
        let year = years.find((item) => item.tax_year === decision.taxYear)
        if (!year) {
          year = (await client.query<TrackerYearRow>(`insert into k1_tracker_years (id, entity_id, partnership_id, tax_year, workflow_status, created_by_user_id, updated_by_user_id) values ($1,$2,$3,$4,'IMPORTED',$5,$5) returning *`, [randomUUID(), partnership.entity_id, partnershipId, decision.taxYear, actorUserId])).rows[0]!
        } else if (decision.expectedRevision != null && year.revision !== decision.expectedRevision) throw new K1TrackerError('STALE_TRACKER_REVISION')
        if (decision.action === 'REPLACE') await client.query('update k1_tracker_value_revisions set is_active = false where tracker_year_id = $1 and is_active', [year.id])
        await reviseValues(client, year.id, source.values.map((value) => ({ fieldKey: value.fieldKey, amount: value.amount, sourceType: 'MANUAL_ENTRY' })), actorUserId, 'IMPORT', importBatchId, decision.sheetName)
        await refreshConflictCount(client, year.id)
        for (const value of source.values) {
          await client.query('update k1_tracker_value_revisions set source_cell = $3 where tracker_year_id = $1 and field_key = $2 and is_active and import_batch_id = $4', [year.id, value.fieldKey, value.sourceCell, importBatchId])
        }
        importedTaxYears.push(decision.taxYear)
      }
      const years = await yearRowsFor(partnershipId, client)
      await persistProjection(client, years, actorUserId)
      await client.query(`update k1_tracker_import_batches set status = 'COMMITTED', target_partnership_id = $2, commit_decisions = $3::jsonb, committed_at = now() where id = $1`, [importBatchId, partnershipId, JSON.stringify(decisions)])
      await auditRepository.record({ actorUserId, eventName: 'k1_tracker.import_committed', objectType: 'k1_tracker_import', objectId: importBatchId, after: { partnershipId, importedTaxYears, skippedTaxYears } }, client as never)
      return { importBatchId, partnershipId, importedTaxYears, skippedTaxYears }
    })
  },
}
