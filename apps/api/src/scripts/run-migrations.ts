import { config } from '../config.js'
import { pool } from '../infra/db/client.js'
import { runMigrations } from '../infra/db/migrate.js'

const main = async (): Promise<void> => {
  if (!config.databaseUrl || !pool) {
    throw new Error('DATABASE_URL must be configured before running migrations.')
  }

  await runMigrations((message) => console.info(message))
  console.info('[migrate] migrations complete')
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await pool?.end().catch(() => undefined)
  })
