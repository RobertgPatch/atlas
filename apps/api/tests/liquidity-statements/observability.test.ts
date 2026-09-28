import { expect, it } from 'vitest'
import { csvMetrics, csvGauges, recordCsvOutcome, recordCsvReportState } from '../../src/modules/liquidity-statements/csv-observability.js'
import { CsvError, csvErrors } from '../../src/modules/liquidity-statements/liquidity-statement.errors.js'
it('admits only finite telemetry labels and safe errors', () => {
  const canary = 'ACCOUNT-FILENAME-SYMBOL-AMOUNT-CANARY'
  recordCsvOutcome('parse', 'success')
  recordCsvOutcome(canary as 'parse', 'success')
  expect(JSON.stringify(csvMetrics())).not.toContain(canary)
  expect(csvMetrics()['parse:success']).toBeGreaterThan(0)
  recordCsvReportState(false, 3)
  expect(csvGauges()).toEqual({ quotesEnabled: 0, overdueAccounts: 3 })
  recordCsvReportState(true, Number.NaN)
  expect(csvGauges()).toEqual({ quotesEnabled: 1, overdueAccounts: 0 })
  for (const key of Object.keys(csvErrors) as (keyof typeof csvErrors)[]) expect(new CsvError(key).message).not.toContain(canary)
})
