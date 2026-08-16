import { buildApp } from './app.js'
import { config } from './config.js'
import { runMigrations } from './infra/db/migrate.js'
import { authRepository } from './modules/auth/auth.repository.js'
import { plaidRepository } from './modules/plaid/plaid.repository.js'
import { plaidRefreshScheduler } from './modules/plaid/plaid.refresh-scheduler.js'

const productionGuardrailWarnings = () => {
  if (config.nodeEnv !== 'production') return []

  return [
    config.databaseUrl ? null : 'DATABASE_URL is not configured.',
    config.persistenceSecretKey
      ? null
      : 'PERSISTENCE_SECRET_KEY is not configured.',
    config.sessionSecret ? null : 'SESSION_SECRET is not configured.',
    config.webOrigin ? null : 'WEB_ORIGIN is not configured.',
    config.sessionCookieSecure
      ? null
      : 'SESSION_COOKIE_SECURE must be true in production.',
    config.security.rateLimitEnabled
      ? null
      : 'RATE_LIMIT_ENABLED is not configured.',
    config.security.apiSharedCachePolicy === 'no_shared_cache'
      ? null
      : 'API_SHARED_CACHE_POLICY must prevent shared caching for /v1/* responses.',
    config.plaid.clientId && config.plaid.secret
      ? null
      : 'Plaid credentials are not fully configured.',
    config.marketData.provider !== 'none'
      ? null
      : 'MARKET_DATA_PROVIDER is not configured; Liquidity uses custodian prices.',
    config.marketData.provider !== 'alpaca' ||
    (config.marketData.alpaca.keyId && config.marketData.alpaca.secret)
      ? null
      : 'Alpaca market-data credentials are not fully configured.',
    !config.marketData.massive.enabled || config.marketData.massive.apiKey
      ? null
      : 'Massive OTC fallback is enabled but MASSIVE_MARKET_DATA_API_KEY is missing.',
  ].filter((warning): warning is string => Boolean(warning))
}

const logStartupDiagnostics = (app: ReturnType<typeof buildApp>) => {
  const warnings = [
    ...plaidRefreshScheduler.getSchedulerWarnings(),
    ...productionGuardrailWarnings(),
  ]

  for (const warning of [...new Set(warnings)]) {
    app.log.warn({ diagnostic: 'startup_guardrail' }, warning)
  }
}

const start = async () => {
  const app = buildApp()

  try {
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

