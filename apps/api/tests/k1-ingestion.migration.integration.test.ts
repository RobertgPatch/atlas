import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pool } from '../src/infra/db/client.js'
import { runMigrations } from '../src/infra/db/migrate.js'

const migrationUrl = new URL(
  '../src/infra/db/migrations/030_aws_k1_pdf_ingestion.sql',
  import.meta.url,
)
const retentionMigrationUrl = new URL(
  '../src/infra/db/migrations/031_k1_applied_document_retention.sql',
  import.meta.url,
)

const expectedTables = [
  'k1_ingestion_batches',
  'k1_ingestion_items',
  'k1_extraction_attempts',
  'k1_match_candidates',
  'k1_document_applications',
  'k1_application_field_decisions',
  'k1_tracker_official_value_revisions',
] as const

describe('AWS K-1 ingestion migration contract', () => {
  it('is additive, idempotent, and retains the legacy tracker snapshot', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    for (const table of expectedTables) {
      expect(sql).toMatch(new RegExp(`create table if not exists\\s+${table}`, 'i'))
    }
    expect(sql).not.toMatch(/\b(?:truncate|drop\s+table|delete\s+from)\b/i)
    expect(sql).toMatch(/k1_tracker_active_official_value_idx/i)
    expect(sql).toMatch(/k1_extraction_attempts_document_number_key/i)
    expect(sql).toMatch(/alter table if exists k1_field_values/i)
  })

  it('enforces retention for applied K-1 evidence', async () => {
    const sql = await readFile(retentionMigrationUrl, 'utf8')

    expect(sql).toMatch(/before delete on k1_documents/i)
    expect(sql).toMatch(/old\.applied_at is not null/i)
    expect(sql).toMatch(/APPLIED_K1_DOCUMENT_RETAINED/i)
  })
})

const durable = pool ? describe : describe.skip

