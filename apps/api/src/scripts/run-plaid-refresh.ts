import { config } from '../config.js'
import { pool } from '../infra/db/client.js'
import { runMigrations } from '../infra/db/migrate.js'
import { authRepository } from '../modules/auth/auth.repository.js'
import { plaidRepository } from '../modules/plaid/plaid.repository.js'
import { plaidRefreshScheduler } from '../modules/plaid/plaid.refresh-scheduler.js'

const main = async () => {
  if (!config.databaseUrl && config.requireDurablePersistence) {
    throw new Error('REQUIRE_DURABLE_PERSISTENCE=true but DATABASE_URL is not configured')
  }

  if (config.databaseUrl) {
    await runMigrations((message) => console.info(message))
    await authRepository.bootstrapFromDatabase()
    await plaidRepository.bootstrapFromDatabase()
  }

  const attempt = await plaidRefreshScheduler.runScheduledRefresh({
    scheduledFor: new Date(),
  })

  console.info(
    JSON.stringify({
      event: 'plaid_refresh_cli_finished',
      attemptId: attempt.id,
      status: attempt.status,
      refreshReason: attempt.refreshReason,
      selectedAccountCount: attempt.selectedAccountIds.length,
      dataAsOfDate: attempt.dataAsOfDate,
    }),
  )
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: 'plaid_refresh_cli_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await pool?.end()
  })
