import { describe, expect, it, vi } from 'vitest'

import {
  runMigrationsWithClient,
  runMigrationsWithPool,
  type MigrationClient,
} from '../src/infra/db/migrate.js'

const migrationFiles = ['001_first.sql', '002_second.sql']

const createClient = (applied: string[] = []) => {
  const ledger = new Set(applied)
  const queries: string[] = []
  const client: MigrationClient = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push(sql.trim())
      if (sql.includes('select filename from schema_migrations')) {
        return { rows: [...ledger].map((filename) => ({ filename })) }
      }
      if (sql.includes('insert into schema_migrations')) {
        ledger.add(String(params?.[0]))
      }
      return { rows: [] }
    }),
    release: vi.fn(),
  }
  return { client, ledger, queries }
}

const files = {
  listMigrationFiles: async () => migrationFiles,
  readMigrationFile: async (name: string) => `select '${name}'`,
}

describe('local migration startup', () => {
  it('applies a clean migration set in order under the advisory lock', async () => {
    const { client, ledger, queries } = createClient()
    await runMigrationsWithClient(client, files)

    expect([...ledger]).toEqual(migrationFiles)
    expect(queries[0]).toContain('pg_advisory_lock')
    expect(queries.at(-1)).toContain('pg_advisory_unlock')
    expect(queries.filter((sql) => sql === 'BEGIN')).toHaveLength(2)
    expect(queries.filter((sql) => sql === 'COMMIT')).toHaveLength(2)
  })

  it('is repeatable when every migration is already recorded', async () => {
    const { client, queries } = createClient(migrationFiles)
    await runMigrationsWithClient(client, files)

    expect(queries).not.toContain('BEGIN')
    expect(queries.at(-1)).toContain('pg_advisory_unlock')
  })

  it('fails when the database cannot be reached and releases no child work', async () => {
    const pool = { connect: vi.fn().mockRejectedValue(new Error('database unavailable')) }
    await expect(runMigrationsWithPool(pool, files)).rejects.toThrow('database unavailable')
  })

  it('rolls back a broken migration and still releases the advisory lock', async () => {
    const { client, queries } = createClient()
    vi.mocked(client.query).mockImplementation(async (sql: string, params?: unknown[]) => {
      queries.push(sql.trim())
      if (sql.includes('select filename from schema_migrations')) return { rows: [] }
      if (sql.includes("select '002_second.sql'")) throw new Error('fixture syntax failure')
      return { rows: params ? [] : [] }
    })

    await expect(runMigrationsWithClient(client, files))
      .rejects.toThrow(/Migration 002_second.sql failed: fixture syntax failure/)
    expect(queries).toContain('ROLLBACK')
    expect(queries.at(-1)).toContain('pg_advisory_unlock')
  })
})
