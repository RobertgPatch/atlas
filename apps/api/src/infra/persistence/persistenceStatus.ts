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

export interface LivenessStatus {
  status: 'ok'
}

export interface ReadinessStatus {
  status: 'ready' | 'not_ready'
  persistence: PersistenceStatus
}

/**
 * Public liveness must stay dependency-free so an unavailable database cannot
 * amplify a cheap health request into connection work.
 */
export const getLivenessStatus = (): LivenessStatus => ({ status: 'ok' })

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

export const getReadinessStatus = async (): Promise<ReadinessStatus> => {
  const persistence = await getPersistenceStatus()
  return {
    status: persistence.databaseReachable ? 'ready' : 'not_ready',
    persistence,
  }
}
