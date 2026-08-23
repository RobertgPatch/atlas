import { config } from '../config.js'
import { pool } from '../infra/db/client.js'
import { runMigrations } from '../infra/db/migrate.js'
import { marketDataService } from '../modules/market-data/market-data.service.js'
import { plaidRepository } from '../modules/plaid/plaid.repository.js'

const main = async () => {
  if (!config.databaseUrl && config.requireDurablePersistence) {
    throw new Error('REQUIRE_DURABLE_PERSISTENCE=true but DATABASE_URL is not configured')
  }

  if (config.databaseUrl) {
    await runMigrations((message) => console.info(message))
    await plaidRepository.bootstrapFromDatabase()
  }

  const result = await marketDataService.refreshClosingPrices()
  console.info(
    JSON.stringify({
      event: 'market_price_eod_refresh_finished',
      ...result,
    }),
  )
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: 'market_price_eod_refresh_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await pool?.end()
  })
