import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { runMigrationsWithPool, type MigrationFileSource } from '../../src/infra/db/migrate.js'
import { assertLiquidityDatabaseTestEnvironment } from './testHelpers.js'

const migrations = new URL('../../src/infra/db/migrations/', import.meta.url)
const featureFile = '051_statement_adapter_normalization.sql'
const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
type Db = pg.Pool | pg.PoolClient
type Source = { id: string; entityId: string; actorId: string; sha256: string }

assertLiquidityDatabaseTestEnvironment()

async function migrationSource(includeFeature: boolean): Promise<MigrationFileSource> {
  const names = (await readdir(migrations)).filter(name => /^\d+.*\.sql$/.test(name) && name < '051').sort()
  if (includeFeature) names.push(featureFile)
  return {
    listMigrationFiles: async () => names,
    readMigrationFile: name => readFile(new URL(name, migrations), 'utf8'),
  }
}

const field = (value: string | null) => ({ value, raw: value === null ? [] : [value], origin: value === null ? 'UNAVAILABLE' : 'IMPORTED', availability: value === null ? 'UNAVAILABLE' : 'COMPLETE', evidence: [], derivation: null, reason: null })
function legacyDraft(sha256: string) {
  const position = Object.fromEntries(['description', 'symbol', 'cusip', 'isin', 'brokerSecurityId', 'assetType', 'sourceAssetType', 'currency', 'quantity', 'price', 'marketValue', 'costBasis', 'unrealizedGainLoss', 'unrealizedGainLossRatio', 'dayChange', 'dayChangeRatio', 'accruedInterest', 'quoteMultiplier'].map(name => [name, field(null)]))
  return {
    schemaVersion: '2.0.0', adapter: { id: 'positions_v1', version: '1.3.0' }, sourceHash: sha256,
    recordCounts: { total: 1, positions: 1, controls: 0, metadata: 0, headers: 0, blanks: 0, unsupported: 0 },
    accounts: [{
      occurrenceId: 'account-1', identifierFingerprints: [], displayName: field('Synthetic legacy account'), accountMask: field('0001'),
      currency: field('USD'), asOfDate: field('2026-09-01'), asOfAt: field(null), sourceZone: field(null), asOfPrecision: 'DATE', reportedTotal: field(null),
      positions: [{ ...position, occurrenceId: 'position-1', sourceRecord: 1, description: field('Synthetic preserved holding'), symbol: field('DEMO'),
        assetType: field('equity'), currency: field('USD'), quantity: field('10'), price: field('123.45678901'), marketValue: field('1234.56789012'), costBasis: field('1000.00000001'), unrealizedGainLoss: field('234.56789011') }],
    }], issues: [],
  }
}

async function insertSource(db: Db, options: { entityId?: string; sha256?: string; status?: string; kind?: string; retained?: boolean } = {}): Promise<Source> {
  const source = { id: randomUUID(), entityId: options.entityId ?? randomUUID(), actorId: randomUUID(), sha256: options.sha256 ?? digest(randomUUID()) }
  if (!options.entityId) await db.query("insert into entities(id,name,entity_type,status) values($1,'Synthetic migration fixture','TRUST','ACTIVE')", [source.entityId])
  const columns = ['id', 'entity_id', 'custodian', 'uploaded_by_user_id', 'file_name', 'sha256', 'size_bytes', 'content_type', 'storage_key', 'storage_version', 'capability_token_hash', 'capability_expires_at', 'status']
  const values: unknown[] = [source.id, source.entityId, 'Synthetic Broker', source.actorId, 'synthetic-statement.csv', source.sha256, 128, options.kind === 'XLSX' ? xlsxType : 'text/csv', `synthetic/${source.id}/original.${options.kind === 'XLSX' ? 'xlsx' : 'csv'}`, 'synthetic-object-v1', digest('synthetic-capability'), '2026-12-01T00:00:00Z', options.status ?? 'NEEDS_REVIEW']
  if (options.kind !== undefined) { columns.push('file_kind'); values.push(options.kind) }
  if (options.retained !== undefined) { columns.push('source_identity_retained'); values.push(options.retained) }
  await db.query(`insert into liquidity_csv_imports(${columns.join(',')}) values(${values.map((_, index) => `$${index + 1}`).join(',')})`, values)
  return source
}