durable('AWS K-1 ingestion migration persistence', () => {
  const schemaName = `k1_migration_${randomUUID().replaceAll('-', '')}`
  let migrationSql = ''

  beforeAll(async () => {
    migrationSql = await readFile(migrationUrl, 'utf8')
    await runMigrations()
  })

  afterAll(async () => {
    await pool!.query(`drop schema if exists "${schemaName}" cascade`)
  })

  it('creates the complete schema on a clean migrated database', async () => {
    const tables = await pool!.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = current_schema()
          and table_name = any($1::text[])`,
      [expectedTables],
    )

    expect(tables.rows.map((row) => row.table_name).sort()).toEqual(
      [...expectedTables].sort(),
    )

    const requiredColumns = await pool!.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = current_schema()
          and (table_name, column_name) in (
            ('documents', 'sha256'),
            ('documents', 'page_count'),
            ('k1_documents', 'active_extraction_attempt_id'),
            ('k1_documents', 'match_status'),
            ('k1_field_values', 'occurrence_id'),
            ('k1_field_values', 'source_locations'),
            ('k1_issues', 'issue_code')
          )`,
    )
    expect(requiredColumns.rows).toHaveLength(7)
  })

  it('upgrades legacy rows without inventing attempts or changing calculations', async () => {
    const client = await pool!.connect()
    try {
      await client.query('begin')
      await client.query(`create schema "${schemaName}"`)
      await client.query(`set local search_path to "${schemaName}", public`)
      await client.query(`
        create table users (id uuid primary key);
        create table entities (id uuid primary key);
        create table partnerships (
          id uuid primary key,
          entity_id uuid not null references entities(id)
        );
        create table documents (
          id uuid primary key,
          document_type text not null default 'K1',
          file_name text,
          storage_path text not null,
          mime_type text,
          uploaded_by uuid references users(id),
          uploaded_at timestamptz not null default now()
        );
        create table k1_documents (
          id uuid primary key,
          document_id uuid not null references documents(id),
          partnership_id uuid references partnerships(id),
          tax_year int,
          processing_status text not null default 'UPLOADED',
          version int not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create table k1_field_values (
          id uuid primary key,
          k1_document_id uuid not null references k1_documents(id),
          field_name text not null,
          raw_value text,
          normalized_value text,
          confidence_score numeric(5,4),
          extraction_method text,
          review_status text not null default 'PENDING',
          reviewer_corrected_value text,
          page_number int,
          source_ref text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create table k1_issues (
          id uuid primary key,
          k1_document_id uuid not null references k1_documents(id),
          k1_field_value_id uuid references k1_field_values(id),
          issue_type text not null,
          severity text not null default 'MEDIUM',
          status text not null default 'OPEN',
          message text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create table k1_tracker_years (
          id uuid primary key,
          entity_id uuid not null references entities(id),
          partnership_id uuid not null references partnerships(id),
          tax_year int not null,
          revision int not null default 1,
          official_form_data jsonb not null default '{}'::jsonb
        );
        create table k1_tracker_value_revisions (
          id uuid primary key,
          tracker_year_id uuid not null references k1_tracker_years(id),
          field_key text not null,
          amount numeric(18,2),
          is_active boolean not null default true
        );
        create table k1_tracker_signoffs (
          id uuid primary key,
          tracker_year_id uuid not null references k1_tracker_years(id),
          year_revision int not null,
          signoff_type text not null,
          reason text,
          created_at timestamptz not null default now()
        );
        create table audit_events (id uuid primary key);
      `)

      const ids = Array.from({ length: 11 }, () => randomUUID())
      const [
        userId,
        entityId,
        partnershipId,
        documentId,
        k1DocumentId,
        trackerYearId,
        valueId,
        fieldValueId,
        issueId,
        signoffId,
      ] = ids
      await client.query('insert into users (id) values ($1)', [userId])
      await client.query('insert into entities (id) values ($1)', [entityId])
      await client.query('insert into partnerships (id, entity_id) values ($1, $2)', [partnershipId, entityId])
      await client.query(
        `insert into documents (id, file_name, storage_path, mime_type, uploaded_by)
         values ($1, 'legacy.pdf', 'pending/legacy.pdf', 'application/pdf', $2)`,
        [documentId, userId],
      )
      await client.query(
        `insert into k1_documents (id, document_id, partnership_id, tax_year)
         values ($1, $2, $3, 2024)`,
        [k1DocumentId, documentId, partnershipId],
      )
      await client.query(
        `insert into k1_field_values
           (id, k1_document_id, field_name, raw_value, normalized_value, review_status)
         values ($1, $2, 'box_1_ordinary_income', '1,234.56', '1234.56', 'APPROVED')`,
        [fieldValueId, k1DocumentId],
      )
      await client.query(
        `insert into k1_issues
           (id, k1_document_id, k1_field_value_id, issue_type, status, message)
         values ($1, $2, $3, 'LOW_CONFIDENCE', 'RESOLVED', 'legacy review issue')`,
        [issueId, k1DocumentId, fieldValueId],
      )
      await client.query(
        `insert into k1_tracker_years
           (id, entity_id, partnership_id, tax_year, revision, official_form_data)
         values ($1, $2, $3, 2024, 7, '{"part_i_a_ein":"12-3456789"}'::jsonb)`,
        [trackerYearId, entityId, partnershipId],
      )
      await client.query(
        `insert into k1_tracker_value_revisions (id, tracker_year_id, field_key, amount)
         values ($1, $2, 'box_1_ordinary_income', 1234.56)`,
        [valueId, trackerYearId],
      )
      await client.query(
        `insert into k1_tracker_signoffs
           (id, tracker_year_id, year_revision, signoff_type, reason)
         values ($1, $2, 7, 'REVIEWED', 'legacy sign-off')`,
        [signoffId, trackerYearId],
      )

      await client.query(migrationSql)
      await client.query(migrationSql)

      const result = await client.query<{
        active_extraction_attempt_id: string | null
        attempt_count: string
        amount: string
        field_value: string
        review_status: string
        issue_status: string
        official_ein: string
        revision: number
        signoff_type: string
      }>(
        `select kd.active_extraction_attempt_id,
                (select count(*) from k1_extraction_attempts ea where ea.k1_document_id = kd.id) as attempt_count,
                tvr.amount::text as amount,
                fv.normalized_value as field_value,
                fv.review_status,
                ki.status as issue_status,
                ty.official_form_data->>'part_i_a_ein' as official_ein,
                ty.revision,
                ks.signoff_type
           from k1_documents kd
           join k1_field_values fv on fv.k1_document_id = kd.id
           join k1_issues ki on ki.k1_field_value_id = fv.id
           join k1_tracker_years ty on ty.partnership_id = kd.partnership_id
           join k1_tracker_value_revisions tvr on tvr.tracker_year_id = ty.id
           join k1_tracker_signoffs ks on ks.tracker_year_id = ty.id
          where kd.id = $1`,
        [k1DocumentId],
      )
      expect(result.rows[0]).toEqual({
        active_extraction_attempt_id: null,
        attempt_count: '0',
        amount: '1234.56',
        field_value: '1234.56',
        review_status: 'APPROVED',
        issue_status: 'RESOLVED',
        official_ein: '12-3456789',
        revision: 7,
        signoff_type: 'REVIEWED',
      })

      await client.query('rollback')
    } finally {
      client.release()
    }
  })
})
