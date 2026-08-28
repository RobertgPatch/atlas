import { describe, expect, it } from 'vitest'

import {
  AdmissionLimitExceededError,
  AdmissionRepository,
  AdmissionStoreUnavailableError,
  type AdmissionDatabase,
  type AdmissionQueryResult,
  type AdmissionSqlClient,
} from '../../src/modules/abuse-protection/admission.repository.js'

const at = new Date('2026-08-25T12:00:00.000Z')
const hourStart = new Date('2026-08-25T12:00:00.000Z')
const dayStart = new Date('2026-08-25T00:00:00.000Z')
const expires = new Date('2026-08-26T00:00:00.000Z')
const operationId = '11111111-1111-4111-8111-111111111111'
const leaseId = '22222222-2222-4222-8222-222222222222'

const hash = (byte: number) => Buffer.alloc(32, byte)

const result = <Row extends Record<string, unknown>>(
  rows: readonly Row[] = [],
  rowCount: number | null = rows.length,
): AdmissionQueryResult<Row> => ({ rows, rowCount })

class FakeDatabase implements AdmissionDatabase {
  committed = 0
  rolledBack = 0

  constructor(readonly client: AdmissionSqlClient) {}

  async transaction<T>(callback: (client: AdmissionSqlClient) => Promise<T>): Promise<T> {
    try {
      const value = await callback(this.client)
      this.committed += 1
      return value
    } catch (error) {
      this.rolledBack += 1
      throw error
    }
  }
}

