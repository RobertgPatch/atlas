import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { buildLiquidityCsvConfig } from '../../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { readCsvStatement } from '../../../src/modules/liquidity-statements/readers/csv.reader.js'
import { readXlsxStatement } from '../../../src/modules/liquidity-statements/readers/xlsx.reader.js'
import { merrillHoldingsCsvAdapter } from '../../../src/modules/liquidity-statements/adapters/merrill/holdings-csv.js'
import { charlesSchwabPositionsCsvAdapter } from '../../../src/modules/liquidity-statements/adapters/charles-schwab/positions-csv.js'
import { morganStanleyHoldingsXlsxAdapter } from '../../../src/modules/liquidity-statements/adapters/morgan-stanley/holdings-xlsx.js'
import { detectStatementAdapters } from '../../../src/modules/liquidity-statements/adapters/detect.js'
import { buildMorganStanleyHoldingsFixture } from '../fixtures/morgan-stanley/holdings.fixture.js'
import { createConformanceRegistry } from './test-registry.js'
import { runAdapterConformance } from './run-conformance.js'
import { syntheticFourthAdapter } from './synthetic-fourth.adapter.js'

const config = buildLiquidityCsvConfig({ LIQUIDITY_XLSX_ENABLED: 'true' })
const csv = async (path: URL) => {
  const bytes = await readFile(path)
  return readCsvStatement(bytes, createHash('sha256').update(bytes).digest('hex'), config)
}
const projection = (adapterId: string, result: ReturnType<typeof syntheticFourthAdapter.parse>) => ({
  adapterId,
  accountCount: result.accounts.length,
  positionCount: result.accounts.reduce((sum, account) => sum + account.positions.length, 0),
})

describe('all statement adapters share one conformance boundary', () => {
  it('conforms Merrill, Schwab, Morgan Stanley and a test-only fourth family', async () => {
    const merrillExpected = JSON.parse(await readFile(new URL('../fixtures/merrill/expected.json', import.meta.url), 'utf8'))
    const schwabExpected = JSON.parse(await readFile(new URL('../fixtures/schwab/expected.json', import.meta.url), 'utf8'))
    const morganExpected = JSON.parse(await readFile(new URL('../fixtures/morgan-stanley/expected.json', import.meta.url), 'utf8'))
    const fourthExpected = JSON.parse(await readFile(new URL('../fixtures/synthetic-fourth/expected.json', import.meta.url), 'utf8'))
    const morganBytes = buildMorganStanleyHoldingsFixture()
    const morganDocument = await readXlsxStatement(morganBytes, createHash('sha256').update(morganBytes).digest('hex'), config)

    const cases = [
      { name: 'Merrill', adapter: merrillHoldingsCsvAdapter, document: await csv(new URL('../fixtures/merrill/holdings.csv', import.meta.url)), count: merrillExpected.positionCount },
      { name: 'Schwab', adapter: charlesSchwabPositionsCsvAdapter, document: await csv(new URL('../fixtures/schwab/positions.csv', import.meta.url)), count: schwabExpected.positions.length },
      { name: 'Morgan Stanley', adapter: morganStanleyHoldingsXlsxAdapter, document: morganDocument, count: morganExpected.account.positionCount },
      { name: 'Synthetic fourth', adapter: syntheticFourthAdapter, document: await csv(new URL('../fixtures/synthetic-fourth/holdings.csv', import.meta.url)), count: fourthExpected.positionCount },
    ]
    for (const entry of cases) {
      runAdapterConformance({
        name: entry.name, adapter: entry.adapter, document: entry.document,
        project: result => projection(entry.adapter.id, result),
        expected: { adapterId: entry.adapter.id, accountCount: entry.name === 'Merrill' ? 2 : 1, positionCount: entry.count },
        expectedPositionCount: entry.count,
      })
    }
  })

  it('adds the fourth family through registration only and leaves production registration unchanged', async () => {
    const document = await csv(new URL('../fixtures/synthetic-fourth/holdings.csv', import.meta.url))
    const registry = createConformanceRegistry(syntheticFourthAdapter)
    expect(detectStatementAdapters(document, registry, { custodianKey: 'synthetic_fourth' })).toMatchObject({
      outcome: 'MATCHED', matches: [{ adapterId: 'synthetic_fourth_positions_csv', adapterVersion: '1.0.0' }],
    })
    const productionRegistrySource = await readFile(new URL('../../../src/modules/liquidity-statements/adapters/registry.ts', import.meta.url), 'utf8')
    expect(productionRegistrySource).not.toContain(syntheticFourthAdapter.id)
  })
})
