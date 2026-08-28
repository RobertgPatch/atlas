import { randomUUID } from 'node:crypto'
import type pg from 'pg'

import { query, withTransaction } from '../../infra/db/client.js'
import { authRepository } from '../auth/auth.repository.js'
import type {
  K1IngestionBatchCounts,
  K1IngestionBatchStatus,
  K1IngestionErrorCode,
  K1IngestionItemStatus,
  K1DocumentSummary,
  K1Kpis,
  K1Status,
} from './k1.types.js'

// ---------------------------------------------------------------------------
// Legacy directory/demo records. The 022 ingestion path below is PostgreSQL
// authoritative; these maps remain temporarily for older entity/report routes.
// ---------------------------------------------------------------------------

export interface EntityRecord {
  id: string
  name: string
  entityType: string
  jurisdiction: string | null
  taxId: string | null
  formedOn: string | null
  status: string
  notes: string | null
  registeredAgent: string | null
  primaryContact: string | null
}

export interface PartnershipRecord {
  id: string
  name: string
  entityId: string
}

export interface DocumentRecord {
  id: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  uploadedAt: Date
  uploadedBy: string
}

export interface K1DocumentRecord {
  id: string
  documentId: string
  partnershipId: string | null
  entityId: string
  taxYear: number | null
  partnershipNameRaw: string | null
  processingStatus: K1Status
  parseErrorCode: string | null
  parseErrorMessage: string | null
  parseLastAttemptAt: Date | null
  parseAttempts: number
  supersededByDocumentId: string | null
  uploaderUserId: string
  uploadedAt: Date
  // --- Feature 003 additions ---
  version: number
  approvedByUserId: string | null
  finalizedByUserId: string | null
}

export interface K1IssueRecord {
  id: string
  k1DocumentId: string
  issueType: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'OPEN' | 'RESOLVED'
  message: string
  // --- Feature 003 additions ---
  k1FieldValueId: string | null
  resolvedAt: Date | null
  resolvedByUserId: string | null
  createdAt: Date
  extractionAttemptId?: string | null
  occurrenceId?: string | null
  issueCode?: string | null
  details?: Record<string, unknown> | null
}

export interface EntityMembershipRecord {
  userId: string
  entityId: string
}

export interface DocumentVersionRecord {
  id: string
  originalDocumentId: string
  supersededById: string
  partnershipId: string
  entityId: string
  taxYear: number
  supersededAt: Date
  supersededByUserId: string
}

export interface DurableK1DocumentRecord {
  id: string
  documentId: string
  entityId: string | null
  partnershipId: string | null
  taxYear: number | null
  partnershipNameRaw: string | null
  processingStatus: K1Status
  matchStatus: 'UNRESOLVED' | 'MATCHED' | 'REQUIRES_REVIEW'
  version: number
  activeExtractionAttemptId: string | null
  extractionSchemaVersion: string | null
  appliedTrackerYearId: string | null
  appliedAt: Date | null
  storagePath: string
  storageBucket: string | null
  storageVersionId: string | null
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  sha256: string | null
  pageCount: number | null
  uploadedBy: string | null
  uploadedAt: Date
  approvedByUserId: string | null
  finalizedByUserId: string | null
}

interface DurableK1Row {
  id: string
  document_id: string
  entity_id: string | null
  partnership_id: string | null
  tax_year: number | null
  partnership_name_raw: string | null
  processing_status: K1Status
  match_status: DurableK1DocumentRecord['matchStatus']
  version: number
  active_extraction_attempt_id: string | null
  extraction_schema_version: string | null
  applied_tracker_year_id: string | null
  applied_at: Date | null
  storage_path: string
  storage_bucket: string | null
  storage_version_id: string | null
  file_name: string | null
  mime_type: string | null
  size_bytes: string | null
  sha256: string | null
  page_count: number | null
  uploaded_by: string | null
  uploaded_at: Date
  approved_by_user_id: string | null
  finalized_by_user_id: string | null
}

const durableSelect = `
  select kd.id,
         kd.document_id,
         coalesce(p.entity_id, b.entity_scope_id) as entity_id,
         kd.partnership_id,
         kd.tax_year,
         kd.partnership_name_raw,
         kd.processing_status,
         kd.match_status,
         kd.version,
         kd.active_extraction_attempt_id,
         kd.extraction_schema_version,
         kd.applied_tracker_year_id,
         kd.applied_at,
         d.storage_path,
         d.storage_bucket,
         d.storage_version_id,
         d.file_name,
         d.mime_type,
         d.size_bytes,
         d.sha256,
         d.page_count,
         d.uploaded_by,
         d.uploaded_at,
         kd.approved_by_user_id,
         kd.finalized_by_user_id
    from k1_documents kd
    join documents d on d.id = kd.document_id
    left join partnerships p on p.id = kd.partnership_id
    left join k1_ingestion_items i on i.k1_document_id = kd.id
    left join k1_ingestion_batches b on b.id = i.batch_id`

const toDurableK1 = (row: DurableK1Row): DurableK1DocumentRecord => ({
  id: row.id,
  documentId: row.document_id,
  entityId: row.entity_id,
  partnershipId: row.partnership_id,
  taxYear: row.tax_year,
  partnershipNameRaw: row.partnership_name_raw,
  processingStatus: row.processing_status,
  matchStatus: row.match_status,
  version: row.version,
  activeExtractionAttemptId: row.active_extraction_attempt_id,
  extractionSchemaVersion: row.extraction_schema_version,
  appliedTrackerYearId: row.applied_tracker_year_id,
  appliedAt: row.applied_at,
  storagePath: row.storage_path,
  storageBucket: row.storage_bucket,
  storageVersionId: row.storage_version_id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
  sha256: row.sha256,
  pageCount: row.page_count,
  uploadedBy: row.uploaded_by,
  uploadedAt: row.uploaded_at,
  approvedByUserId: row.approved_by_user_id,
  finalizedByUserId: row.finalized_by_user_id,
})

export interface CreateDurableK1Input {
  documentId: string
  k1DocumentId: string
  ingestionItemId?: string
  partnershipId?: string | null
  taxYear?: number | null
  partnershipNameRaw?: string | null
  fileName: string
  storagePath: string
  storageBucket?: string | null
  storageVersionId?: string | null
  mimeType: string
  sizeBytes: number
  sha256: string
  pageCount: number
  uploadedBy: string
}

