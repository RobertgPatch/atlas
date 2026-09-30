import { describe, expect, it } from 'vitest'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'

describe('statement ingestion resource configuration', () => {
  it('uses the independently bounded 032 defaults with XLSX disabled', () => {
    expect(buildLiquidityCsvConfig({})).toMatchObject({
      xlsxEnabled: false,
      maxBytes: 10 * 1024 * 1024,
      maxRows: 5_000,
      maxAccounts: 100,
      maxColumns: 128,
      maxFieldBytes: 16 * 1024,
      maxRecordBytes: 64 * 1024,
      maxMetadataRecords: 100,
      maxTotalRecords: 10_000,
      maxInflatedBytes: 64 * 1024 * 1024,
      maxXmlEntryBytes: 32 * 1024 * 1024,
      maxZipEntries: 256,
      maxWorksheets: 16,
      maxPopulatedCells: 250_000,
      maxSharedStrings: 100_000,
      maxDecodedStringBytes: 16 * 1024 * 1024,
      maxStyles: 10_000,
      maxRelationships: 2_000,
      maxXmlDepth: 64,
      maxXmlAttributes: 64,
      maxXmlNameBytes: 256,
      maxWorkerOutputBytes: 32 * 1024 * 1024,
      workerOldGenerationMb: 256,
      parseConcurrency: 1,
      parseTimeoutMs: 30_000,
      maxRetries: 2,
      maxDecimalTokenBytes: 256,
      maxDecimalExponent: 100,
    })
  })

  it('permits explicit local XLSX enablement but defaults off in every runtime', () => {
    expect(buildLiquidityCsvConfig({ LIQUIDITY_XLSX_ENABLED: 'true' }).xlsxEnabled).toBe(true)
    expect(buildLiquidityCsvConfig({
      LIQUIDITY_CSV_OBJECT_STORE: 's3',
      LIQUIDITY_CSV_UPLOADS_ENABLED: 'false',
      LIQUIDITY_CSV_PARSING_ENABLED: 'false',
      LIQUIDITY_CSV_APPLY_ENABLED: 'false',
    }, true).xlsxEnabled).toBe(false)
  })

  it.each([
    ['LIQUIDITY_CSV_MAX_ROWS', '5001'],
    ['LIQUIDITY_STATEMENT_MAX_ACCOUNTS', '101'],
    ['LIQUIDITY_XLSX_MAX_INFLATED_BYTES', String(64 * 1024 * 1024 + 1)],
    ['LIQUIDITY_XLSX_MAX_XML_DEPTH', '65'],
    ['LIQUIDITY_CSV_PARSE_CONCURRENCY', '2'],
    ['LIQUIDITY_CSV_PARSE_TIMEOUT_MS', '30001'],
    ['LIQUIDITY_CSV_MAX_RETRIES', '3'],
    ['LIQUIDITY_STATEMENT_MAX_DECIMAL_EXPONENT', '101'],
  ])('rejects raising %s above its verified ceiling', (name, value) => {
    expect(() => buildLiquidityCsvConfig({ [name]: value })).toThrow(name)
  })
})
