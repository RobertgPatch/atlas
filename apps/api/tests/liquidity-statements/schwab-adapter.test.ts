import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { AdapterResult, StatementAdapter } from '../../src/modules/liquidity-statements/adapters/adapter.types.js'
import type { StatementDocument } from '../../src/modules/liquidity-statements/statement-document.types.js'
import type { StatementPosition } from '../../src/modules/liquidity-statements/liquidity-statement.types.js'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { readCsvStatement } from '../../src/modules/liquidity-statements/readers/csv.reader.js'
import { buildCsvBytes } from './adapter-conformance/fixture-builders.js'

const config = buildLiquidityCsvConfig({})
const fixtureUrl = new URL('./fixtures/schwab/positions.csv', import.meta.url)
const expected = JSON.parse(await readFile(new URL('./fixtures/schwab/expected.json', import.meta.url), 'utf8'))

// T035 is test-first. Import outside failure assertions so a missing T041
// implementation cannot accidentally satisfy an invalid-input expectation.
async function adapter(): Promise<StatementAdapter> {
  const modulePath = '../../src/modules/liquidity-statements/adapters/charles-schwab/positions-csv.js'
  const module = await import(modulePath) as { charlesSchwabPositionsCsvAdapter?: StatementAdapter }
  expect(module.charlesSchwabPositionsCsvAdapter).toBeDefined()
  return module.charlesSchwabPositionsCsvAdapter!
}

async function document(input?: Buffer): Promise<StatementDocument> {
  const bytes = input ?? await readFile(fixtureUrl)
  return readCsvStatement(bytes, createHash('sha256').update(bytes).digest('hex'), config)
}
async function rows(): Promise<string[][]> {
  return (await document()).records.map(record => record.cells.map(cell => cell.lexical ?? ''))
}
function parse(subject: StatementAdapter, source: StatementDocument): AdapterResult {
  const matches = subject.detect(source)
  expect(matches).toHaveLength(1)
  const match = matches[0]!
  return subject.parse(source, { ...match, adapterId: subject.id, adapterVersion: subject.version, custodianKey: subject.custodianKey })
}
function positionProjection(position: StatementPosition) {
  return {
    sourceRecord: position.sourceRecord,
    symbol: position.symbol.value,
    description: position.description.value,
    assetType: position.assetType.value,
    sourceAssetType: position.sourceAssetType.value,
    quantity: position.quantity.value,
    price: position.price.value,
    marketValue: position.marketValue.value,
    costBasis: position.costBasis.value,
    basisAvailability: position.costBasis.availability,
    gain: position.unrealizedGainLoss.value,
    gainRatio: position.unrealizedGainLossRatio.value,
    dayChange: position.dayChange.value,
    dayChangeRatio: position.dayChangeRatio.value,
  }
}