async function insertRun(db: Db, source: Source, attempt = 1, status = 'SUCCEEDED') {
  const id = randomUUID(), draft = legacyDraft(source.sha256)
  await db.query(`insert into liquidity_csv_parse_runs(id,import_id,attempt_no,status,source_version,source_hash,canonical_hash,canonical_draft,reconciliation)
    values($1,$2,$3,$4,'synthetic-object-v1',$5,$6,$7,'{}')`, [id, source.id, attempt, status, source.sha256, digest(JSON.stringify(draft)), draft])
  return id
}

async function insertReview(db: Db, source: Source, runId: string, revision: number, excluded?: unknown[]) {
  const id = randomUUID(), draft = legacyDraft(source.sha256)
  const extraColumn = excluded === undefined ? '' : ',excluded_accounts'
  const extraValue = excluded === undefined ? '' : ',$8'
  await db.query(`insert into liquidity_csv_reviews(id,import_id,run_id,revision,actor_id,changes,canonical_draft,canonical_hash,bindings,issues,reconciliation${extraColumn})
    values($1,$2,$3,$4,$5,'[]',$6,$7,'[]','[]','{}'${extraValue})`, [id, source.id, runId, revision, source.actorId, draft, digest(JSON.stringify(draft)), ...(excluded === undefined ? [] : [JSON.stringify(excluded)])])
  return id
}

async function insertApplication(db: Db, source: Source, runId: string, status = 'APPLIED', excluded?: unknown[]) {
  const id = randomUUID()
  await db.query(`insert into liquidity_csv_applications(id,import_id,run_id,review_revision,expected_version,summary_hash,canonical_hash,bindings,account_states,preview,expires_at,status,idempotency_key,payload_hash,snapshot_ids,actor_id,applied_at${excluded === undefined ? '' : ',excluded_accounts'})
    values($1,$2,$3,7,4,$4,$5,'[]','[]','{}','2026-12-01',$6,$7,$8,'[]',$9,${status === 'APPLIED' ? "'2026-09-01'" : 'null'}${excluded === undefined ? '' : ',$10'})`,
  [id, source.id, runId, digest('synthetic-summary'), digest(JSON.stringify(legacyDraft(source.sha256))), status, randomUUID(), digest('synthetic-payload'), source.actorId, ...(excluded === undefined ? [] : [JSON.stringify(excluded)])])
  return id
}

async function insertSnapshot(db: Db, source: Source, runId: string, applicationId: string, kind: 'CSV' | 'STATEMENT' = 'CSV') {
  const accountId = randomUUID(), snapshotId = randomUUID(), positionId = randomUUID(), valuationId = randomUUID()
  await db.query(`insert into liquidity_source_accounts(id,entity_id,custodian,name,currency,origin,active_source) values($1,$2,'Synthetic Broker','Synthetic account','USD',$3,$3)`, [accountId, source.entityId, kind])
  await db.query(`insert into liquidity_holdings_snapshots(id,source_account_id,entity_id,source_kind,import_id,run_id,application_id,as_of_date,effective_key,revision,position_total,reconciliation,coverage)
    values($1,$2,$3,$4,$5,$6,$7,'2026-09-01','2026-09-01',1,'1234.56789012','NOT_PROVIDED','{}')`, [snapshotId, accountId, source.entityId, kind, source.id, runId, applicationId])
  await db.query(`insert into liquidity_source_positions(id,snapshot_id,source_account_id,source_occurrence,source_record,quantity,price,market_value,cost_basis,unrealized_gain_loss,currency,canonical)
    values($1,$2,$3,'position-1',1,10,'123.45678901','1234.56789012','1000.00000001','234.56789011','USD',$4)`, [positionId, snapshotId, accountId, legacyDraft(source.sha256).accounts[0]!.positions[0]])
  await db.query(`insert into liquidity_source_valuations(id,source_position_id,source_snapshot_id,source_account_id,price_at,price,market_value,provider,mode)
    values($1,$2,$3,$4,'2026-09-01','123.45678901','1234.56789012','synthetic-source','CSV_FALLBACK')`, [valuationId, positionId, snapshotId, accountId])
  await db.query('update liquidity_source_accounts set current_snapshot_id=$2 where id=$1', [accountId, snapshotId])
  return { accountId, snapshotId, positionId, valuationId }
}

