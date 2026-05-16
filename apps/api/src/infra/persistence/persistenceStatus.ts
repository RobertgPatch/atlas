import { config } from '../../config.js'
import { pool } from '../db/client.js'
import { isDedicatedSecretKeyConfigured } from '../crypto/secretCodec.js'

export interface PersistenceStatus {
  mode: 'durable' | 'temporary'
  databaseConfigured: boolean
  databaseReachable: boolean
  dedicatedSecretKeyConfigured: boolean
  warnings: string[]
}

export const getPersistenceStatus = async (): Promise<PersistenceStatus> => {
  const warnings: string[] = []
  const databaseConfigured = config.databaseUrl.length > 0
  let databaseReachable = false

  if (pool) {
    try {
      await pool.query('select 1')
      databaseReachable = true
    } catch {
      warnings.push('DATABASE_URL is configured but Postgres is not reachable.')
    }
  } else {
    warnings.push('DATABASE_URL is not configured; auth and Plaid state are temporary.')
  }

  if (databaseReachable && !isDedicatedSecretKeyConfigured()) {
    warnings.push('PERSISTENCE_SECRET_KEY is not configured; using fallback key material.')
  }

  return {
    mode: databaseReachable ? 'durable' : 'temporary',
    databaseConfigured,
    databaseReachable,
    dedicatedSecretKeyConfigured: isDedicatedSecretKeyConfigured(),
    warnings,
  }
}