/**
 * PostgreSQL source of truth for Feature 022 documents. All state-changing
 * helpers accept a transaction client or create their own transaction; worker,
 * review, and apply services use the row-lock forms to compose atomic updates.
 */
export const durableK1Repository = {
  async getById(id: string, client?: pg.PoolClient): Promise<DurableK1DocumentRecord | null> {
    const result = client
      ? await client.query<DurableK1Row>(`${durableSelect} where kd.id = $1`, [id])
      : await query<DurableK1Row>(`${durableSelect} where kd.id = $1`, [id])
    return result.rows[0] ? toDurableK1(result.rows[0]) : null
  },

  async lockById(client: pg.PoolClient, id: string): Promise<DurableK1DocumentRecord | null> {
    const result = await client.query<DurableK1Row>(
      `${durableSelect} where kd.id = $1 for update of kd, d`,
      [id],
    )
    return result.rows[0] ? toDurableK1(result.rows[0]) : null
  },

  async createAccepted(input: CreateDurableK1Input, client?: pg.PoolClient): Promise<DurableK1DocumentRecord> {
    const create = async (tx: pg.PoolClient): Promise<DurableK1DocumentRecord> => {
      await tx.query(
        `insert into documents
           (id, document_type, file_name, storage_path, storage_bucket,
            storage_version_id, mime_type, size_bytes, sha256, page_count,
            uploaded_by, uploaded_at)
         values ($1, 'K1', $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         on conflict (id) do nothing`,
        [
          input.documentId,
          input.fileName,
          input.storagePath,
          input.storageBucket ?? null,
          input.storageVersionId ?? null,
          input.mimeType,
          input.sizeBytes,
          input.sha256,
          input.pageCount,
          input.uploadedBy,
        ],
      )
      await tx.query(
        `insert into k1_documents
           (id, document_id, partnership_id, tax_year, partnership_name_raw,
            processing_status, uploader_user_id)
         values ($1, $2, $3, $4, $5, 'UPLOADED', $6)
         on conflict (id) do nothing`,
        [
          input.k1DocumentId,
          input.documentId,
          input.partnershipId ?? null,
          input.taxYear ?? null,
          input.partnershipNameRaw ?? null,
          input.uploadedBy,
        ],
      )
      if (input.ingestionItemId) {
        await tx.query(
          `update k1_ingestion_items
              set document_id = $2,
                  k1_document_id = $3,
                  object_version_id = $4,
                  updated_at = now()
            where id = $1`,
          [
            input.ingestionItemId,
            input.documentId,
            input.k1DocumentId,
            input.storageVersionId ?? null,
          ],
        )
      }
      const created = await this.getById(input.k1DocumentId, tx)
      if (!created) throw new Error('K1_DOCUMENT_CREATE_FAILED')
      return created
    }
    return client ? create(client) : withTransaction(create)
  },

  async compareAndSet(
    client: pg.PoolClient,
    id: string,
    expectedVersion: number,
    patch: {
      processingStatus?: K1Status
      matchStatus?: DurableK1DocumentRecord['matchStatus']
      partnershipId?: string | null
      taxYear?: number | null
      partnershipNameRaw?: string | null
      extractionSchemaVersion?: string | null
      activeExtractionAttemptId?: string | null
      appliedTrackerYearId?: string | null
      appliedAt?: Date | null
      parseErrorCode?: string | null
      parseErrorMessage?: string | null
    },
  ): Promise<DurableK1DocumentRecord | null> {
    const assignments: string[] = []
    const values: unknown[] = [id, expectedVersion]
    const columns: Array<[keyof typeof patch, string]> = [
      ['processingStatus', 'processing_status'],
      ['matchStatus', 'match_status'],
      ['partnershipId', 'partnership_id'],
      ['taxYear', 'tax_year'],
      ['partnershipNameRaw', 'partnership_name_raw'],
      ['extractionSchemaVersion', 'extraction_schema_version'],
      ['activeExtractionAttemptId', 'active_extraction_attempt_id'],
      ['appliedTrackerYearId', 'applied_tracker_year_id'],
      ['appliedAt', 'applied_at'],
      ['parseErrorCode', 'parse_error_code'],
      ['parseErrorMessage', 'parse_error_message'],
    ]
    for (const [key, column] of columns) {
      if (!(key in patch)) continue
      values.push(patch[key])
      assignments.push(`${column} = $${values.length}`)
    }
    if (assignments.length === 0) assignments.push('updated_at = now()')
    else assignments.push('updated_at = now()')
    const updated = await client.query<{ id: string }>(
      `update k1_documents
          set ${assignments.join(', ')}, version = version + 1
        where id = $1 and version = $2
        returning id`,
      values,
    )
    if (!updated.rows[0]) return null
    return this.getById(id, client)
  },

  async withLockedDocument<T>(
    id: string,
    fn: (client: pg.PoolClient, document: DurableK1DocumentRecord) => Promise<T>,
  ): Promise<T | null> {
    return withTransaction(async (client) => {
      const document = await this.lockById(client, id)
      return document ? fn(client, document) : null
    })
  },

  async findActiveDuplicateByHash(
    entityId: string,
    sha256: string,
    client?: pg.PoolClient,
  ): Promise<DurableK1DocumentRecord | null> {
    const sql = `${durableSelect}
      where d.sha256 = $2
        and coalesce(p.entity_id, b.entity_scope_id) = $1
        and kd.superseded_by_document_id is null
        and not exists (
          select 1 from k1_document_applications a
           where a.k1_document_id = kd.id and a.status = 'CANCELLED'
        )
      order by d.uploaded_at desc
      limit 1`
    const result = client
      ? await client.query<DurableK1Row>(sql, [entityId, sha256])
      : await query<DurableK1Row>(sql, [entityId, sha256])
    return result.rows[0] ? toDurableK1(result.rows[0]) : null
  },
}

