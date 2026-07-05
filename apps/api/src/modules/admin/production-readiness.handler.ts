import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../../config.js'
import { getPersistenceStatus } from '../../infra/persistence/persistenceStatus.js'
import { plaidRefreshScheduler } from '../plaid/plaid.refresh-scheduler.js'

type DurablePersistenceMode = 'durable' | 'temporary' | 'mixed' | 'unavailable'

const uniqueWarnings = (warnings: Array<string | null | undefined>) =>
  [
    ...new Set(
      warnings.filter((warning): warning is string => Boolean(warning)),
    ),
  ]

const persistenceModeFor = (input: {
  databaseConfigured: boolean
  databaseReachable: boolean
}): DurablePersistenceMode => {
  if (input.databaseReachable) return 'durable'
  if (input.databaseConfigured) return 'mixed'
  return config.requireDurablePersistence ? 'unavailable' : 'temporary'
}

export const getProductionReadinessHandler = async (
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const persistence = await getPersistenceStatus()
  const databaseConfigured = config.databaseUrl.length > 0
  const plaidCredentialsConfigured = Boolean(
    config.plaid.clientId && config.plaid.secret,
  )
  const schedulerConfigured =
    config.plaidRefresh.schedulerEnabled &&
    config.plaidRefresh.schedulerMode !== 'none' &&
    Boolean(config.plaidRefresh.schedulerToken)
  const secretsConfigured = {
    persistenceSecretKey: config.persistenceSecretKey.length > 0,
    sessionSecret: config.sessionSecret.length > 0,
    plaidCredentials: plaidCredentialsConfigured,
    schedulerToken: config.plaidRefresh.schedulerToken.length > 0,
  }
  const secureCookies = {
    secure: config.sessionCookieSecure,
    sameSite: config.sessionCookieSameSite,
  }
  const warnings = uniqueWarnings([
    ...persistence.warnings,
    ...plaidRefreshScheduler.getSchedulerWarnings(),
    databaseConfigured
      ? null
      : 'DATABASE_URL is not configured; durable persistence is unavailable.',
    config.requireDurablePersistence && !persistence.databaseReachable
      ? 'Durable persistence is required but Postgres was not confirmed reachable.'
      : null,
    secretsConfigured.persistenceSecretKey
      ? null
      : 'PERSISTENCE_SECRET_KEY is not configured.',
    secretsConfigured.sessionSecret ? null : 'SESSION_SECRET is not configured.',
    secretsConfigured.plaidCredentials
      ? null
      : 'Plaid credentials are not fully configured.',
    schedulerConfigured
      ? null
      : 'Automatic refresh scheduler is not fully configured.',
    config.nodeEnv === 'production' && !secureCookies.secure
      ? 'SESSION_COOKIE_SECURE must be true in production.'
      : null,
    config.nodeEnv === 'production' && secureCookies.sameSite === 'none'
      ? 'SESSION_COOKIE_SAMESITE should not be none for the same-site AWS app domain.'
      : null,
    config.webOrigin
      ? null
      : 'WEB_ORIGIN is not configured for the public app domain.',
    config.security.apiSharedCachePolicy === 'no_shared_cache'
      ? null
      : 'API_SHARED_CACHE_POLICY must prevent shared caching for /v1/* responses.',
    config.security.rateLimitEnabled
      ? null
      : 'RATE_LIMIT_ENABLED is not configured.',
    config.nodeEnv === 'production'
      ? 'Secret rotation evidence is app-unverified; confirm Secrets Manager rotation in the deployment runbook.'
      : null,
  ])

  reply.send({
    environment: config.nodeEnv,
    durablePersistence: {
      databaseConfigured,
      mode: persistenceModeFor({
        databaseConfigured,
        databaseReachable: persistence.databaseReachable,
      }),
    },
    schedulerConfigured,
    secretsConfigured,
    secureCookies,
    allowedOrigin: config.webOrigin,
    rateLimitConfigured: config.security.rateLimitEnabled,
    apiCachingPolicy: config.security.apiSharedCachePolicy,
    scopingStatus: {
      apiRepositoryScoping: 'required_passed',
      postgresRls: 'deferred_hardening',
    },
    warnings,
    checkedAt: new Date().toISOString(),
  })
}
