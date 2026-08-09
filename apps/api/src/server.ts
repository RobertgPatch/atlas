import { buildApp } from './app.js'
import { config } from './config.js'
import { runMigrations } from './infra/db/migrate.js'
import { authRepository } from './modules/auth/auth.repository.js'
import { plaidRepository } from './modules/plaid/plaid.repository.js'
import { plaidRefreshScheduler } from './modules/plaid/plaid.refresh-scheduler.js'

const productionGuardrailErrors = () => {
  if (config.nodeEnv !== 'production') return []

  return [
    config.databaseUrl ? null : 'DATABASE_URL is not configured.',
    config.persistenceSecretKey.length >= 32
      ? null
      : 'PERSISTENCE_SECRET_KEY must contain at least 32 characters.',
    config.sessionSecret.length >= 32
      ? null
      : 'SESSION_SECRET must contain at least 32 characters.',
    config.adminPassword.length >= 12
      ? null
      : 'ADMIN_PASSWORD must contain at least 12 characters.',
    !config.userPassword || config.userPassword.length >= 12
      ? null
      : 'USER_PASSWORD must contain at least 12 characters when configured.',
    config.webOrigin ? null : 'WEB_ORIGIN is not configured.',
    config.sessionCookieSecure
      ? null
      : 'SESSION_COOKIE_SECURE must be true in production.',
    config.sessionCookieSameSite !== 'none' || config.sessionCookieSecure
      ? null
      : 'SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true.',
    config.security.rateLimitEnabled
      ? null
      : 'RATE_LIMIT_ENABLED must be true in production.',
    config.security.apiSharedCachePolicy === 'no_shared_cache'
      ? null
      : 'API_SHARED_CACHE_POLICY must prevent shared caching for /v1/* responses.',
  ].filter((warning): warning is string => Boolean(warning))
}

const logStartupDiagnostics = (app: ReturnType<typeof buildApp>) => {
  const warnings = [
    ...plaidRefreshScheduler.getSchedulerWarnings(),
    ...(config.nodeEnv === 'production' && (!config.plaid.clientId || !config.plaid.secret)
      ? ['Plaid credentials are not fully configured.']
      : []),
  ]

  for (const warning of [...new Set(warnings)]) {
    app.log.warn({ diagnostic: 'startup_guardrail' }, warning)
  }
}

const start = async () => {
  const app = buildApp()

  try {
    const guardrailErrors = productionGuardrailErrors()
    if (guardrailErrors.length > 0) {
      throw new Error(
        `Refusing to start with an insecure production configuration:\n- ${guardrailErrors.join('\n- ')}`,
      )
    }

    if (config.databaseUrl) {
      app.log.info('[migrate] DATABASE_URL detected, running migrations')
      await runMigrations((msg) => app.log.info(msg))
      app.log.info('[migrate] migrations complete')
      await authRepository.bootstrapFromDatabase()
      await plaidRepository.bootstrapFromDatabase()
      app.log.info('[persistence] hydrated auth and Plaid state from Postgres')
    } else {
      app.log.info('[migrate] DATABASE_URL not set, using in-memory storage')
      if (config.requireDurablePersistence) {
        throw new Error('REQUIRE_DURABLE_PERSISTENCE=true but DATABASE_URL is not configured')
      }
    }

    logStartupDiagnostics(app)

    await app.listen({
      host: '0.0.0.0',
      port: config.port,
    })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

start()

