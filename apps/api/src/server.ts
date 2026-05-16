import { buildApp } from './app.js'
import { config } from './config.js'
import { runMigrations } from './infra/db/migrate.js'
import { authRepository } from './modules/auth/auth.repository.js'
import { plaidRepository } from './modules/plaid/plaid.repository.js'

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

