import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../src/infra/db/client.js'
import { runMigrations } from '../src/infra/db/migrate.js'
import { liquiditySectorRepository } from '../src/modules/liquidity-sectors/liquidity-sector.repository.js'

describe.skipIf(!pool)('durable sector assignments', () => {
  const userId = randomUUID()
  const symbol = `TEST.${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  beforeAll(async () => {
    await runMigrations()
    await pool!.query('insert into users(id,email,password_hash,display_name) values($1,$2,$3,$4)', [userId, `${userId}@example.invalid`, 'not-a-login-hash', 'Synthetic sector test'])
  }, 30000)
  it('persists canonical symbols, audits writes, fences concurrent updates, and retains reset versions', async () => {
    const actor = { userId, isAdmin: true }
    const first = await liquiditySectorRepository.save(symbol.toLowerCase().replace('.', '-'), { sector: 'Industrials', expectedVersion: 0 }, actor)
    expect(first).toMatchObject({ symbol, sector: 'Industrials', version: 1 })
    expect((await liquiditySectorRepository.forSymbols([symbol.replace('.', '/')])).get(symbol)).toEqual(first)
    const competing = await Promise.allSettled([
      liquiditySectorRepository.save(symbol, { sector: 'Technology', expectedVersion: 1 }, actor),
      liquiditySectorRepository.save(symbol, { sector: 'Financials', expectedVersion: 1 }, actor),
    ])
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(competing.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } })
    const reset = await liquiditySectorRepository.save(symbol, { sector: null, expectedVersion: 2 }, actor)
    expect(reset).toMatchObject({ sector: null, version: 3 })
    await expect(liquiditySectorRepository.save(symbol, { sector: 'Energy', expectedVersion: 0 }, actor)).rejects.toMatchObject({ code: 'STALE_VERSION' })
    expect((await liquiditySectorRepository.list()).find((row) => row.symbol === symbol)).toEqual(reset)
    expect((await pool!.query("select event_name from audit_events where object_type='liquidity_sector' and after_json->>'symbol'=$1 order by created_at", [symbol])).rows.map((row) => row.event_name)).toEqual(['liquidity.sector.assigned', 'liquidity.sector.assigned', 'liquidity.sector.reset'])
    await expect(liquiditySectorRepository.save(symbol, { sector: 'Energy', expectedVersion: 3 }, { ...actor, isAdmin: false })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