describe('Charles Schwab positions CSV adapter contract', () => {
  it('loads the synthetic fixture with independently specified row widths and record locations', async () => {
    const source = await document()
    expect(source.records.map(record => record.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(source.records.map(record => record.cells.length)).toEqual([1, 1, 11, 11, 11, 11, 11, 11, 11, 11])
    expect(source.records[3]!.cells[1]!.lexical).toBe('Synthetic, first equity lot')
    expect(source.records[5]!.cells[5]!.lexical).toBe('Incomplete')
    expect(source.records[9]!.cells[4]!.lexical).toBe('$1,525.00')
    expect(source.records[9]!.location).toMatchObject({ kind: 'CSV', record: 10, lineStart: 10, lineEnd: 10 })
  })

  it('matches the registered export family and independently authored golden holdings', async () => {
    const subject = await adapter()
    expect(subject).toMatchObject(expected.adapter)
    const result = parse(subject, await document())
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]!.positions.map(positionProjection)).toEqual(expected.positions)
    expect(result.findings.filter(finding => finding.severity === 'BLOCKING')).toEqual([])
  })

  it('extracts masked title metadata and never fingerprints a last-four-only account', async () => {
    const result = parse(await adapter(), await document())
    const account = result.accounts[0]!
    expect({
      identifierQuality: account.identifierQuality, identifierFingerprints: account.identifierFingerprints,
      accountMaskSuffix: String(account.accountMask.value).slice(-4),
      asOfDate: account.asOfDate.value, asOfAt: account.asOfAt.value, sourceZone: account.sourceZone.value,
      asOfPrecision: account.asOfPrecision, completeness: account.completeness,
    }).toEqual(expected.account)
    expect(account.displayName.value).toContain('Synthetic Living Trust')
    expect(account.sourceSections.length).toBeGreaterThan(0)
    expect(account.asOfDate.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'CSV', record: 1, lineStart: 1, lineEnd: 1 })]))
  })

  it('preserves explicit type, basis, day change, percentage meaning and CSV provenance', async () => {
    const result = parse(await adapter(), await document())
    const position = result.accounts[0]!.positions[0]!
    expect(position.costBasis).toMatchObject({ value: '1000', origin: 'IMPORTED', raw: ['$1,000.00'], derivation: null })
    expect(position.costBasis.evidence).toContainEqual(expect.objectContaining({ kind: 'CSV', record: 4, lineStart: 4, lineEnd: 4, column: 5, header: 'Cost Basis' }))
    expect(position.dayChange).toMatchObject({ value: '-12.5', origin: 'IMPORTED', raw: ['($12.50)'], derivation: null })
    expect(position.dayChange.evidence).toContainEqual(expect.objectContaining({ kind: 'CSV', record: 4, column: 8, header: 'Day Chng $ (Day Change $)' }))
    expect(position.sourceAssetType).toMatchObject({ value: 'Equity', origin: 'IMPORTED', raw: ['Equity'] })
    expect(position.assetType.interpretation).toMatchObject({ rule: expect.any(String), version: expect.any(String), sourceFields: expect.arrayContaining(['Asset Type']) })
    expect(position.unrealizedGainLossRatio).toMatchObject({ value: '-0.2', raw: ['-20.00%'], derivation: null })
    expect(position.unrealizedGainLossRatio.interpretation).toMatchObject({ rule: expect.any(String), version: expect.any(String) })
    expect(position.dayChangeRatio.value).toBe('-0.0154')
  })

  it('does not turn explicit incomplete basis into complete derived basis despite usable gain and percentage', async () => {
    const result = parse(await adapter(), await document())
    const position = result.accounts[0]!.positions.find(position => position.symbol.value === 'INC')!
    expect(position.costBasis).toMatchObject({ value: null, availability: 'INCOMPLETE', raw: ['Incomplete'], reason: 'INCOMPLETE_SOURCE', derivation: null })
    expect(position.unrealizedGainLoss.value).toBe('20')
    expect(position.unrealizedGainLossRatio.value).toBe('0.25')
  })

  it('retains negative gain, explicit zero basis and zero day change as reported values', async () => {
    const result = parse(await adapter(), await document())
    expect(result.accounts[0]!.positions[0]!.unrealizedGainLoss.value).toBe('-200')
    const zero = result.accounts[0]!.positions.find(position => position.symbol.value === 'ZERO')!
    expect(zero.costBasis).toMatchObject({ value: '0', availability: 'COMPLETE', origin: 'IMPORTED' })
    expect(zero.dayChange).toMatchObject({ value: '0', availability: 'COMPLETE' })
    expect(zero.dayChangeRatio).toMatchObject({ value: '0', availability: 'COMPLETE' })
    expect(zero.unrealizedGainLossRatio.value).toBeNull()
  })

  it('preserves repeated symbol occurrences without aggregating, deduplicating or inventing transactions', async () => {
    const result = parse(await adapter(), await document())
    const occurrences = result.accounts[0]!.positions.filter(position => position.symbol.value === 'DEMO')
    expect(occurrences).toHaveLength(2)
    expect(new Set(occurrences.map(position => position.occurrenceId)).size).toBe(2)
    expect(occurrences.map(position => [position.sourceRecord, position.quantity.value, position.costBasis.value]))
      .toEqual([[4, '10', '1000'], [5, '5', '350']])
  })

  it('recognizes explicit cash but leaves absent quantity/price/basis for shared normalization', async () => {
    const result = parse(await adapter(), await document())
    const cash = result.accounts[0]!.positions.find(position => position.description.value === 'Cash & Cash Investments')!
    expect(cash.assetType.value).toBe('cash')
    expect(cash.marketValue.value).toBe('125')
    expect(cash.symbol).toMatchObject({ value: null, availability: 'NOT_APPLICABLE' })
    for (const field of [cash.quantity, cash.price, cash.costBasis]) expect(field.value).toBeNull()
    expect(result.accounts[0]!.positions.find(position => position.symbol.value === 'SWEEP')!.assetType.value).toBe('cash')
  })

  it('accounts for every source record once and never treats the account total as a holding', async () => {
    const source = await document()
    const result = parse(await adapter(), source)
    expect(result.dispositions.map(({ recordOrdinal, role }) => ({ recordOrdinal, role }))).toEqual(expected.dispositions)
    expect(new Set(result.dispositions.map(disposition => disposition.recordOrdinal)).size).toBe(source.records.length)
    expect(result.dispositions.every(disposition => disposition.rule.trim().length > 0)).toBe(true)
    expect(result.accounts[0]!.positions.map(position => position.sourceRecord)).toEqual([4, 5, 6, 7, 8, 9])
  })

  it('emits an independently scoped complete market-value control with real footer evidence', async () => {
    const result = parse(await adapter(), await document())
    const account = result.accounts[0]!
    const control = result.controls.find(control => control.metric === 'MARKET_VALUE')!
    expect(control).toBeDefined()
    expect(control.accountOccurrenceId).toBe(account.occurrenceId)
    expect({
      metric: control.metric, currency: control.currency, reported: control.reported.value,
      scopeKind: control.scope.kind, operandField: control.scope.operandField,
      sourceRecord: control.location.kind === 'CSV' ? control.location.record : null,
      memberSourceRecords: control.scope.occurrenceIds.map(id => account.positions.find(position => position.occurrenceId === id)?.sourceRecord).sort((a, b) => a! - b!),
      tolerance: control.tolerance,
    }).toEqual(expected.marketValueControl)
    expect(control.location).toMatchObject({ kind: 'CSV', lineStart: 10, lineEnd: 10, column: 4, header: 'Mkt Val (Market Value)' })
    expect(control.scope).toMatchObject({ rule: expect.any(String), version: expect.any(String) })
    expect(result.controls.filter(control => control.metric !== 'MARKET_VALUE').every(control => control.reported.availability !== 'COMPLETE')).toBe(true)
  })

  it('preserves complete reported basis and gain controls when all positions support their scope', async () => {
    const subject = await adapter()
    const original = await rows()
    const selected = [original[0]!, original[1]!, original[2]!, original[3]!, original[4]!, original[6]!,
      ['Positions Total', '', '', '', '$1,225.00', '$1,350.00', '($125.00)', '', '', '', '']]
    const result = parse(subject, await document(buildCsvBytes(selected)))
    const account = result.accounts[0]!
    for (const [metric, reported, operandField] of [['MARKET_VALUE', '1225', 'marketValue'], ['COST_BASIS', '1350', 'costBasis'], ['GAIN', '-125', 'unrealizedGainLoss']]) {
      const control = result.controls.find(control => control.metric === metric)!
      expect(control).toMatchObject({ accountOccurrenceId: account.occurrenceId, currency: 'USD', reported: { value: reported, availability: 'COMPLETE', origin: 'IMPORTED' }, scope: { kind: 'COMPLETE_ACCOUNT', operandField } })
      expect(new Set(control.scope.occurrenceIds)).toEqual(new Set(account.positions.map(position => position.occurrenceId)))
    }
  })

  it('keeps a footer control informational when Schwab does not declare which missing-basis rows it covers', async () => {
    const subject = await adapter()
    const original = await rows()
    original[9]![5] = '$9,999.00'
    const result = parse(subject, await document(buildCsvBytes(original)))
    const control = result.controls.find(candidate => candidate.metric === 'COST_BASIS')!
    expect(control).toMatchObject({ reported: { availability: 'COMPLETE' }, scope: { kind: 'UNKNOWN', occurrenceIds: [], rule: 'SCHWAB_UNDECLARED_PARTIAL_CONTROL' } })
  })

  it('accepts reordered supported columns and irrelevant extras without changing financial meaning', async () => {
    const subject = await adapter()
    const original = await rows()
    const order = [10, 4, 0, 5, 3, 2, 1, 9, 8, 7, 6]
    const reordered = original.map((row, index) => index < 2 ? row : [...order.map(column => row[column]!), index === 2 ? 'Unrecognized Supporting Column' : 'synthetic-extra'])
    const result = parse(subject, await document(buildCsvBytes(reordered)))
    expect(result.accounts[0]!.positions.map(positionProjection)).toEqual(expected.positions)
    expect(result.findings.filter(finding => finding.severity === 'BLOCKING')).toEqual([])
  })

  it('accepts absent optional day-change columns without substituting zero', async () => {
    const subject = await adapter()
    const original = await rows()
    const sparse = original.map((row, index) => index < 2 ? row : row.filter((_, column) => column !== 8 && column !== 9))
    const result = parse(subject, await document(buildCsvBytes(sparse)))
    expect(result.accounts[0]!.positions).toHaveLength(6)
    for (const position of result.accounts[0]!.positions) {
      expect(position.dayChange).toMatchObject({ value: null, availability: 'UNAVAILABLE' })
      expect(position.dayChangeRatio).toMatchObject({ value: null, availability: 'UNAVAILABLE' })
    }
    expect(result.findings.filter(finding => finding.severity === 'BLOCKING')).toEqual([])
  })

  it('allows an absent source total without inventing one or blocking the complete account', async () => {
    const subject = await adapter()
    const result = parse(subject, await document(buildCsvBytes((await rows()).slice(0, -1))))
    expect(result.accounts[0]!.positions).toHaveLength(6)
    expect(result.controls).toEqual([])
    expect(result.findings.filter(finding => finding.severity === 'BLOCKING')).toEqual([])
  })

  it('finds the title and header structurally after additional blank preamble rows', async () => {
    const subject = await adapter()
    const original = await rows()
    const result = parse(subject, await document(buildCsvBytes([[''], ...original])))
    expect(result.accounts[0]!.asOfDate.value).toBe(expected.account.asOfDate)
    expect(result.accounts[0]!.positions.map(position => ({ ...positionProjection(position), sourceRecord: position.sourceRecord - 1 }))).toEqual(expected.positions)
    expect(result.dispositions).toHaveLength(original.length + 1)
  })

  it('uses the declared Eastern source zone in winter rather than a fixed UTC offset', async () => {
    const subject = await adapter()
    const original = await rows()
    original[0] = ['Positions for account Synthetic Living Trust ...7412 as of 01/15/2026 04:00 PM ET']
    const result = parse(subject, await document(buildCsvBytes(original)))
    expect(result.accounts[0]!).toMatchObject({ asOfDate: { value: '2026-01-15' }, asOfAt: { value: '2026-01-15T21:00:00.000Z' }, sourceZone: { value: 'America/New_York' }, asOfPrecision: 'INSTANT' })
  })

  it('blocks an unexpected numeric footer instead of silently dropping or importing it', async () => {
    const subject = await adapter()
    const original = await rows()
    const unexpected = ['Unrecognized transfer summary', '', '1', '$9.00', '$9.00', '$8.00', '$1.00', '12.50%', '', '', 'Equity']
    const result = parse(subject, await document(buildCsvBytes([...original, unexpected])))
    expect(result.accounts[0]!.positions.map(positionProjection)).toEqual(expected.positions)
    expect(result.dispositions).toContainEqual(expect.objectContaining({ recordOrdinal: 11, role: 'UNSUPPORTED', rule: expect.any(String) }))
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_RECORD', severity: 'BLOCKING', sourceRecords: expect.arrayContaining([11]) }))
  })

  it('does not recognize a transaction export merely because familiar stock symbols appear', async () => {
    const subject = await adapter()
    const source = await document(buildCsvBytes([
      ['Transactions for account Synthetic ...7412'],
      ['Date', 'Action', 'Symbol', 'Quantity', 'Price', 'Amount'],
      ['09/21/2026', 'Buy', 'DEMO', '10', '$80.00', '$800.00'],
    ]))
    expect(subject.detect(source)).toEqual([])
  })

  it('has deterministic pure detection and parsing without mutating source records', async () => {
    const subject = await adapter()
    const source = await document()
    const original = structuredClone(source)
    const first = parse(subject, source)
    expect(parse(subject, source)).toEqual(first)
    expect(source).toEqual(original)
  })
})