const immutableTables = ['liquidity_csv_parse_runs', 'liquidity_csv_records', 'liquidity_csv_reviews', 'liquidity_csv_applications', 'liquidity_holdings_snapshots', 'liquidity_source_positions', 'liquidity_source_valuations'] as const
async function captureLegacy(db: Db) {
  const captured: Record<string, Record<string, unknown>[]> = {}
  for (const table of ['liquidity_csv_imports', 'liquidity_source_accounts', ...immutableTables]) {
    captured[table] = (await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows.map(row => row.row)
  }
  return captured
}

describe('032 migration deliverable', () => {
  it('has a concrete migration to test, rather than silently accepting the 031 schema', async () => {
    await expect(readFile(new URL(featureFile, migrations), 'utf8'), 'T011 must add migration 051 before these migration contracts can pass').resolves.toMatch(/\S/)
  })
})

describe.skipIf(!pool).sequential('032 fresh and upgrade migration persistence', () => {
  let admin: pg.Client | undefined
  const databases: { name: string; db: pg.Pool }[] = []
  let fresh: pg.Pool, upgrade: pg.Pool
  let published: Source, stale: Source, previewOnly: Source
  let publishedRun: string, publishedReview: string, applicationId: string, staleRun: string, staleReview: string
  let history: Awaited<ReturnType<typeof insertSnapshot>>
  let before: Awaited<ReturnType<typeof captureLegacy>>
  let freshMigration: Promise<void> | undefined, upgradeMigration: Promise<void> | undefined

  async function createDatabase() {
    const name = `atlas_statement_migration_${randomUUID().replaceAll('-', '')}`
    if (!/^atlas_statement_migration_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe synthetic database name')
    await admin!.query(`create database "${name}"`)
    const url = new URL(process.env.ATLAS_TEST_DATABASE_URL!)
    url.pathname = `/${name}`
    const db = new pg.Pool({ connectionString: url.toString(), max: 4, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 })
    databases.push({ name, db })
    await runMigrationsWithPool(db, await migrationSource(false))
    return db
  }
  async function migratedFresh() {
    freshMigration ??= migrationSource(true).then(source => runMigrationsWithPool(fresh, source))
    await freshMigration
    return fresh
  }
  async function migratedUpgrade() {
    upgradeMigration ??= migrationSource(true).then(source => runMigrationsWithPool(upgrade, source))
    await upgradeMigration
    return upgrade
  }

  beforeAll(async () => {
    // Always enforce loopback, even if this suite was invoked outside mandatory mode.
    assertLiquidityDatabaseTestEnvironment({ ...process.env, ATLAS_REQUIRE_LIQUIDITY_DB_TESTS: 'true' }, Boolean(pool))
    admin = new pg.Client({ connectionString: process.env.ATLAS_TEST_DATABASE_URL, connectionTimeoutMillis: 5_000 })
    await admin.connect()
    fresh = await createDatabase()
    upgrade = await createDatabase()
    published = await insertSource(upgrade, { status: 'CANCELLED' })
    publishedRun = await insertRun(upgrade, published)
    publishedReview = await insertReview(upgrade, published, publishedRun, 7)
    applicationId = await insertApplication(upgrade, published, publishedRun)
    history = await insertSnapshot(upgrade, published, publishedRun, applicationId)
    await upgrade.query('update liquidity_csv_imports set active_run_id=$2,review_revision=7 where id=$1', [published.id, publishedRun])
    await upgrade.query("insert into liquidity_csv_records(run_id,ordinal,line_start,line_end,role,raw_tokens) values($1,1,5,5,'POSITION','[\"DEMO\",\"1234.56789012\"]')", [publishedRun])
    stale = await insertSource(upgrade)
    const oldRun = await insertRun(upgrade, stale)
    staleReview = await insertReview(upgrade, stale, oldRun, 9)
    staleRun = await insertRun(upgrade, stale, 2, 'QUEUED')
    await upgrade.query('update liquidity_csv_imports set active_run_id=$2,review_revision=9 where id=$1', [stale.id, staleRun])
    previewOnly = await insertSource(upgrade)
    const previewRun = await insertRun(upgrade, previewOnly)
    await insertReview(upgrade, previewOnly, previewRun, 7)
    await insertApplication(upgrade, previewOnly, previewRun, 'PREVIEW')
    before = await captureLegacy(upgrade)
  }, 60_000)

  afterAll(async () => {
    try {
      for (const { name, db } of databases) {
        await db.end()
        // Drop only a disposable database this test created, never its configured parent.
        if (!/^atlas_statement_migration_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe synthetic database cleanup')
        await admin!.query(`drop database "${name}"`)
      }
    } finally { await admin?.end() }
  }, 30_000)

  it('constructs actual pre-032 synthetic state with exact approved values and a stale review pointer case', async () => {
    expect((await upgrade.query('select market_value::text,cost_basis::text from liquidity_source_positions where id=$1', [history.positionId])).rows[0])
      .toEqual({ market_value: '1234.56789012', cost_basis: '1000.00000001' })
    expect((await upgrade.query('select active_run_id,review_revision from liquidity_csv_imports where id=$1', [stale.id])).rows[0])
      .toEqual({ active_run_id: staleRun, review_revision: 9 })
    expect((await upgrade.query("select filename from schema_migrations where filename like '051%'")).rows).toEqual([])
  })

  it('migrates an empty 031 database and retains omitted-kind CSV compatibility while admitting XLSX and NEEDS_ADAPTER', async () => {
    const db = await migratedFresh(), csv = await insertSource(db), xlsx = await insertSource(db, { kind: 'XLSX', status: 'NEEDS_ADAPTER' })
    expect((await db.query('select file_kind,source_identity_retained,active_review_id from liquidity_csv_imports where id=$1', [csv.id])).rows[0])
      .toEqual({ file_kind: 'CSV', source_identity_retained: false, active_review_id: null })
    expect((await db.query('select file_kind,content_type,status from liquidity_csv_imports where id=$1', [xlsx.id])).rows[0])
      .toEqual({ file_kind: 'XLSX', content_type: xlsxType, status: 'NEEDS_ADAPTER' })
    await expect(insertSource(db, { kind: 'XLS' })).rejects.toMatchObject({ code: '23514' })
  })

  it('accepts genuine XLSX locations and added roles, while rejecting fake CSV lines or missing/contradictory location metadata', async () => {
    const db = await migratedFresh(), source = await insertSource(db, { kind: 'XLSX' }), run = await insertRun(db, source, 1, 'PARSING')
    const location = { kind: 'XLSX', sheetId: 'sheet-1', sheetName: 'Synthetic Holdings', row: 12, column: 1, address: 'A12', header: 'Symbol' }
    const insert = (ordinal: number, role: string, kind: string, value: unknown, start: number | null = null, end: number | null = null) => db.query(
      'insert into liquidity_csv_records(run_id,ordinal,line_start,line_end,role,raw_tokens,source_kind,source_location) values($1,$2,$3,$4,$5,\'[]\',$6,$7)', [run, ordinal, start, end, role, kind, value])
    for (const [index, role] of ['POSITION', 'SUBTOTAL', 'NOTE', 'EXCLUDED_SECTION'].entries()) await insert(index + 1, role, 'XLSX', location)
    await expect(insert(5, 'POSITION', 'XLSX', null)).rejects.toMatchObject({ code: expect.stringMatching(/^235(?:02|14)$/) })
    await expect(insert(6, 'POSITION', 'XLSX', location, 12, 12)).rejects.toMatchObject({ code: '23514' })
    await expect(insert(7, 'POSITION', 'CSV', location, 1, 1)).rejects.toMatchObject({ code: '23514' })
    await expect(insert(8, 'POSITION', 'XLSX', { ...location, row: 0 })).rejects.toMatchObject({ code: '23514' })
    const csv = await insertSource(db), csvRun = await insertRun(db, csv, 1, 'PARSING')
    await db.query("insert into liquidity_csv_records(run_id,ordinal,line_start,line_end,role,raw_tokens) values($1,1,2,3,'POSITION','[]')", [csvRun])
    expect((await db.query('select source_kind,line_start,line_end from liquidity_csv_records where run_id=$1', [csvRun])).rows[0])
      .toEqual({ source_kind: 'CSV', line_start: 2, line_end: 3 })
  })

  it('keeps a record foreign key and immutable recipe metadata after a run succeeds', async () => {
    const db = await migratedFresh(), source = await insertSource(db), run = await insertRun(db, source, 1, 'PARSING')
    const recipe = { reader: { id: 'csv', version: '1.0.0' }, schemaVersion: '3.0.0', normalizationVersion: '1.0.0' }, recipeHash = digest(JSON.stringify(recipe))
    await db.query("update liquidity_csv_parse_runs set recipe=$2,recipe_hash=$3,status='SUCCEEDED' where id=$1", [run, recipe, recipeHash])
    await expect(db.query("update liquidity_csv_parse_runs set recipe='{}' where id=$1", [run])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
    await expect(db.query('update liquidity_csv_parse_runs set recipe_hash=$2 where id=$1', [run, digest('changed')])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
    await expect(db.query('delete from liquidity_csv_parse_runs where id=$1', [run])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
    await db.query("insert into liquidity_csv_account_occurrences(run_id,occurrence_id,canonical) values($1,'account-1','{}')", [run])
    await expect(db.query("insert into liquidity_csv_positions(run_id,account_occurrence,occurrence_id,source_record,canonical) values($1,'account-1','missing-record',99,'{}')", [run])).rejects.toMatchObject({ code: '23503' })
  })

  it('scopes the active review to both import and run, and preserves unique increasing import revisions after reprocessing', async () => {
    const db = await migratedFresh(), source = await insertSource(db), first = await insertRun(db, source), review = await insertReview(db, source, first, 7)
    await db.query('update liquidity_csv_imports set active_run_id=$2,active_review_id=$3,review_revision=7 where id=$1', [source.id, first, review])
    const second = await insertRun(db, source, 2)
    await expect(db.query('update liquidity_csv_imports set active_run_id=$2 where id=$1', [source.id, second])).rejects.toMatchObject({ code: '23503' })
    await db.query('update liquidity_csv_imports set active_run_id=$2,active_review_id=null where id=$1', [source.id, second])
    expect((await db.query('select review_revision from liquidity_csv_imports where id=$1', [source.id])).rows[0].review_revision).toBe(7)
    await expect(db.query('update liquidity_csv_imports set active_review_id=$2 where id=$1', [source.id, review])).rejects.toMatchObject({ code: '23503' })
    await expect(insertReview(db, source, second, 7)).rejects.toMatchObject({ code: '23505' })
    const next = await insertReview(db, source, second, 8)
    await db.query('update liquidity_csv_imports set active_review_id=$2,review_revision=8 where id=$1', [source.id, next])
    const other = await insertSource(db), otherRun = await insertRun(db, other), otherReview = await insertReview(db, other, otherRun, 8)
    await expect(db.query('update liquidity_csv_imports set active_review_id=$2 where id=$1', [source.id, otherReview])).rejects.toMatchObject({ code: '23503' })
  })

  it('persists exclusions separately from bindings and preserves immutable reviewed decisions', async () => {
    const db = await migratedFresh(), source = await insertSource(db), run = await insertRun(db, source)
    const excluded = [{ occurrenceId: 'account-2', reason: 'Synthetic account excluded from this approval' }]
    const review = await insertReview(db, source, run, 7, excluded), application = await insertApplication(db, source, run, 'PREVIEW', excluded)
    expect((await db.query('select excluded_accounts,bindings from liquidity_csv_reviews where id=$1', [review])).rows[0]).toEqual({ excluded_accounts: excluded, bindings: [] })
    expect((await db.query('select excluded_accounts from liquidity_csv_applications where id=$1', [application])).rows[0].excluded_accounts).toEqual(excluded)
    await expect(db.query("update liquidity_csv_reviews set excluded_accounts='[]' where id=$1", [review])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
  })

  it('admits neutral STATEMENT source accounts/snapshots without rewriting historical CSV labels or restoring Plaid', async () => {
    const db = await migratedFresh(), source = await insertSource(db, { kind: 'XLSX' }), run = await insertRun(db, source), application = await insertApplication(db, source, run)
    const inserted = await insertSnapshot(db, source, run, application, 'STATEMENT')
    expect((await db.query('select origin,active_source from liquidity_source_accounts where id=$1', [inserted.accountId])).rows[0]).toEqual({ origin: 'STATEMENT', active_source: 'STATEMENT' })
    expect((await db.query('select source_kind from liquidity_holdings_snapshots where id=$1', [inserted.snapshotId])).rows[0].source_kind).toBe('STATEMENT')
    expect((await db.query("select tablename from pg_tables where schemaname='public' and tablename like 'plaid_%'")).rows).toEqual([])
  })

  it('protects validated file kind and content type once the original is immutable', async () => {
    const db = await migratedFresh(), source = await insertSource(db, { kind: 'XLSX' })
    await expect(db.query("update liquidity_csv_imports set file_kind='CSV' where id=$1", [source.id])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
    await expect(db.query("update liquidity_csv_imports set content_type='text/csv' where id=$1", [source.id])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
  })

  it('upgrades approved 031 state without changing original keys, amounts, payloads, hashes, IDs or history pointers', async () => {
    const db = await migratedUpgrade(), after = await captureLegacy(db)
    for (const [table, rows] of Object.entries(before)) {
      expect(after[table]).toHaveLength(rows.length)
      for (const row of rows) {
        const actual = after[table]!.find(candidate => row.id ? candidate.id === row.id : candidate.run_id === row.run_id && candidate.ordinal === row.ordinal)
        expect(actual).toBeDefined()
        for (const [key, value] of Object.entries(row)) expect(actual![key], `${table}.${key}`).toEqual(value)
      }
    }
    expect((await db.query('select market_value::text,cost_basis::text,unrealized_gain_loss::text from liquidity_source_positions where id=$1', [history.positionId])).rows[0])
      .toEqual({ market_value: '1234.56789012', cost_basis: '1000.00000001', unrealized_gain_loss: '234.56789011' })
    expect((await db.query('select mode from liquidity_source_valuations where id=$1', [history.valuationId])).rows[0].mode).toBe('CSV_FALLBACK')
    await runMigrationsWithPool(db, await migrationSource(true))
    expect(await captureLegacy(db)).toEqual(after)
  })

  it('backfills active reviews only from the current run/revision and retains only sources with completed applications', async () => {
    const db = await migratedUpgrade()
    expect((await db.query('select file_kind,active_review_id,review_revision,source_identity_retained from liquidity_csv_imports where id=$1', [published.id])).rows[0])
      .toEqual({ file_kind: 'CSV', active_review_id: publishedReview, review_revision: 7, source_identity_retained: true })
    expect((await db.query('select active_review_id,review_revision,source_identity_retained from liquidity_csv_imports where id=$1', [stale.id])).rows[0])
      .toEqual({ active_review_id: null, review_revision: 9, source_identity_retained: false })
    expect((await db.query('select source_identity_retained from liquidity_csv_imports where id=$1', [previewOnly.id])).rows[0].source_identity_retained).toBe(false)
    expect((await db.query('select id from liquidity_csv_reviews where id=$1', [staleReview])).rows).toHaveLength(1)
  })

  it('keeps retained-source identity monotonic and unique even when the correction status is cancelled', async () => {
    const db = await migratedUpgrade()
    await expect(insertSource(db, { entityId: published.entityId, sha256: published.sha256 })).rejects.toMatchObject({ code: '23505' })
    await expect(db.query('update liquidity_csv_imports set source_identity_retained=false where id=$1', [published.id])).rejects.toThrow()
    const abandoned = await insertSource(db, { status: 'CANCELLED' })
    await expect(insertSource(db, { entityId: abandoned.entityId, sha256: abandoned.sha256 })).resolves.toMatchObject({ sha256: abandoned.sha256 })
    await expect(insertSource(db, { sha256: published.sha256 })).resolves.toMatchObject({ sha256: published.sha256 })
  })

  it('preserves guards for approved legacy evidence after adding metadata', async () => {
    const db = await migratedUpgrade()
    for (const [sql, id] of [
      ["update liquidity_csv_parse_runs set canonical_draft='{}' where id=$1", publishedRun],
      ["update liquidity_csv_reviews set canonical_hash='changed' where id=$1", publishedReview],
      ['update liquidity_source_positions set market_value=0 where id=$1', history.positionId],
      ['delete from liquidity_holdings_snapshots where id=$1', history.snapshotId],
      ["update liquidity_csv_imports set storage_key='changed' where id=$1", published.id],
    ]) await expect(db.query(sql!, [id])).rejects.toThrow('LIQUIDITY_IMMUTABLE_EVIDENCE')
  })

  it('enforces the accepted-hash uniqueness under concurrent writers, including retained cancelled rows', async () => {
    const db = await migratedFresh(), first = await db.connect(), second = await db.connect()
    const entityId = randomUUID(), sha256 = digest(randomUUID())
    await db.query("insert into entities(id,name,entity_type,status) values($1,'Synthetic concurrent fixture','TRUST','ACTIVE')", [entityId])
    try {
      await first.query('begin')
      await second.query('begin')
      await insertSource(first, { entityId, sha256, status: 'CANCELLED', retained: true })
      const attempt = insertSource(second, { entityId, sha256 }).then(() => ({ code: 'UNEXPECTED_SUCCESS' }), (error: { code: string }) => error)
      await first.query('commit')
      expect(await attempt).toMatchObject({ code: '23505' })
      await second.query('rollback')
      expect((await db.query('select count(*)::int as count from liquidity_csv_imports where entity_id=$1 and sha256=$2', [entityId, sha256])).rows[0].count).toBe(1)
    } finally {
      await first.query('rollback')
      await second.query('rollback')
      first.release()
      second.release()
    }
  })
})
