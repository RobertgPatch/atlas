import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'

import { query, withTransaction } from '../../../infra/db/client.js'
import type { K1ExtractionProvider } from './k1ExtractionAttempt.types.js'
export type { K1ExtractionProvider } from './k1ExtractionAttempt.types.js'

export type K1ExtractionAttemptStatus =
  | 'CREATED'
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'SUPERSEDED'

export interface K1ExtractionAttemptRecord {
  id: string
  k1DocumentId: string
  attemptNumber: number
  provider: K1ExtractionProvider
  providerJobId: string | null
  clientToken: string
  inputS3Uri: string | null
  outputS3Prefix: string | null
  projectArn: string | null
  projectStage: string | null
  blueprintArn: string | null
  blueprintVersion: string | null
  mappingSchemaVersion: string
  status: K1ExtractionAttemptStatus
  rawResultKey: string | null
  rawResultSha256: string | null
  customOutputStatus: string | null
  startedAt: Date | null
  completedAt: Date | null
  lastReconciledAt: Date | null
  errorCode: string | null
  errorSummary: string | null
  createdAt: Date
  updatedAt: Date
}

interface AttemptRow {
  id: string
  k1_document_id: string
  attempt_number: number
  provider: K1ExtractionProvider
  provider_job_id: string | null
  client_token: string
  input_s3_uri: string | null
  output_s3_prefix: string | null
  project_arn: string | null
  project_stage: string | null
  blueprint_arn: string | null
  blueprint_version: string | null
  mapping_schema_version: string
  status: K1ExtractionAttemptStatus
  raw_result_key: string | null
  raw_result_sha256: string | null
  custom_output_status: string | null
  started_at: Date | null
  completed_at: Date | null
  last_reconciled_at: Date | null
  error_code: string | null
  error_summary: string | null
  created_at: Date
  updated_at: Date
}

