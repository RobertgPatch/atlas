import { describe, expect, it } from 'vitest'

import {
  AdmissionRepository,
  type AdmissionDatabase,
  type AdmissionQueryResult,
  type AdmissionSqlClient,
} from '../../src/modules/abuse-protection/admission.repository.js'

const result = <Row extends Record<string, unknown>>(
  rows: readonly Row[] = [],
): AdmissionQueryResult<Row> => ({ rows, rowCount: rows.length })

describe('HMAC rotation continuity for workload quotas', () => {
  it('consolidates retained daily/monthly counters into the active digest once', async () => {
    const active = Buffer.alloc(32, 1)
    const retained = Buffer.alloc(32, 2)
    const statements: string[] = []
    const client: AdmissionSqlClient = {
      async query<Row extends Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<AdmissionQueryResult<Row>> {
        statements.push(sql)
        if (sql.includes('pg_advisory_xact_lock')) return result([] as Row[])
        if (sql.includes('select scope_hash, reserved_units')) {
          return result([{
            scope_hash: retained,
            reserved_units: '4',
            expires_at: new Date('2026-09-01T00:00:00.000Z'),
          }] as unknown as Row[])
        }
        if (sql.includes('delete from workload_quota_counters')) return result([] as Row[])
        if (sql.includes('insert into workload_quota_counters')) {
          expect(params[5]).toBe('5')
          return result([{ reserved_units: '5' }] as unknown as Row[])
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      },
    }
    const database: AdmissionDatabase = {
      transaction: async (callback) => callback(client),
    }
    const repository = new AdmissionRepository(database)
    const reserved = await repository.reserve({
      now: new Date('2026-08-29T12:00:00.000Z'),
      quotas: [{
        workloadKey: 'cost-budget:paid-workload-cents',
        scopeKind: 'global',
        scopeHash: active,
        scopeHashAliases: [retained],
        periodKind: 'billing_month',
        periodStartedAt: new Date('2026-08-01T00:00:00.000Z'),
        units: 1,
        limit: 10,
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      }],
    })

    expect(reserved.quotas[0]?.reservedUnits).toBe(5n)
    expect(statements.filter((sql) => sql.includes('delete from workload_quota_counters'))).toHaveLength(1)
    expect(statements.filter((sql) => sql.includes('insert into workload_quota_counters'))).toHaveLength(1)
  })
})