describe('AdmissionRepository', () => {
  it('reserves multi-scope rate windows and quotas in deterministic key order', async () => {
    const rateOrder: string[] = []
    const quotaOrder: string[] = []
    const client: AdmissionSqlClient = {
      async query<Row extends Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<AdmissionQueryResult<Row>> {
        if (sql.includes('insert into abuse_rate_windows')) {
          rateOrder.push(`${params[0]}:${params[1]}:${Buffer.from(params[2] as Uint8Array).toString('hex')}`)
          return result([{ consumed_units: params[5] }] as unknown as Row[])
        }
        if (sql.includes('insert into workload_quota_counters')) {
          quotaOrder.push(`${params[0]}:${params[1]}:${Buffer.from(params[2] as Uint8Array).toString('hex')}`)
          return result([{ reserved_units: params[5] }] as unknown as Row[])
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      },
    }
    const database = new FakeDatabase(client)
    const repository = new AdmissionRepository(database)

    const reserved = await repository.reserve({
      now: at,
      rateWindows: [
        {
          policyKey: 'z-policy', scopeKind: 'user', scopeHash: hash(3),
          windowStartedAt: hourStart, windowSeconds: 60, units: 1, limit: 10, expiresAt: expires,
        },
        {
          policyKey: 'a-policy', scopeKind: 'global', scopeHash: hash(2),
          windowStartedAt: hourStart, windowSeconds: 60, units: 2, limit: 10, expiresAt: expires,
        },
        {
          policyKey: 'a-policy', scopeKind: 'account', scopeHash: hash(1),
          windowStartedAt: hourStart, windowSeconds: 60, units: 3, limit: 10, expiresAt: expires,
        },
      ],
      quotas: [
        {
          workloadKey: 'z-workload', scopeKind: 'user', scopeHash: hash(3), periodKind: 'utc_day',
          periodStartedAt: dayStart, units: 4, limit: 20, expiresAt: expires,
        },
        {
          workloadKey: 'a-workload', scopeKind: 'global', scopeHash: hash(2), periodKind: 'utc_day',
          periodStartedAt: dayStart, units: 5, limit: 20, expiresAt: expires,
        },
      ],
    })

    expect(rateOrder).toEqual([
      `a-policy:account:${hash(1).toString('hex')}`,
      `a-policy:global:${hash(2).toString('hex')}`,
      `z-policy:user:${hash(3).toString('hex')}`,
    ])
    expect(quotaOrder).toEqual([
      `a-workload:global:${hash(2).toString('hex')}`,
      `z-workload:user:${hash(3).toString('hex')}`,
    ])
    expect(reserved.rateWindows.map((entry) => entry.consumedUnits)).toEqual([3n, 2n, 1n])
    expect(reserved.quotas.map((entry) => entry.reservedUnits)).toEqual([5n, 4n])
    expect(database.committed).toBe(1)
    expect(database.rolledBack).toBe(0)
  })

  it('throws a bounded rate rejection so the enclosing transaction rolls back every scope', async () => {
    let inserts = 0
    const client: AdmissionSqlClient = {
      async query<Row extends Record<string, unknown>>(sql: string): Promise<AdmissionQueryResult<Row>> {
        if (sql.includes('insert into abuse_rate_windows')) {
          inserts += 1
          return inserts === 1
            ? result([{ consumed_units: '1' }] as unknown as Row[])
            : result([] as Row[])
        }
        if (sql.includes('select expires_at')) {
          return result([{ expires_at: new Date(at.getTime() + 30_000) }] as unknown as Row[])
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      },
    }
    const database = new FakeDatabase(client)
    const repository = new AdmissionRepository(database)

    const promise = repository.reserve({
      now: at,
      rateWindows: [1, 2].map((byte) => ({
        policyKey: `policy-${byte}`,
        scopeKind: 'user' as const,
        scopeHash: hash(byte),
        windowStartedAt: hourStart,
        windowSeconds: 60,
        units: 1,
        limit: 1,
        expiresAt: new Date(at.getTime() + 30_000),
      })),
    })

    await expect(promise).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      reasonCode: 'RATE_WINDOW_LIMIT',
      retryAfterSeconds: 30,
    })
    expect(database.committed).toBe(0)
    expect(database.rolledBack).toBe(1)
  })

  it('fails closed when the transaction store is unavailable', async () => {
    const repository = new AdmissionRepository({
      async transaction(): Promise<never> {
        throw new Error('database offline')
      },
    })

    await expect(repository.reserve({ now: at })).rejects.toBeInstanceOf(
      AdmissionStoreUnavailableError,
    )
    await expect(repository.reserve({ now: at })).rejects.toMatchObject({
      code: 'PROTECTION_UNAVAILABLE',
    })
  })

  it('uses advisory and row locks before exact concurrency/backlog lease creation', async () => {
    const statements: string[] = []
    const client: AdmissionSqlClient = {
      async query<Row extends Record<string, unknown>>(sql: string): Promise<AdmissionQueryResult<Row>> {
        statements.push(sql)
        if (sql.includes('pg_advisory_xact_lock')) return result([] as Row[])
        if (sql.includes('from idempotent_operations') && sql.includes('where operation_id = $1')) {
          return result([{ workload_key: 'k1-bda', state: 'reserved' }] as unknown as Row[])
        }
        if (sql.includes('from workload_leases') && sql.includes('where operation_id = $1')) {
          return result([] as Row[])
        }
        if (sql.includes('from workload_leases') && sql.includes("state = 'active'")) {
          return result([{ lease_id: 'existing' }] as unknown as Row[])
        }
        if (sql.includes('from idempotent_operations') && sql.includes('state = any')) {
          return result([{ operation_id: operationId }] as unknown as Row[])
        }
        if (sql.includes('insert into workload_leases')) {
          return result([{ fencing_token: '42' }] as unknown as Row[])
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      },
    }
    const repository = new AdmissionRepository(new FakeDatabase(client))

    const reserved = await repository.reserve({
      now: at,
      capacity: {
        leaseId,
        operationId,
        workloadKey: 'k1-bda',
        scopeKind: 'global',
        scopeHash: hash(7),
        concurrencyLimit: 2,
        backlogLimit: 3,
        expiresAt: new Date(at.getTime() + 60_000),
      },
    })

    expect(statements.filter((sql) => sql.includes('pg_advisory_xact_lock'))).toHaveLength(2)
    expect(statements.some((sql) => sql.includes('for update'))).toBe(true)
    expect(statements.some((sql) => sql.includes('order by lease_id'))).toBe(true)
    expect(statements.some((sql) => sql.includes('order by operation_id'))).toBe(true)
    expect(reserved.lease).toEqual({ leaseId, operationId, fencingToken: 42n })
  })

  it('rejects at the exact concurrency ceiling before inserting a lease', async () => {
    let inserted = false
    const client: AdmissionSqlClient = {
      async query<Row extends Record<string, unknown>>(sql: string): Promise<AdmissionQueryResult<Row>> {
        if (sql.includes('pg_advisory_xact_lock')) return result([] as Row[])
        if (sql.includes('from idempotent_operations') && sql.includes('where operation_id = $1')) {
          return result([{ workload_key: 'plaid', state: 'queued' }] as unknown as Row[])
        }
        if (sql.includes('from workload_leases') && sql.includes('where operation_id = $1')) {
          return result([] as Row[])
        }
        if (sql.includes('from workload_leases') && sql.includes("state = 'active'")) {
          return result([{ lease_id: 'existing' }] as unknown as Row[])
        }
        if (sql.includes('insert into workload_leases')) inserted = true
        return result([] as Row[])
      },
    }
    const database = new FakeDatabase(client)
    const repository = new AdmissionRepository(database)

    const promise = repository.reserve({
      now: at,
      capacity: {
        operationId,
        workloadKey: 'plaid',
        scopeKind: 'global',
        scopeHash: hash(8),
        concurrencyLimit: 1,
        backlogLimit: 5,
        expiresAt: new Date(at.getTime() + 60_000),
      },
    })

    await expect(promise).rejects.toBeInstanceOf(AdmissionLimitExceededError)
    await expect(promise).rejects.toMatchObject({ reasonCode: 'WORKLOAD_CONCURRENCY_LIMIT' })
    expect(inserted).toBe(false)
    expect(database.rolledBack).toBe(1)
  })

  it('deletes only finite cleanup batches with skip-locked cleanup queries', async () => {
    const statements: Array<{ sql: string; params: readonly unknown[] }> = []
    const counts = [2, 3, 1, 4, 5]
    const client: AdmissionSqlClient = {
      async query<Row extends Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<AdmissionQueryResult<Row>> {
        statements.push({ sql, params })
        return result([] as Row[], counts[statements.length - 1]!)
      },
    }
    const repository = new AdmissionRepository(new FakeDatabase(client))

    const cleaned = await repository.cleanupExpired({ now: at, batchSize: 25 })

    expect(cleaned).toEqual({
      rateWindows: 2,
      quotaCounters: 3,
      leases: 1,
      operations: 4,
      overrides: 5,
    })
    expect(statements).toHaveLength(5)
    expect(statements.every(({ sql }) => sql.includes('limit $') && sql.includes('skip locked'))).toBe(true)
    expect(statements.every(({ params }) => params.includes(25))).toBe(true)
  })
})