const toAttempt = (row: AttemptRow): K1ExtractionAttemptRecord => ({
  id: row.id,
  k1DocumentId: row.k1_document_id,
  attemptNumber: row.attempt_number,
  provider: row.provider,
  providerJobId: row.provider_job_id,
  clientToken: row.client_token,
  inputS3Uri: row.input_s3_uri,
  outputS3Prefix: row.output_s3_prefix,
  projectArn: row.project_arn,
  projectStage: row.project_stage,
  blueprintArn: row.blueprint_arn,
  blueprintVersion: row.blueprint_version,
  mappingSchemaVersion: row.mapping_schema_version,
  status: row.status,
  rawResultKey: row.raw_result_key,
  rawResultSha256: row.raw_result_sha256,
  customOutputStatus: row.custom_output_status,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  lastReconciledAt: row.last_reconciled_at,
  errorCode: row.error_code,
  errorSummary: row.error_summary,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const createK1ExtractionClientToken = (
  k1DocumentId: string,
  attemptNumber: number,
  mappingSchemaVersion: string,
): string => `k1-${createHash('sha256')
  .update(`${k1DocumentId}:${attemptNumber}:${mappingSchemaVersion}`)
  .digest('hex')}`

const selectAttempt = `select * from k1_extraction_attempts`

const getById = async (
  id: string,
  client?: pg.PoolClient,
  lock = false,
): Promise<K1ExtractionAttemptRecord | null> => {
  const result = client
    ? await client.query<AttemptRow>(`${selectAttempt} where id = $1${lock ? ' for update' : ''}`, [id])
    : await query<AttemptRow>(`${selectAttempt} where id = $1`, [id])
  return result.rows[0] ? toAttempt(result.rows[0]) : null
}

export const k1ExtractionAttemptRepository = {
  getById,

  async getByProviderJobId(providerJobId: string, client?: pg.PoolClient): Promise<K1ExtractionAttemptRecord | null> {
    const result = client
      ? await client.query<AttemptRow>(`${selectAttempt} where provider_job_id = $1 or right(provider_job_id, length($1)) = $1 order by (provider_job_id = $1) desc limit 1`, [providerJobId])
      : await query<AttemptRow>(`${selectAttempt} where provider_job_id = $1 or right(provider_job_id, length($1)) = $1 order by (provider_job_id = $1) desc limit 1`, [providerJobId])
    return result.rows[0] ? toAttempt(result.rows[0]) : null
  },

  async listForDocument(k1DocumentId: string, client?: pg.PoolClient): Promise<K1ExtractionAttemptRecord[]> {
    const result = client
      ? await client.query<AttemptRow>(`${selectAttempt} where k1_document_id = $1 order by attempt_number`, [k1DocumentId])
      : await query<AttemptRow>(`${selectAttempt} where k1_document_id = $1 order by attempt_number`, [k1DocumentId])
    return result.rows.map(toAttempt)
  },

  async createOrGet(args: {
    k1DocumentId: string
    requestedAttemptNumber: number
    provider: K1ExtractionProvider
    mappingSchemaVersion: string
    projectArn?: string | null
    projectStage?: string | null
    blueprintArn?: string | null
    blueprintVersion?: string | null
    clientToken?: string
  }, client?: pg.PoolClient): Promise<K1ExtractionAttemptRecord> {
    const execute = async (tx: pg.PoolClient): Promise<K1ExtractionAttemptRecord> => {
      const document = await tx.query<{ id: string }>('select id from k1_documents where id = $1 for update', [args.k1DocumentId])
      if (!document.rows[0]) throw Object.assign(new Error('K1_DOCUMENT_NOT_FOUND'), { code: 'K1_DOCUMENT_NOT_FOUND' })
      const existing = await tx.query<AttemptRow>(
        `${selectAttempt} where k1_document_id = $1 and attempt_number = $2`,
        [args.k1DocumentId, args.requestedAttemptNumber],
      )
      if (existing.rows[0]) return toAttempt(existing.rows[0])
      const maximum = await tx.query<{ maximum: number | null }>(
        'select max(attempt_number)::int as maximum from k1_extraction_attempts where k1_document_id = $1',
        [args.k1DocumentId],
      )
      const expectedNext = (maximum.rows[0]?.maximum ?? 0) + 1
      if (args.requestedAttemptNumber !== expectedNext) {
        throw Object.assign(new Error('STALE_EXTRACTION_ATTEMPT_NUMBER'), {
          code: 'STALE_EXTRACTION_ATTEMPT_NUMBER',
          expectedAttemptNumber: expectedNext,
        })
      }
      const id = randomUUID()
      const clientToken = args.clientToken ?? createK1ExtractionClientToken(
        args.k1DocumentId,
        args.requestedAttemptNumber,
        args.mappingSchemaVersion,
      )
      const inserted = await tx.query<AttemptRow>(
        `insert into k1_extraction_attempts
           (id, k1_document_id, attempt_number, provider, client_token,
            project_arn, project_stage, blueprint_arn, blueprint_version,
            mapping_schema_version, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CREATED')
         returning *`,
        [
          id, args.k1DocumentId, args.requestedAttemptNumber, args.provider, clientToken,
          args.projectArn ?? null, args.projectStage ?? null, args.blueprintArn ?? null,
          args.blueprintVersion ?? null, args.mappingSchemaVersion,
        ],
      )
      return toAttempt(inserted.rows[0])
    }
    return client ? execute(client) : withTransaction(execute)
  },

  async markSubmitted(args: {
    attemptId: string
    providerJobId: string
    inputS3Uri: string
    outputS3Prefix: string
  }, client?: pg.PoolClient): Promise<K1ExtractionAttemptRecord> {
    const execute = async (tx: pg.PoolClient): Promise<K1ExtractionAttemptRecord> => {
      const current = await getById(args.attemptId, tx, true)
      if (!current) throw Object.assign(new Error('EXTRACTION_ATTEMPT_NOT_FOUND'), { code: 'EXTRACTION_ATTEMPT_NOT_FOUND' })
      if (current.status === 'SUBMITTED' || current.status === 'IN_PROGRESS' || current.status === 'SUCCEEDED') {
        if (current.providerJobId !== args.providerJobId) throw Object.assign(new Error('EXTRACTION_JOB_ID_CONFLICT'), { code: 'EXTRACTION_JOB_ID_CONFLICT' })
        return current
      }
      if (current.status !== 'CREATED') throw Object.assign(new Error('INVALID_EXTRACTION_ATTEMPT_STATE'), { code: 'INVALID_EXTRACTION_ATTEMPT_STATE' })
      const updated = await tx.query<AttemptRow>(
        `update k1_extraction_attempts
            set provider_job_id = $2, input_s3_uri = $3, output_s3_prefix = $4,
                status = 'SUBMITTED', started_at = coalesce(started_at, now()), updated_at = now()
          where id = $1 returning *`,
        [args.attemptId, args.providerJobId, args.inputS3Uri, args.outputS3Prefix],
      )
      return toAttempt(updated.rows[0])
    }
    return client ? execute(client) : withTransaction(execute)
  },

  async markInProgress(attemptId: string, client?: pg.PoolClient): Promise<K1ExtractionAttemptRecord> {
    const execute = async (tx: pg.PoolClient): Promise<K1ExtractionAttemptRecord> => {
      const current = await getById(attemptId, tx, true)
      if (!current) throw Object.assign(new Error('EXTRACTION_ATTEMPT_NOT_FOUND'), { code: 'EXTRACTION_ATTEMPT_NOT_FOUND' })
      if (current.status === 'IN_PROGRESS' || current.status === 'SUCCEEDED') return current
      if (current.status !== 'SUBMITTED') throw Object.assign(new Error('INVALID_EXTRACTION_ATTEMPT_STATE'), { code: 'INVALID_EXTRACTION_ATTEMPT_STATE' })
      const updated = await tx.query<AttemptRow>(
        `update k1_extraction_attempts set status = 'IN_PROGRESS', updated_at = now() where id = $1 returning *`,
        [attemptId],
      )
      return toAttempt(updated.rows[0])
    }
    return client ? execute(client) : withTransaction(execute)
  },

  async markFailed(args: { attemptId: string; errorCode: string; errorSummary: string }, client?: pg.PoolClient): Promise<K1ExtractionAttemptRecord> {
    const execute = async (tx: pg.PoolClient): Promise<K1ExtractionAttemptRecord> => {
      const current = await getById(args.attemptId, tx, true)
      if (!current) throw Object.assign(new Error('EXTRACTION_ATTEMPT_NOT_FOUND'), { code: 'EXTRACTION_ATTEMPT_NOT_FOUND' })
      if (current.status === 'FAILED') return current
      if (current.status === 'SUCCEEDED' || current.status === 'SUPERSEDED') {
        throw Object.assign(new Error('TERMINAL_EXTRACTION_ATTEMPT_IMMUTABLE'), { code: 'TERMINAL_EXTRACTION_ATTEMPT_IMMUTABLE' })
      }
      const updated = await tx.query<AttemptRow>(
        `update k1_extraction_attempts
            set status = 'FAILED', error_code = $2, error_summary = $3,
                completed_at = now(), updated_at = now()
          where id = $1 returning *`,
        [args.attemptId, args.errorCode, args.errorSummary],
      )
      return toAttempt(updated.rows[0])
    }
    return client ? execute(client) : withTransaction(execute)
  },

  async markSuperseded(attemptId: string, client?: pg.PoolClient): Promise<K1ExtractionAttemptRecord> {
    const execute = async (tx: pg.PoolClient): Promise<K1ExtractionAttemptRecord> => {
      const current = await getById(attemptId, tx, true)
      if (!current) throw Object.assign(new Error('EXTRACTION_ATTEMPT_NOT_FOUND'), { code: 'EXTRACTION_ATTEMPT_NOT_FOUND' })
      if (current.status === 'SUPERSEDED') return current
      if (current.status !== 'CREATED') {
        throw Object.assign(new Error('TERMINAL_EXTRACTION_ATTEMPT_IMMUTABLE'), { code: 'TERMINAL_EXTRACTION_ATTEMPT_IMMUTABLE' })
      }
      const updated = await tx.query<AttemptRow>(
        `update k1_extraction_attempts
            set status = 'SUPERSEDED', completed_at = now(), updated_at = now()
          where id = $1 returning *`,
        [attemptId],
      )
      return toAttempt(updated.rows[0])
    }
    return client ? execute(client) : withTransaction(execute)
  },

  async promoteSucceeded(client: pg.PoolClient, args: {
    attemptId: string
    rawResultKey: string
    rawResultSha256: string
    customOutputStatus: string
    nextDocumentStatus: 'NEEDS_REVIEW' | 'READY_FOR_APPROVAL'
  }): Promise<K1ExtractionAttemptRecord> {
    const current = await getById(args.attemptId, client, true)
    if (!current) throw Object.assign(new Error('EXTRACTION_ATTEMPT_NOT_FOUND'), { code: 'EXTRACTION_ATTEMPT_NOT_FOUND' })
    if (current.status === 'SUCCEEDED') {
      if (current.rawResultSha256 !== args.rawResultSha256) {
        throw Object.assign(new Error('RAW_RESULT_INTEGRITY_CONFLICT'), { code: 'RAW_RESULT_INTEGRITY_CONFLICT' })
      }
      return current
    }
    if (current.status === 'FAILED' || current.status === 'SUPERSEDED') {
      throw Object.assign(new Error('TERMINAL_EXTRACTION_ATTEMPT_IMMUTABLE'), { code: 'TERMINAL_EXTRACTION_ATTEMPT_IMMUTABLE' })
    }
    const updated = await client.query<AttemptRow>(
      `update k1_extraction_attempts
          set status = 'SUCCEEDED', raw_result_key = $2, raw_result_sha256 = $3,
              custom_output_status = $4, completed_at = now(), updated_at = now()
        where id = $1 returning *`,
      [args.attemptId, args.rawResultKey, args.rawResultSha256, args.customOutputStatus],
    )
    await client.query(
      `update k1_documents
          set active_extraction_attempt_id = $2,
              extraction_schema_version = $3,
              processing_status = $4,
              parse_error_code = null,
              parse_error_message = null,
              version = version + 1,
              updated_at = now()
        where id = $1`,
      [current.k1DocumentId, current.id, current.mappingSchemaVersion, args.nextDocumentStatus],
    )
    return toAttempt(updated.rows[0])
  },

  async listStale(cutoff: Date, limit = 100): Promise<K1ExtractionAttemptRecord[]> {
    const result = await query<AttemptRow>(
      `${selectAttempt}
        where status in ('SUBMITTED', 'IN_PROGRESS')
          and coalesce(last_reconciled_at, started_at, created_at) <= $1
        order by coalesce(last_reconciled_at, started_at, created_at)
        limit $2`,
      [cutoff, Math.max(1, Math.min(limit, 500))],
    )
    return result.rows.map(toAttempt)
  },

  async touchReconciled(attemptId: string): Promise<void> {
    await query(
      `update k1_extraction_attempts set last_reconciled_at = now(), updated_at = now()
        where id = $1 and status in ('SUBMITTED', 'IN_PROGRESS')`,
      [attemptId],
    )
  },
}
