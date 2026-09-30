import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'
import { merrillHoldingsCsvAdapter as adapter } from '../../src/modules/liquidity-statements/adapters/merrill/holdings-csv.js'
import { readCsvStatement } from '../../src/modules/liquidity-statements/readers/csv.reader.js'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { statementFieldSchema } from '../../src/modules/liquidity-statements/statement-draft.compat.js'
import { positionFields } from '../../src/modules/liquidity-statements/liquidity-statement.types.js'
import type { AdapterResult } from '../../src/modules/liquidity-statements/adapters/adapter.types.js'
import { buildCsvBytes } from './adapter-conformance/fixture-builders.js'

const source = readFileSync(new URL('./fixtures/merrill/holdings.csv', import.meta.url))
const golden = JSON.parse(readFileSync(new URL('./fixtures/merrill/expected.json', import.meta.url), 'utf8'))
const rows = (): string[][] => parse(source, { skip_empty_lines: true })
const reader = (bytes: Buffer) => readCsvStatement(bytes, createHash('sha256').update(bytes).digest('hex'), buildLiquidityCsvConfig({}))
const parseFixture = async (bytes = source) => {
  const document = await reader(bytes)
  const matches = adapter.detect(document)
  expect(matches).toHaveLength(1)
  return { document, match: matches[0]!, result: adapter.parse(document, matches[0]!) }
}
const projectedFields = ['symbol', 'brokerSecurityId', 'cusip', 'description', 'assetType', 'sourceAssetType', 'currency', 'quantity', 'price', 'marketValue', 'costBasis', 'unrealizedGainLoss', 'unrealizedGainLossRatio', 'dayChange', 'dayChangeRatio', 'accruedInterest'] as const
const project = (result: AdapterResult) => ({
  canonicalSchemaVersion: adapter.canonicalSchemaVersion,
  adapterId: adapter.id,
  positionCount: result.accounts.reduce((sum, account) => sum + account.positions.length, 0),
  controls: result.controls,
  accounts: result.accounts.map(account => ({
    displayName: account.displayName.value, accountMask: account.accountMask.value, identifierQuality: account.identifierQuality,
    currency: account.currency.value, asOfDate: account.asOfDate.value, asOfAt: account.asOfAt.value,
    asOfPrecision: account.asOfPrecision, completeness: account.completeness,
    positions: account.positions.map(position => ({ sourceRecord: position.sourceRecord, ...Object.fromEntries(projectedFields.map(field => [field, position[field].value])) })),
  })),
})

