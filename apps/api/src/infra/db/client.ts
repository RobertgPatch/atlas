import pg from 'pg'
import { config } from '../../config.js'

const { Pool } = pg

export const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl })
  : undefined

export const isDatabaseConfigured = () => Boolean(pool)

export const query = async <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> => {
  if (!pool) throw new Error('DATABASE_URL is not configured')
  return pool.query<T>(text, params)
}

export const withClient = async <T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  if (!pool) throw new Error('DATABASE_URL is not configured')
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export const withTransaction = async <T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
