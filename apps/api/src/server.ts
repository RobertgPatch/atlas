import { buildApp } from './app.js'
import { config } from './config.js'
import { runMigrations } from './infra/db/migrate.js'

const start = async () => {
  const app = buildApp()

  try {
    if (config.databaseUrl) {
      app.log.info('[migrate] DATABASE_URL detected, running migrations')
      await runMigrations((msg) => app.log.info(msg))
      app.log.info('[migrate] migrations complete')
    } else {
      app.log.info('[migrate] DATABASE_URL not set, using in-memory storage')
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