describe('Merrill holdings CSV schema-3 adapter conformance', () => {
  it('matches independently authored canonical source values and accounts', async () => {
    const { result } = await parseFixture()
    expect(project(result)).toEqual(golden)
    expect(result.findings.filter(finding => finding.severity === 'BLOCKING')).toEqual([])
    for (const account of result.accounts) for (const position of account.positions) {
      for (const field of positionFields) expect(statementFieldSchema.safeParse(position[field]).success, `${position.sourceRecord}:${field}`).toBe(true)
    }
  })

  it('uses named headers and preserves output when optional columns are reordered', async () => {
    const reordered = rows().map(row => [...row].reverse())
    expect(project((await parseFixture(buildCsvBytes(reordered))).result)).toEqual(golden)
  })

  it('supports sparse original exports without inventing optional basis, currency or day change', async () => {
    const matrix = rows(), optional = new Set(['Cost Basis ($)', 'Asset Type', 'Currency', 'Day Change ($)', 'Day Change (%)', 'Synthetic Extra Column'])
    const retained = matrix[0]!.flatMap((header, index) => optional.has(header) ? [] : [index])
    const { result } = await parseFixture(buildCsvBytes(matrix.map(row => retained.map(index => row[index]!))))
    const positions = result.accounts.flatMap(account => account.positions)
    expect(positions).toHaveLength(6)
    expect(positions.every(position => position.costBasis.value === null && position.currency.value === null && position.dayChange.value === null && position.dayChangeRatio.value === null)).toBe(true)
    expect(result.findings.some(finding => finding.severity === 'BLOCKING' && ['MISSING_CURRENCY', 'MISSING_BASIS', 'MISSING_DAY_CHANGE', 'TOTAL_NOT_PROVIDED'].includes(finding.code))).toBe(false)
    expect(result.controls).toEqual([])
  })

  it('preserves leading-zero identity and evidence without persisting raw account IDs in canonical accounts', async () => {
    const { result, document } = await parseFixture()
    const header = rows()[0]!, accountColumn = header.indexOf('Account #')
    expect(document.records[1]!.cells[accountColumn]!.lexical).toBe('00001234')
    expect(result.accounts.map(account => account.accountMask.value)).toEqual(['1234', '5678'])
    expect(result.accounts.every(account => account.identifierQuality === 'FULL_RELIABLE')).toBe(true)
    expect(JSON.stringify(result.accounts)).not.toContain('00001234')
    expect(JSON.stringify(result.accounts)).not.toContain('00005678')
    expect(result.accounts[0]!.positions[0]!.cusip.value).toBe('001234567')
    expect(result.accounts[0]!.positions[0]!.marketValue.evidence).toContainEqual({ kind: 'CSV', record: 2, lineStart: 2, lineEnd: 2, column: header.indexOf('Value ($)'), header: 'Value ($)' })
  })

  it('distinguishes signed unrealized gain from cumulative return and preserves imported basis precedence', async () => {
    const { result } = await parseFixture()
    const equity = result.accounts[0]!.positions[0]!, fund = result.accounts[1]!.positions[0]!
    expect(equity.unrealizedGainLoss).toMatchObject({ value: '40', raw: ['40'], origin: 'IMPORTED' })
    expect(equity.unrealizedGainLossRatio.value).toBe('0.25')
    expect(equity.costBasis).toMatchObject({ value: null, availability: 'UNAVAILABLE', derivation: null })
    expect(fund.costBasis).toMatchObject({ value: '80', origin: 'IMPORTED', derivation: null })
    expect(fund.unrealizedGainLoss.value).toBe('20')
    expect(fund.accruedInterest.value).toBe('2.5')
    const matrix = rows()
    matrix[1]![matrix[0]!.indexOf('Unrealized Gain/Loss ($)')] = '-40'
    matrix[1]![matrix[0]!.indexOf('Unrealized Gain/Loss (%)')] = '-16.6667'
    const negative = (await parseFixture(buildCsvBytes(matrix))).result.accounts[0]!.positions[0]!
    expect(negative.unrealizedGainLoss.value).toBe('-40')
    expect(negative.unrealizedGainLossRatio.value).toBe('-0.166667')
  })

  it('classifies named cash programs independently of quantity while leaving noncash price-one basis missing', async () => {
    const { result } = await parseFixture()
    for (const cash of result.accounts[0]!.positions.slice(1)) {
      expect(cash.assetType.value).toBe('cash')
      expect(cash.assetType.interpretation).toMatchObject({ rule: expect.any(String), version: expect.any(String) })
    }
    expect(result.accounts[0]!.positions[1]!.quantity.value).toBeNull()
    expect(result.accounts[0]!.positions[3]!.quantity.value).toBeNull()
    const other = result.accounts[1]!.positions[1]!
    expect(other.assetType.value).toBe('other')
    expect(other.price.value).toBe('1')
    expect(other.costBasis.value).toBeNull()
  })

  it('takes dates from records and surfaces inconsistent or impossible dates without dropping holdings', async () => {
    const nextMonth = rows()
    for (const row of nextMonth.slice(1)) row[0] = '9/30/2026'
    expect((await parseFixture(buildCsvBytes(nextMonth))).result.accounts.map(account => account.asOfDate.value)).toEqual(['2026-09-30', '2026-09-30'])
    for (const badDate of ['9/1/2026', '2/30/2026']) {
      const matrix = rows(); matrix[2]![0] = badDate
      const { result } = await parseFixture(buildCsvBytes(matrix))
      expect(result.accounts.flatMap(account => account.positions)).toHaveLength(6)
      expect(result.findings.some(finding => finding.severity === 'BLOCKING' && finding.sourceRecords.includes(3))).toBe(true)
    }
  })

  it('accounts for each source record exactly once and remains deterministic without mutating reader evidence', async () => {
    const document = await reader(source), original = structuredClone(document)
    const matches = adapter.detect(document), first = adapter.parse(document, matches[0]!)
    expect(adapter.parse(document, matches[0]!)).toEqual(first)
    expect(document).toEqual(original)
    expect(first.dispositions.map(disposition => disposition.recordOrdinal).sort((a, b) => a - b)).toEqual(document.records.map(record => record.ordinal))
    expect(new Set(first.dispositions.map(disposition => disposition.recordOrdinal)).size).toBe(document.records.length)
    expect(first.dispositions.filter(disposition => disposition.role === 'POSITION')).toHaveLength(6)
    expect(first.dispositions.every(disposition => disposition.rule.trim().length > 0)).toBe(true)
  })

  it('rejects duplicate headers and truncated rows rather than losing a holding', async () => {
    const duplicate = rows().map((row, index) => [...row, index === 0 ? ' value ($) ' : '1'])
    const truncated = rows(); truncated[2]!.pop()
    for (const matrix of [duplicate, truncated]) {
      const document = await reader(buildCsvBytes(matrix))
      let rejected = false
      try {
        const matches = adapter.detect(document)
        rejected = matches.length === 0 || adapter.parse(document, matches[0]!).findings.some(finding => finding.severity === 'BLOCKING')
      } catch { rejected = true }
      expect(rejected).toBe(true)
    }
  })

  it('does not steal unrelated CSV layouts or interpret cumulative return as a gain-column alias', async () => {
    const unrelated = await reader(buildCsvBytes([['Symbol', 'Description', 'Market Value'], ['DEMO', 'Synthetic', '200']]))
    expect(adapter.detect(unrelated)).toEqual([])
    const matrix = rows(), gainColumn = matrix[0]!.indexOf('Unrealized Gain/Loss ($)')
    matrix[0]![gainColumn] = 'Synthetic unrelated return ($)'
    expect(adapter.detect(await reader(buildCsvBytes(matrix)))).toEqual([])
  })
})