export interface DurableK1IngestionItemRecord {
  id: string
  batchId: string
  documentId: string | null
  k1DocumentId: string | null
  fileName: string
  sizeBytes: number
  sha256: string
  objectKey: string
  objectVersionId: string | null
  status: K1IngestionItemStatus
  errorCode: K1IngestionErrorCode | null
  errorSummary: string | null
  queuedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface DurableK1IngestionBatchRecord {
  id: string
  createdByUserId: string
  entityScopeId: string | null
  status: K1IngestionBatchStatus
  fileCount: number
  createdAt: Date
  closedAt: Date | null
  counts: K1IngestionBatchCounts
  items: DurableK1IngestionItemRecord[]
}

export interface DurableK1BatchCollectionCounts {
  total: number
  active: number
  attentionRequired: number
  completed: number
  cancelled: number
}

interface BatchRow {
  id: string
  created_by_user_id: string
  entity_scope_id: string | null
  status: K1IngestionBatchStatus
  file_count: number
  created_at: Date
  closed_at: Date | null
}

interface BatchItemRow {
  id: string
  batch_id: string
  sequence_number: number
  document_id: string | null
  k1_document_id: string | null
  client_file_name: string
  declared_size_bytes: string
  declared_sha256: string
  object_key: string
  object_version_id: string | null
  status: K1IngestionItemStatus
  error_code: K1IngestionErrorCode | null
  error_summary: string | null
  queued_at: Date | null
  created_at: Date
  updated_at: Date
}

const ACTIVE_ITEM_STATUSES: K1IngestionItemStatus[] = [
  'PENDING_UPLOAD', 'UPLOADED', 'VALIDATING', 'QUEUED', 'PROCESSING',
]
const ACTION_ITEM_STATUSES: K1IngestionItemStatus[] = [
  'NEEDS_MATCH', 'NEEDS_REVIEW', 'READY_TO_APPLY',
]

const toBatchItem = (row: BatchItemRow): DurableK1IngestionItemRecord => ({
  id: row.id,
  batchId: row.batch_id,
  documentId: row.document_id,
  k1DocumentId: row.k1_document_id,
  fileName: row.client_file_name,
  sizeBytes: Number(row.declared_size_bytes),
  sha256: row.declared_sha256,
  objectKey: row.object_key,
  objectVersionId: row.object_version_id,
  status: row.status,
  errorCode: row.error_code,
  errorSummary: row.error_summary,
  queuedAt: row.queued_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const summarizeItems = (items: DurableK1IngestionItemRecord[]): K1IngestionBatchCounts => ({
  total: items.length,
  active: items.filter((item) => ACTIVE_ITEM_STATUSES.includes(item.status)).length,
  actionRequired: items.filter((item) => ACTION_ITEM_STATUSES.includes(item.status)).length,
  applied: items.filter((item) => item.status === 'APPLIED').length,
  failed: items.filter((item) => item.status === 'FAILED').length,
})

const deriveBatchStatus = (
  items: DurableK1IngestionItemRecord[],
): { status: K1IngestionBatchStatus; close: boolean } => {
  const counts = summarizeItems(items)
  if (items.every((item) => item.status === 'CANCELLED')) return { status: 'CANCELLED', close: true }
  if (items.every((item) => ['APPLIED', 'CANCELLED'].includes(item.status))) return { status: 'COMPLETED', close: true }
  if (counts.applied === counts.total) return { status: 'COMPLETED', close: true }
  if (counts.active > 0) {
    return {
      status: items.every((item) => item.status === 'PENDING_UPLOAD') ? 'OPEN' : 'PROCESSING',
      close: false,
    }
  }
  if (counts.actionRequired > 0) return { status: 'ACTION_REQUIRED', close: false }
  if (counts.failed > 0) return { status: 'PARTIAL_FAILURE', close: true }
  return { status: 'PROCESSING', close: false }
}

const loadBatch = async (
  client: pg.PoolClient,
  batchId: string,
  lock = false,
): Promise<DurableK1IngestionBatchRecord | null> => {
  const batchResult = await client.query<BatchRow>(
    `select * from k1_ingestion_batches where id = $1${lock ? ' for update' : ''}`,
    [batchId],
  )
  const batch = batchResult.rows[0]
  if (!batch) return null
  const itemResult = await client.query<BatchItemRow>(
    `select * from k1_ingestion_items where batch_id = $1 order by sequence_number, id${lock ? ' for update' : ''}`,
    [batchId],
  )
  const items = itemResult.rows.map(toBatchItem)
  return {
    id: batch.id,
    createdByUserId: batch.created_by_user_id,
    entityScopeId: batch.entity_scope_id,
    status: batch.status,
    fileCount: batch.file_count,
    createdAt: batch.created_at,
    closedAt: batch.closed_at,
    counts: summarizeItems(items),
    items,
  }
}

/** Durable batch/item state machine used by upload, worker, retry, and apply. */
export const durableK1BatchRepository = {
  async create(args: {
    id: string
    createdByUserId: string
    entityScopeId: string | null
    items: Array<{
      id: string
      fileName: string
      sizeBytes: number
      sha256: string
      objectKey: string
    }>
  }): Promise<DurableK1IngestionBatchRecord> {
    return withTransaction(async (client) => {
      await client.query(
        `insert into k1_ingestion_batches
           (id, created_by_user_id, entity_scope_id, status, file_count)
         values ($1, $2, $3, 'OPEN', $4)`,
        [args.id, args.createdByUserId, args.entityScopeId, args.items.length],
      )
      for (const [sequenceNumber, item] of args.items.entries()) {
        await client.query(
          `insert into k1_ingestion_items
             (id, batch_id, sequence_number, client_file_name, declared_size_bytes,
              declared_sha256, object_key, status)
           values ($1, $2, $3, $4, $5, $6, $7, 'PENDING_UPLOAD')`,
          [item.id, args.id, sequenceNumber, item.fileName, item.sizeBytes, item.sha256, item.objectKey],
        )
      }
      const created = await loadBatch(client, args.id)
      if (!created) throw new Error('K1_BATCH_CREATE_FAILED')
      return created
    })
  },

  async getById(batchId: string, client?: pg.PoolClient): Promise<DurableK1IngestionBatchRecord | null> {
    if (client) return loadBatch(client, batchId)
    return withTransaction((tx) => loadBatch(tx, batchId))
  },

  async list(args: {
    actorUserId: string
    isAdmin: boolean
    authorizedEntityIds: readonly string[]
    entityId?: string
    status?: K1IngestionBatchStatus
    attentionOnly?: boolean
    limit: number
    cursor?: { createdAt: Date; id: string }
  }): Promise<{
    items: DurableK1IngestionBatchRecord[]
    counts: DurableK1BatchCollectionCounts
    nextCursor: { createdAt: Date; id: string } | null
  }> {
    return withTransaction(async (client) => {
      const params: unknown[] = [args.isAdmin, args.actorUserId, args.authorizedEntityIds]
      const where = [`($1::boolean or b.created_by_user_id = $2 or b.entity_scope_id = any($3::uuid[]))`]
      if (args.entityId) {
        params.push(args.entityId)
        where.push(`b.entity_scope_id = $${params.length}`)
      }
      if (args.status) {
        params.push(args.status)
        where.push(`b.status = $${params.length}`)
      }
      if (args.attentionOnly) where.push(`b.status in ('ACTION_REQUIRED', 'PARTIAL_FAILURE')`)
      const countResult = await client.query<{
        total: number; active: number; attention_required: number; completed: number; cancelled: number
      }>(`
        select count(*)::int as total,
          count(*) filter (where b.status in ('OPEN', 'PROCESSING'))::int as active,
          count(*) filter (where b.status in ('ACTION_REQUIRED', 'PARTIAL_FAILURE'))::int as attention_required,
          count(*) filter (where b.status = 'COMPLETED')::int as completed,
          count(*) filter (where b.status = 'CANCELLED')::int as cancelled
        from k1_ingestion_batches b where ${where.join(' and ')}`,
        params,
      )
      const pagedWhere = [...where]
      if (args.cursor) {
        params.push(args.cursor.createdAt, args.cursor.id)
        pagedWhere.push(`(b.created_at, b.id) < ($${params.length - 1}, $${params.length}::uuid)`)
      }
      params.push(args.limit + 1)
      const page = await client.query<{ id: string; created_at: Date }>(`
        select b.id, b.created_at from k1_ingestion_batches b
        where ${pagedWhere.join(' and ')}
        order by b.created_at desc, b.id desc
        limit $${params.length}`,
        params,
      )
      const visibleRows = page.rows.slice(0, args.limit)
      const items = (await Promise.all(visibleRows.map((row) => loadBatch(client, row.id))))
        .filter((batch): batch is DurableK1IngestionBatchRecord => batch != null)
      const last = page.rows.length > args.limit ? visibleRows.at(-1) : null
      const counts = countResult.rows[0] ?? { total: 0, active: 0, attention_required: 0, completed: 0, cancelled: 0 }
      return {
        items,
        counts: {
          total: counts.total, active: counts.active, attentionRequired: counts.attention_required,
          completed: counts.completed, cancelled: counts.cancelled,
        },
        nextCursor: last ? { createdAt: last.created_at, id: last.id } : null,
      }
    })
  },

  async getItemById(itemId: string, client?: pg.PoolClient, lock = false): Promise<DurableK1IngestionItemRecord | null> {
    const execute = async (tx: pg.PoolClient) => {
      const result = await tx.query<BatchItemRow>(
        `select * from k1_ingestion_items where id = $1${lock ? ' for update' : ''}`,
        [itemId],
      )
      return result.rows[0] ? toBatchItem(result.rows[0]) : null
    }
    return client ? execute(client) : withTransaction(execute)
  },

  async transitionItem(
    client: pg.PoolClient,
    itemId: string,
    args: {
      from?: K1IngestionItemStatus[]
      to: K1IngestionItemStatus
      errorCode?: K1IngestionErrorCode | null
      errorSummary?: string | null
      objectVersionId?: string | null
      documentId?: string | null
      k1DocumentId?: string | null
      queuedAt?: Date | null
    },
  ): Promise<DurableK1IngestionItemRecord | null> {
    // Always acquire the parent-batch lock before the item lock. Parallel
    // upload completions otherwise deadlock by locking different items and
    // then trying to lock the whole batch in recomputeBatch().
    const reference = await client.query<{ batch_id: string }>(
      'select batch_id from k1_ingestion_items where id = $1', [itemId],
    )
    if (!reference.rows[0]) return null
    await client.query('select id from k1_ingestion_batches where id = $1 for update', [reference.rows[0].batch_id])
    const current = await this.getItemById(itemId, client, true)
    if (!current) return null
    if (args.from && !args.from.includes(current.status)) {
      throw Object.assign(new Error('INVALID_ITEM_STATE'), {
        code: 'INVALID_ITEM_STATE',
        currentStatus: current.status,
      })
    }
    const result = await client.query<BatchItemRow>(
      `update k1_ingestion_items
          set status = $2,
              error_code = $3,
              error_summary = $4,
              object_version_id = coalesce($5, object_version_id),
              document_id = coalesce($6, document_id),
              k1_document_id = coalesce($7, k1_document_id),
              queued_at = coalesce($8, queued_at),
              updated_at = now()
        where id = $1
        returning *`,
      [
        itemId,
        args.to,
        args.errorCode ?? null,
        args.errorSummary ?? null,
        args.objectVersionId ?? null,
        args.documentId ?? null,
        args.k1DocumentId ?? null,
        args.queuedAt ?? null,
      ],
    )
    await this.recomputeBatch(client, current.batchId)
    return result.rows[0] ? toBatchItem(result.rows[0]) : null
  },

  async recomputeBatch(
    client: pg.PoolClient,
    batchId: string,
  ): Promise<DurableK1IngestionBatchRecord | null> {
    const locked = await loadBatch(client, batchId, true)
    if (!locked) return null
    const derived = deriveBatchStatus(locked.items)
    await client.query(
      `update k1_ingestion_batches
          set status = $2,
              closed_at = case when $3 then coalesce(closed_at, now()) else null end
        where id = $1`,
      [batchId, derived.status, derived.close],
    )
    return loadBatch(client, batchId)
  },

  async withLockedBatch<T>(
    batchId: string,
    fn: (client: pg.PoolClient, batch: DurableK1IngestionBatchRecord) => Promise<T>,
  ): Promise<T | null> {
    return withTransaction(async (client) => {
      const batch = await loadBatch(client, batchId, true)
      return batch ? fn(client, batch) : null
    })
  },
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const entities = new Map<string, EntityRecord>()
const partnerships = new Map<string, PartnershipRecord>()
const documents = new Map<string, DocumentRecord>()
const k1Documents = new Map<string, K1DocumentRecord>()
const k1Issues = new Map<string, K1IssueRecord>()
const memberships: EntityMembershipRecord[] = []
const documentVersions = new Map<string, DocumentVersionRecord>()

// ---------------------------------------------------------------------------
// Seed — creates demo entities/partnerships and grants both seeded users
// entitlement. Every seeded admin + user from auth.repository is added to
// every entity; real provisioning is out of scope for V1 of this feature.
// ---------------------------------------------------------------------------

let seeded = false
const seed = () => {
  if (seeded) return
  seeded = true

  const makeEntity = (name: string): EntityRecord => {
    const e: EntityRecord = {
      id: randomUUID(),
      name,
      entityType: 'UNKNOWN',
      jurisdiction: null,
      taxId: null,
      formedOn: null,
      status: 'ACTIVE',
      notes: null,
      registeredAgent: null,
      primaryContact: null,
    }
    entities.set(e.id, e)
    return e
  }
  const makePartnership = (name: string, entityId: string): PartnershipRecord => {
    const p: PartnershipRecord = { id: randomUUID(), name, entityId }
    partnerships.set(p.id, p)
    return p
  }

  const trust = makeEntity('Whitfield Family Trust')
  const holdings = makeEntity('Whitfield Holdings LLC')
  const realty = makeEntity('Whitfield Realty LLC')

  makePartnership('Blackstone Capital Partners VII', trust.id)
  makePartnership('Sequoia Heritage Fund', holdings.id)
  makePartnership('KKR Americas Fund XII', trust.id)
  makePartnership('Carlyle Realty Partners IX', realty.id)
  makePartnership('Apollo Investment Fund IX', holdings.id)

  for (const user of authRepository.listUsers()) {
    for (const entity of entities.values()) {
      memberships.push({ userId: user.id, entityId: entity.id })
    }
  }

  // Demo K-1 docs — one per status so the dashboard/KPIs light up on a fresh instance.
  const firstUser = authRepository.listUsers()[0]
  if (firstUser) {
    const demos: Array<{
      partnership: string
      status: K1Status
      issues?: number
      err?: { code: string; message: string }
    }> = [
      { partnership: 'Blackstone Capital Partners VII', status: 'FINALIZED' },
      { partnership: 'Sequoia Heritage Fund', status: 'READY_FOR_APPROVAL' },
      { partnership: 'KKR Americas Fund XII', status: 'NEEDS_REVIEW', issues: 2 },
      { partnership: 'Carlyle Realty Partners IX', status: 'PROCESSING' },
      {
        partnership: 'Apollo Investment Fund IX',
        status: 'PROCESSING',
        err: {
          code: 'PARSE_LOW_CONFIDENCE',
          message: 'Low confidence on multiple fields — extraction aborted.',
        },
      },
    ]

    for (const d of demos) {
      const p = [...partnerships.values()].find((x) => x.name === d.partnership)
      if (!p) continue
      const doc: DocumentRecord = {
        id: randomUUID(),
        storagePath: `seed/${randomUUID()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedAt: new Date(),
        uploadedBy: firstUser.id,
      }
      documents.set(doc.id, doc)
      const k: K1DocumentRecord = {
        id: randomUUID(),
        documentId: doc.id,
        partnershipId: p.id,
        entityId: p.entityId,
        taxYear: 2024,
        partnershipNameRaw: p.name,
        processingStatus: d.status,
        parseErrorCode: d.err?.code ?? null,
        parseErrorMessage: d.err?.message ?? null,
        parseLastAttemptAt: d.err ? new Date() : null,
        parseAttempts: d.err ? 1 : 0,
        supersededByDocumentId: null,
        uploaderUserId: firstUser.id,
        uploadedAt: new Date(Date.now() - Math.random() * 1_000_000_00),
        version: 0,
        approvedByUserId: null,
        finalizedByUserId: null,
      }
      k1Documents.set(k.id, k)
      for (let i = 0; i < (d.issues ?? 0); i++) {
        const iss: K1IssueRecord = {
          id: randomUUID(),
          k1DocumentId: k.id,
          issueType: 'MISSING_FIELD',
          severity: 'MEDIUM',
          status: 'OPEN',
          message: `Seeded issue ${i + 1}`,
          k1FieldValueId: null,
          resolvedAt: null,
          resolvedByUserId: null,
          createdAt: new Date(),
        }
        k1Issues.set(iss.id, iss)
      }
    }
  }
}

/** Always create empty entity/membership skeleton so users can log in and upload K-1s. */
const seedMinimal = () => {
  if (entities.size > 0) return
  const makeEntity = (name: string): EntityRecord => {
    const e: EntityRecord = {
      id: randomUUID(),
      name,
      entityType: 'UNKNOWN',
      jurisdiction: null,
      taxId: null,
      formedOn: null,
      status: 'ACTIVE',
      notes: null,
      registeredAgent: null,
      primaryContact: null,
    }
    entities.set(e.id, e)
    return e
  }
  const trust = makeEntity('Whitfield Family Trust')
  const holdings = makeEntity('Whitfield Holdings LLC')
  const realty = makeEntity('Whitfield Realty LLC')
  for (const user of authRepository.listUsers()) {
    for (const entity of [trust, holdings, realty]) {
      memberships.push({ userId: user.id, entityId: entity.id })
    }
  }
}

// Auto-seed is opt-in only.
// - SEED_DEMO_DATA=true: full demo entities/partnerships/K-1 rows.
// - SEED_MINIMAL_DATA=true: minimal entities + memberships only.
// Default behavior: start with no entities so Admins can create their own.
if ((process.env.SEED_DEMO_DATA ?? 'false') === 'true') {
  seed()
} else if ((process.env.SEED_MINIMAL_DATA ?? 'false') === 'true') {
  seedMinimal()
}

export interface ListFilters {
  taxYear?: number
  entityId?: string
  status?: K1Status
  q?: string
  sort: 'uploaded_at' | 'partnership' | 'entity' | 'tax_year' | 'status' | 'issues'
  direction: 'asc' | 'desc'
  limit: number
  cursor?: string
}

const scopeEntityIds = (userId: string, explicit?: string): string[] => {
  const allowed = memberships
    .filter((m) => m.userId === userId)
    .map((m) => m.entityId)
  if (!explicit) return allowed
  if (!allowed.includes(explicit)) return []
  return [explicit]
}

const statusOrder: K1Status[] = [
  'UPLOADED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'READY_FOR_APPROVAL',
  'FINALIZED',
]

const countOpenIssues = (k1Id: string) =>
  [...k1Issues.values()].filter(
    (i) => i.k1DocumentId === k1Id && i.status === 'OPEN',
  ).length

const toSummary = (k: K1DocumentRecord): K1DocumentSummary => {
  const partnership = k.partnershipId ? partnerships.get(k.partnershipId) : undefined
  const entity = entities.get(k.entityId)
  if (!entity) {
    throw new Error(
      `K-1 ${k.id} references missing partnership/entity`,
    )
  }
  const partnershipName = partnership?.name ?? k.partnershipNameRaw ?? null
  return {
    id: k.id,
    documentId: k.documentId,
    documentName: partnershipName ? `K-1 — ${partnershipName}` : 'K-1 — Pending partnership resolution',
    partnership: { id: partnership?.id ?? null, name: partnershipName },
    entity: { id: entity.id, name: entity.name },
    taxYear: k.taxYear,
    status: k.processingStatus,
    issuesOpenCount: countOpenIssues(k.id),
    uploadedAt: k.uploadedAt.toISOString(),
    uploaderUserId: k.uploaderUserId,
    parseError: k.parseErrorCode
      ? {
          code: k.parseErrorCode,
          message: k.parseErrorMessage ?? 'Parsing failed.',
          lastAttemptAt: (k.parseLastAttemptAt ?? k.uploadedAt).toISOString(),
        }
      : null,
    supersededByDocumentId: k.supersededByDocumentId,
  }
}

const compareSummaries = (
  a: K1DocumentSummary,
  b: K1DocumentSummary,
  sort: ListFilters['sort'],
  direction: ListFilters['direction'],
): number => {
  const dir = direction === 'asc' ? 1 : -1
  switch (sort) {
    case 'uploaded_at':
      return dir * (new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
    case 'partnership':
      return dir * (a.partnership.name ?? '').localeCompare(b.partnership.name ?? '')
    case 'entity':
      return dir * a.entity.name.localeCompare(b.entity.name)
    case 'tax_year':
      return dir * ((a.taxYear ?? -1) - (b.taxYear ?? -1))
    case 'status':
      return dir * (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status))
    case 'issues':
      return dir * (a.issuesOpenCount - b.issuesOpenCount)
  }
}

export const k1Repository = {
  // --------- reads ---------

  getUserEntityIds(userId: string): string[] {
    return memberships.filter((m) => m.userId === userId).map((m) => m.entityId)
  },

  userCanAccessEntity(userId: string, entityId: string): boolean {
    return memberships.some((m) => m.userId === userId && m.entityId === entityId)
  },

  listEntities(): EntityRecord[] {
    return [...entities.values()]
  },

  /** Returns the entity IDs that userId is a member of. */
  listEntitiesForUser(userId: string): string[] {
    return memberships.filter((m) => m.userId === userId).map((m) => m.entityId)
  },

  listPartnerships(): PartnershipRecord[] {
    return [...partnerships.values()]
  },

  getPartnership(id: string): PartnershipRecord | undefined {
    return partnerships.get(id)
  },

  findPartnershipByEntityAndName(entityId: string, name: string): PartnershipRecord | undefined {
    const needle = name.trim().toLowerCase()
    return [...partnerships.values()].find(
      (partnership) => partnership.entityId === entityId && partnership.name.trim().toLowerCase() === needle,
    )
  },

  createPartnership(args: { entityId: string; name: string }): PartnershipRecord {
    const partnership: PartnershipRecord = {
      id: randomUUID(),
      entityId: args.entityId,
      name: args.name.trim(),
    }
    partnerships.set(partnership.id, partnership)
    return partnership
  },

  upsertPartnership(args: { id: string; entityId: string; name: string }): PartnershipRecord {
    const partnership: PartnershipRecord = {
      id: args.id,
      entityId: args.entityId,
      name: args.name.trim(),
    }
    partnerships.set(partnership.id, partnership)
    return partnership
  },

  /** Reconcile the process-local mirror after the durable partnership is deleted. */
  deletePartnership(id: string): boolean {
    const partnershipExisted = partnerships.has(id)
    const deletedK1Ids = new Set(
      [...k1Documents.values()]
        .filter((document) => document.partnershipId === id)
        .map((document) => document.id),
    )
    const deletedDocumentIds = new Set(
      [...k1Documents.values()]
        .filter((document) => deletedK1Ids.has(document.id))
        .map((document) => document.documentId),
    )
    for (const [issueId, issue] of k1Issues) {
      if (deletedK1Ids.has(issue.k1DocumentId)) k1Issues.delete(issueId)
    }
    for (const k1Id of deletedK1Ids) k1Documents.delete(k1Id)
    for (const documentId of deletedDocumentIds) documents.delete(documentId)
    for (const [versionId, version] of documentVersions) {
      if (version.partnershipId === id) documentVersions.delete(versionId)
    }
    partnerships.delete(id)
    return partnershipExisted || deletedK1Ids.size > 0
  },

  /** Create a new entity. Grants membership to every existing user so the entity is visible. */
  createEntity(args: {
    name: string
    entityType?: string
    jurisdiction?: string | null
    taxId?: string | null
    formedOn?: string | null
  }): EntityRecord {
    const entity: EntityRecord = {
      id: randomUUID(),
      name: args.name.trim(),
      entityType: args.entityType ?? 'UNKNOWN',
      jurisdiction: args.jurisdiction?.trim() || null,
      taxId: args.taxId?.trim() || null,
      formedOn: args.formedOn?.trim() || null,
      status: 'DRAFT',
      notes: null,
      registeredAgent: null,
      primaryContact: null,
    }
    entities.set(entity.id, entity)
    for (const user of authRepository.listUsers()) {
      if (!memberships.some((m) => m.userId === user.id && m.entityId === entity.id)) {
        memberships.push({ userId: user.id, entityId: entity.id })
      }
    }
    return entity
  },

  updateEntity(id: string, patch: { name?: string }): EntityRecord | undefined {
    const e = entities.get(id)
    if (!e) return undefined
    if (patch.name !== undefined) e.name = patch.name.trim()
    entities.set(id, e)
    return e
  },

  /** Remove an entity. Caller MUST check there are no partnerships attached first. */
  deleteEntity(id: string): boolean {
    if (!entities.has(id)) return false
    entities.delete(id)
    // Drop memberships for the removed entity.
    for (let i = memberships.length - 1; i >= 0; i--) {
      if (memberships[i].entityId === id) memberships.splice(i, 1)
    }
    return true
  },

  countPartnershipsForEntity(entityId: string): number {
    let n = 0
    for (const p of partnerships.values()) if (p.entityId === entityId) n++
    return n
  },

  /** List all non-superseded K-1 documents for a partnership (unscoped — caller enforces scope). */
  listK1sForPartnership(partnershipId: string): K1DocumentRecord[] {
    return [...k1Documents.values()].filter(
      (k) => !k.supersededByDocumentId && k.partnershipId === partnershipId,
    )
  },

  getK1Document(id: string): K1DocumentRecord | undefined {
    return k1Documents.get(id)
  },

  /** Returns the storage-relative path of the PDF for a given K-1 document. */
  getDocumentStoragePath(k1DocumentId: string): string | undefined {
    const k1 = k1Documents.get(k1DocumentId)
    if (!k1) return undefined
    return documents.get(k1.documentId)?.storagePath
  },

  getK1Summary(userId: string, id: string): K1DocumentSummary | undefined {
    const k = k1Documents.get(id)
    if (!k || k.supersededByDocumentId) return undefined
    if (!this.userCanAccessEntity(userId, k.entityId)) return undefined
    return toSummary(k)
  },

  listK1s(
    userId: string,
    filters: ListFilters,
  ): { items: K1DocumentSummary[]; nextCursor: string | null } {
    const allowed = scopeEntityIds(userId, filters.entityId)
    if (allowed.length === 0) return { items: [], nextCursor: null }

    const q = filters.q?.trim().toLowerCase() ?? ''

    const all = [...k1Documents.values()]
      .filter((k) => !k.supersededByDocumentId)
      .filter((k) => allowed.includes(k.entityId))
      // Always show docs whose tax year hasn't been resolved yet (null) so they
      // remain visible immediately after upload until async parse fills it in.
      .filter((k) => !filters.taxYear || k.taxYear === filters.taxYear || k.taxYear === null)
      .filter((k) => !filters.status || k.processingStatus === filters.status)
      .map(toSummary)
      .filter((s) =>
        !q ||
        s.documentName.toLowerCase().includes(q) ||
        (s.partnership.name ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => compareSummaries(a, b, filters.sort, filters.direction))

    let startIdx = 0
    if (filters.cursor) {
      const decoded = Number.parseInt(
        Buffer.from(filters.cursor, 'base64').toString('utf8'),
        10,
      )
      if (Number.isFinite(decoded)) startIdx = decoded
    }

    const slice = all.slice(startIdx, startIdx + filters.limit)
    const nextIdx = startIdx + filters.limit
    const nextCursor =
      nextIdx < all.length
        ? Buffer.from(String(nextIdx), 'utf8').toString('base64')
        : null

    return { items: slice, nextCursor }
  },

  getKpis(
    userId: string,
    scope: { taxYear?: number; entityId?: string },
  ): K1Kpis {
    const allowed = scopeEntityIds(userId, scope.entityId)
    const counts: Record<K1Status, number> = {
      UPLOADED: 0,
      PROCESSING: 0,
      NEEDS_REVIEW: 0,
      READY_FOR_APPROVAL: 0,
      FINALIZED: 0,
    }
    let processingWithErrors = 0

    if (allowed.length !== 0) {
      for (const k of k1Documents.values()) {
        if (k.supersededByDocumentId) continue
        if (!allowed.includes(k.entityId)) continue
        // Pending docs (taxYear === null) count toward all year scopes so the
        // KPI tiles update immediately after upload.
        if (scope.taxYear && k.taxYear !== null && k.taxYear !== scope.taxYear) continue
        counts[k.processingStatus] += 1
        if (k.processingStatus === 'PROCESSING' && k.parseErrorCode) {
          processingWithErrors += 1
        }
      }
    }

    return {
      scope: {
        taxYear: scope.taxYear ?? null,
        entityId: scope.entityId ?? null,
      },
      counts,
      processingWithErrors,
    }
  },

  findDuplicate(
    partnershipId: string,
    entityId: string,
    taxYear: number,
    excludeK1DocumentId?: string,
  ): K1DocumentRecord | undefined {
    return [...k1Documents.values()].find(
      (k) =>
        !k.supersededByDocumentId &&
        k.id !== excludeK1DocumentId &&
        k.partnershipId === partnershipId &&
        k.entityId === entityId &&
        k.taxYear === taxYear,
    )
  },

  // --------- writes ---------

  insertUpload(args: {
    uploaderUserId: string
    entityId: string
    storagePath: string
    mimeType: string
    sizeBytes: number
  }): { document: DocumentRecord; k1: K1DocumentRecord } {
    const now = new Date()
    const document: DocumentRecord = {
      id: randomUUID(),
      storagePath: args.storagePath,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      uploadedAt: now,
      uploadedBy: args.uploaderUserId,
    }
    documents.set(document.id, document)

    const k1: K1DocumentRecord = {
      id: randomUUID(),
      documentId: document.id,
      partnershipId: null,
      entityId: args.entityId,
      taxYear: null,
      partnershipNameRaw: null,
      processingStatus: 'UPLOADED',
      parseErrorCode: null,
      parseErrorMessage: null,
      parseLastAttemptAt: null,
      parseAttempts: 0,
      supersededByDocumentId: null,
      uploaderUserId: args.uploaderUserId,
      uploadedAt: now,
      version: 0,
      approvedByUserId: null,
      finalizedByUserId: null,
    }
    k1Documents.set(k1.id, k1)
    return { document, k1 }
  },

  resolveUploadMetadata(args: {
    k1DocumentId: string
    partnershipId: string
    partnershipNameRaw: string
    taxYear: number
  }): K1DocumentRecord | undefined {
    const k1 = k1Documents.get(args.k1DocumentId)
    if (!k1) return undefined
    const next: K1DocumentRecord = {
      ...k1,
      partnershipId: args.partnershipId,
      partnershipNameRaw: args.partnershipNameRaw,
      taxYear: args.taxYear,
    }
    k1Documents.set(next.id, next)
    return next
  },

  supersede(args: {
    existing: K1DocumentRecord
    newDocumentId: string
    supersededByUserId: string
  }): DocumentVersionRecord {
    args.existing.supersededByDocumentId = args.newDocumentId
    k1Documents.set(args.existing.id, args.existing)

    if (!args.existing.partnershipId || args.existing.taxYear == null) {
      throw new Error('Cannot supersede an unresolved K-1 document')
    }

    const version: DocumentVersionRecord = {
      id: randomUUID(),
      originalDocumentId: args.existing.documentId,
      supersededById: args.newDocumentId,
      partnershipId: args.existing.partnershipId,
      entityId: args.existing.entityId,
      taxYear: args.existing.taxYear,
      supersededAt: new Date(),
      supersededByUserId: args.supersededByUserId,
    }
    documentVersions.set(version.id, version)
    return version
  },

  setStatus(id: string, status: K1Status): void {
    const k = k1Documents.get(id)
    if (!k) return
    k.processingStatus = status
    k1Documents.set(id, k)
  },

  beginParse(id: string): void {
    const k = k1Documents.get(id)
    if (!k) return
    k.processingStatus = 'PROCESSING'
    k.parseAttempts += 1
    k.parseLastAttemptAt = new Date()
    k.parseErrorCode = null
    k.parseErrorMessage = null
    k1Documents.set(id, k)
  },

  completeParse(
    id: string,
    nextStatus: Exclude<K1Status, 'UPLOADED' | 'PROCESSING'>,
  ): void {
    const k = k1Documents.get(id)
    if (!k) return
    k.processingStatus = nextStatus
    k.parseErrorCode = null
    k.parseErrorMessage = null
    k1Documents.set(id, k)
  },

  failParse(id: string, code: string, message: string): void {
    const k = k1Documents.get(id)
    if (!k) return
    k.processingStatus = 'PROCESSING'
    k.parseErrorCode = code
    k.parseErrorMessage = message
    k1Documents.set(id, k)
  },

  addIssue(args: {
    k1DocumentId: string
    issueType: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    message: string
    k1FieldValueId?: string | null
  }): K1IssueRecord {
    const issue: K1IssueRecord = {
      id: randomUUID(),
      k1DocumentId: args.k1DocumentId,
      issueType: args.issueType,
      severity: args.severity,
      status: 'OPEN',
      message: args.message,
      k1FieldValueId: args.k1FieldValueId ?? null,
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: new Date(),
    }
    k1Issues.set(issue.id, issue)
    return issue
  },

  listIssues(): K1IssueRecord[] {
    return [...k1Issues.values()]
  },

  // ---- Feature 003: review helpers ----

  listIssuesForK1(k1DocumentId: string): K1IssueRecord[] {
    return [...k1Issues.values()].filter((i) => i.k1DocumentId === k1DocumentId)
  },

  getIssue(id: string): K1IssueRecord | undefined {
    return k1Issues.get(id)
  },

  findOpenIssuesForField(k1FieldValueId: string): K1IssueRecord[] {
    return [...k1Issues.values()].filter(
      (i) => i.k1FieldValueId === k1FieldValueId && i.status === 'OPEN',
    )
  },

  resolveIssue(
    id: string,
    args: { resolvedByUserId: string | null },
  ): K1IssueRecord | undefined {
    const i = k1Issues.get(id)
    if (!i) return undefined
    i.status = 'RESOLVED'
    i.resolvedAt = new Date()
    i.resolvedByUserId = args.resolvedByUserId
    k1Issues.set(id, i)
    return i
  },

  /**
   * Optimistic-concurrency compare-and-swap on `k1_documents.version`.
   * Returns the updated record on success, or null when the provided
   * `expectedVersion` does not match the current row.
   */
  casUpdateK1(
    id: string,
    expectedVersion: number,
    patch: Partial<Omit<K1DocumentRecord, 'id' | 'version'>>,
  ): K1DocumentRecord | null {
    const k = k1Documents.get(id)
    if (!k) return null
    if (k.version !== expectedVersion) return null
    const next: K1DocumentRecord = {
      ...k,
      ...patch,
      version: expectedVersion + 1,
    }
    k1Documents.set(id, next)
    return next
  },

  _debugSetK1(patch: Partial<K1DocumentRecord> & { id: string }): K1DocumentRecord {
    const k = k1Documents.get(patch.id)
    if (!k) throw new Error(`Unknown k1 ${patch.id}`)
    const next = { ...k, ...patch }
    k1Documents.set(next.id, next)
    return next
  },

  // --------- helpers (testing / seeding demo rows) ---------

  _debugReset(): void {
    entities.clear()
    partnerships.clear()
    documents.clear()
    k1Documents.clear()
    k1Issues.clear()
    memberships.length = 0
    documentVersions.clear()
    seeded = false
    seed()
  },

  /** Seed a K-1 row for retained contract and review-flow tests. */
  _debugSeedK1(args: {
    partnershipName: string
    status: K1Status
    taxYear: number
    uploaderUserId: string
    issues?: number
    parseError?: { code: string; message: string }
  }): K1DocumentRecord {
    const p = [...partnerships.values()].find((x) => x.name === args.partnershipName)
    if (!p) throw new Error(`Partnership not found: ${args.partnershipName}`)
    const doc: DocumentRecord = {
      id: randomUUID(),
      storagePath: `seed/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedAt: new Date(),
      uploadedBy: args.uploaderUserId,
    }
    documents.set(doc.id, doc)
    const k: K1DocumentRecord = {
      id: randomUUID(),
      documentId: doc.id,
      partnershipId: p.id,
      entityId: p.entityId,
      taxYear: args.taxYear,
      partnershipNameRaw: p.name,
      processingStatus: args.status,
      parseErrorCode: args.parseError?.code ?? null,
      parseErrorMessage: args.parseError?.message ?? null,
      parseLastAttemptAt: args.parseError ? new Date() : null,
      parseAttempts: args.parseError ? 1 : 0,
      supersededByDocumentId: null,
      uploaderUserId: args.uploaderUserId,
      uploadedAt: new Date(),
      version: 0,
      approvedByUserId: null,
      finalizedByUserId: null,
    }
    k1Documents.set(k.id, k)
    for (let i = 0; i < (args.issues ?? 0); i++) {
      this.addIssue({
        k1DocumentId: k.id,
        issueType: 'MISSING_FIELD',
        severity: 'MEDIUM',
        message: `Seeded issue ${i + 1}`,
      })
    }
    return k
  },

  _debugSetMemberships(userId: string, entityIds: string[]): void {
    for (let i = memberships.length - 1; i >= 0; i--) {
      if (memberships[i]!.userId === userId) memberships.splice(i, 1)
    }
    for (const entityId of entityIds) memberships.push({ userId, entityId })
  },

}
