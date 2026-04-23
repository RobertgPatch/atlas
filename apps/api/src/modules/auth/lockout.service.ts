import { config } from '../../config.js'
import { withTransaction } from '../../infra/db/client.js'

const keyOf = (identifier: string, type: 'PASSWORD' | 'MFA') =>
  ({ identifier: identifier.toLowerCase(), type })

export const lockoutService = {
  async getLockout(identifier: string, type: 'PASSWORD' | 'MFA'): Promise<Date | null> {
    const key = keyOf(identifier, type)
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ lockout_until: Date }>(
        `select lockout_until
         from auth_attempts
         where user_identifier = $1
           and attempt_type = $2
           and lockout_until is not null
           and lockout_until > now()
         order by attempted_at desc
         limit 1`,
        [key.identifier, key.type],
      )

      return rows[0]?.lockout_until ?? null
    })
  },

  async recordFailure(identifier: string, type: 'PASSWORD' | 'MFA'): Promise<Date | null> {
    const key = keyOf(identifier, type)
    return withTransaction(async (client) => {
      const existing = await client.query<{ lockout_until: Date }>(
        `select lockout_until
         from auth_attempts
         where user_identifier = $1
           and attempt_type = $2
           and lockout_until is not null
           and lockout_until > now()
         order by attempted_at desc
         limit 1`,
        [key.identifier, key.type],
      )

      if (existing.rows[0]?.lockout_until) {
        return existing.rows[0].lockout_until
      }

      const recentAttempts = await client.query<{ success: boolean }>(
        `select success
         from auth_attempts
         where user_identifier = $1
           and attempt_type = $2
         order by attempted_at desc
         limit $3`,
        [key.identifier, key.type, Math.max(config.authLockoutThreshold - 1, 0)],
      )

      let consecutiveFailures = 1
      for (const row of recentAttempts.rows) {
        if (row.success) break
        consecutiveFailures += 1
      }

      const lockoutUntil =
        consecutiveFailures >= config.authLockoutThreshold
          ? new Date(Date.now() + config.authLockoutMinutes * 60 * 1000)
          : null

      await client.query(
        `insert into auth_attempts (user_identifier, attempt_type, success, lockout_until)
         values ($1, $2, false, $3)`,
        [key.identifier, key.type, lockoutUntil],
      )

      return lockoutUntil
    })
  },

  async clear(identifier: string, type: 'PASSWORD' | 'MFA'): Promise<void> {
    const key = keyOf(identifier, type)
    await withTransaction(async (client) => {
      await client.query(
        `insert into auth_attempts (user_identifier, attempt_type, success)
         values ($1, $2, true)`,
        [key.identifier, key.type],
      )
    })
  },
}
