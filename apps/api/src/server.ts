import { buildApp } from './app.js'
import { csvProcessingService } from './modules/liquidity-statements/csv-processing.service.js'
import { drainLiquidityOutbox } from './modules/liquidity-sources/liquidity-source-invalidation.service.js'
import { config, requireProcessRole } from './config.js'
import { runMigrations } from './infra/db/migrate.js'
import { authRepository } from './modules/auth/auth.repository.js'

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
    !config.marketData.realTimeEquitiesEnabled || config.marketData.provider !== 'none'
      ? null
      : 'MARKET_DATA_PROVIDER is not configured; Liquidity uses custodian prices.',
    !config.marketData.realTimeEquitiesEnabled ||
    config.marketData.provider !== 'alpaca' ||
    (config.marketData.alpaca.keyId && config.marketData.alpaca.secret)
      ? null
      : 'Alpaca market-data credentials are not fully configured.',
    !config.marketData.realTimeEquitiesEnabled ||
    !config.marketData.massive.enabled ||
    config.marketData.massive.apiKey
      ? null
      : 'Massive OTC fallback is enabled but MASSIVE_MARKET_DATA_API_KEY is missing.',
  ].filter((warning): warning is string => Boolean(warning))
}

const logStartupDiagnostics = (app: ReturnType<typeof buildApp>) => {
  const warnings = productionGuardrailWarnings()

  for (const warning of [...new Set(warnings)]) {
    app.log.warn({ diagnostic: 'startup_guardrail' }, warning)
  }
}

const start = async () => {
  requireProcessRole(config.processRole, 'api')
  const app = buildApp()

  try {
    if (config.abuseProtection.runtime.steadyStateApiTasks !== 1) {
      throw new Error(
        'Password-hash concurrency is process-local and requires exactly one steady-state API task.',
      )
    }
    if (config.databaseUrl) {
      app.log.info('[migrate] DATABASE_URL detected, running migrations')
      await runMigrations((msg) => app.log.info(msg))
      app.log.info('[migrate] migrations complete')
      await authRepository.bootstrapFromDatabase()
      csvProcessingService.start()
      const csvOutboxTimer = setInterval(() => { void drainLiquidityOutbox().catch(() => {}) }, 5000)
      csvOutboxTimer.unref()
      app.addHook('onClose', async () => { clearInterval(csvOutboxTimer); await csvProcessingService.stop() })
      app.log.info('[persistence] hydrated auth state from Postgres')
    } else {
      app.log.info('[migrate] DATABASE_URL not set, using in-memory storage')
      if (config.requireDurablePersistence) {
        throw new Error('REQUIRE_DURABLE_PERSISTENCE=true but DATABASE_URL is not configured')
      }
      await authRepository.bootstrapFromDatabase()
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

