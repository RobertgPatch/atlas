import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

import { pool } from './client.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, 'migrations')

export interface MigrationClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
  release: () => void
}

export interface MigrationPool {
  connect: () => Promise<MigrationClient>
}

export interface MigrationFileSource {
  listMigrationFiles: () => Promise<string[]>
  readMigrationFile: (filename: string) => Promise<string>
}

const ensureMigrationsTable = async (client: pg.PoolClient): Promise<void> => {
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `)
}

const listAppliedMigrations = async (client: pg.PoolClient): Promise<Set<string>> => {
  const result = await client.query<{ filename: string }>(
    'select filename from schema_migrations',
  )
  return new Set(result.rows.map((row) => row.filename))
}

const listMigrationFiles = async (): Promise<string[]> => {
  const entries = await readdir(migrationsDir)
  return entries.filter((name) => name.endsWith('.sql')).sort()
}

const defaultMigrationFileSource: MigrationFileSource = {
  listMigrationFiles,
  readMigrationFile: (filename) => readFile(join(migrationsDir, filename), 'utf8'),
}

export const runMigrationsWithClient = async (
  client: MigrationClient,
  source: MigrationFileSource = defaultMigrationFileSource,
  log: (msg: string) => void = () => {},
): Promise<void> => {
  try {
    await client.query(`select pg_advisory_lock(hashtext('atlas-schema-migrations'))`)
    await ensureMigrationsTable(client as unknown as pg.PoolClient)
    const applied = await listAppliedMigrations(client as unknown as pg.PoolClient)
    const files = (await source.listMigrationFiles()).filter((name) => name.endsWith('.sql')).sort()

    for (const file of files) {
      if (applied.has(file)) continue
      const raw = await source.readMigrationFile(file)
      const sql = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
      log(`[migrate] applying ${file}`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'insert into schema_migrations (filename) values ($1)',
          [file],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(
          `Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  } finally {
    await client.query(`select pg_advisory_unlock(hashtext('atlas-schema-migrations'))`).catch(() => undefined)
  }
}

export const runMigrationsWithPool = async (
  databasePool: MigrationPool,
  source: MigrationFileSource = defaultMigrationFileSource,
  log: (msg: string) => void = () => {},
): Promise<void> => {
  const client = await databasePool.connect()
  try {
    await runMigrationsWithClient(client, source, log)
  } finally {
    client.release()
  }
}

export const runMigrations = async (
  log: (msg: string) => void = () => {},
): Promise<void> => {
  if (!pool) return
  await runMigrationsWithPool(pool as unknown as MigrationPool, defaultMigrationFileSource, log)
}
