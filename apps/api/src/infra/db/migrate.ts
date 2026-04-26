import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

import { pool } from './client.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, 'migrations')

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

export const runMigrations = async (
  log: (msg: string) => void = () => {},
): Promise<void> => {
  if (!pool) return

  const client = await pool.connect()
  try {
    await ensureMigrationsTable(client)
    const applied = await listAppliedMigrations(client)
    const files = await listMigrationFiles()

    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await readFile(join(migrationsDir, file), 'utf8')
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
    client.release()
  }
}
