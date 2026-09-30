import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { morganStanleyHoldingsXlsxAdapter } from '../../src/modules/liquidity-statements/adapters/morgan-stanley/holdings-xlsx.js'
import { readXlsxStatement } from '../../src/modules/liquidity-statements/readers/xlsx.reader.js'
import expected from './fixtures/morgan-stanley/expected.json'
import { buildMorganStanleyHoldingsFixture } from './fixtures/morgan-stanley/holdings.fixture.js'
import { applyCorrections } from '../../src/modules/liquidity-statements/csv-review.service.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'
import { reconcileDraft } from '../../src/modules/liquidity-statements/csv/reconcile.js'
import type { StatementDraft } from '../../src/modules/liquidity-statements/liquidity-statement.types.js'

const config = buildLiquidityCsvConfig({ LIQUIDITY_XLSX_ENABLED: 'true' })
const fieldValue = (field: { value: string | null }) => field.value

describe('Morgan Stanley holdings XLSX adapter', () => {
  it('detects a complete account structurally without depending on a fixed header row', async () => {
    const bytes = buildMorganStanleyHoldingsFixture()
    const document = await readXlsxStatement(bytes, createHash('sha256').update(bytes).digest('hex'), config)
    expect(morganStanleyHoldingsXlsxAdapter.detect(document)).toEqual([{
      regionId: 'holdings:4-21', sheetId: document.sheets[0]?.id, recordStart: 2, recordEnd: 14,
    }])
  })

  it('extracts exact typed fields, adjusted-cost precedence, classifications and scoped controls', async () => {
    const bytes = buildMorganStanleyHoldingsFixture()
    const document = await readXlsxStatement(bytes, createHash('sha256').update(bytes).digest('hex'), config)
    const [match] = morganStanleyHoldingsXlsxAdapter.detect(document)
    expect(match).toBeDefined()
    const result = morganStanleyHoldingsXlsxAdapter.parse(document, match!)
    const account = result.accounts[0]!
    expect({
      occurrenceId: account.occurrenceId,
      displayName: fieldValue(account.displayName),
      accountMask: fieldValue(account.accountMask),
      identifierQuality: account.identifierQuality,
      asOfDate: fieldValue(account.asOfDate),
      asOfPrecision: account.asOfPrecision,
      positionCount: account.positions.length,
    }).toEqual(expected.account)

    expect(account.positions.map(position => ({
      row: position.description.evidence[0]?.kind === 'XLSX' ? position.description.evidence[0].row : null,
      symbol: fieldValue(position.symbol),
      assetType: fieldValue(position.assetType),
      costBasis: fieldValue(position.costBasis),
      basisSourceField: position.basisSourceField ?? null,
      gainRatio: fieldValue(position.unrealizedGainLossRatio),
      priceUnit: position.valuationConvention.priceUnit,
      quantityUnit: position.valuationConvention.quantityUnit,
    }))).toEqual(expected.positions)

    expect(result.controls.map(control => ({
      metric: control.metric,
      reported: fieldValue(control.reported),
      scope: control.scope.kind,
      count: control.scope.occurrenceIds.length,
    }))).toEqual(expected.controls)
  })

  it('keeps every selected record accountable and does not mistake a $1 other holding for cash', async () => {
    const bytes = buildMorganStanleyHoldingsFixture()
    const document = await readXlsxStatement(bytes, createHash('sha256').update(bytes).digest('hex'), config)
    const match = morganStanleyHoldingsXlsxAdapter.detect(document)[0]!
    const result = morganStanleyHoldingsXlsxAdapter.parse(document, match)
    const dispositionOrdinals = new Set(result.dispositions.map(item => item.recordOrdinal))
    const selected = document.records.filter(record => record.ordinal >= match.recordStart && record.ordinal <= match.recordEnd)
    expect(selected.every(record => dispositionOrdinals.has(record.ordinal))).toBe(true)
    expect(result.accounts[0]?.positions.find(position => position.symbol.value === 'PVT1')).toMatchObject({
      assetType: { value: 'other' },
      costBasis: { value: null, availability: 'UNAVAILABLE' },
    })
  })

  it('does not match a neighboring arbitrary workbook', async () => {
    const bytes = buildMorganStanleyHoldingsFixture()
    const document = await readXlsxStatement(bytes, createHash('sha256').update(bytes).digest('hex'), config)
    document.sheets[0]!.records = document.sheets[0]!.records.filter(record =>
      !record.cells.some(cell => cell.lexical === 'Market Value ($)'))
    document.records = document.sheets.flatMap(sheet => sheet.records)
    expect(morganStanleyHoldingsXlsxAdapter.detect(document)).toEqual([])
  })

  it('quantizes exact long XLSX numeric lexemes and treats N/A as absent', async () => {
    const bytes = buildMorganStanleyHoldingsFixture()
    const document = await readXlsxStatement(bytes, createHash('sha256').update(bytes).digest('hex'), config)
    const match = morganStanleyHoldingsXlsxAdapter.detect(document)[0]!
    const header = document.records.find(record => record.cells.some(cell => cell.lexical === 'Market Value ($)'))!
    const marketColumn = header.cells.find(cell => cell.lexical === 'Market Value ($)')!.column
    const dayRatioColumn = header.cells.find(cell => cell.lexical === "Today's Change (%)")!.column
    const position = document.records.find(record => record.ordinal > header.ordinal && record.cells.some(cell => cell.column === marketColumn && cell.type === 'NUMBER'))!
    position.cells.find(cell => cell.column === marketColumn)!.lexical = '123.456789012345'
    position.cells.find(cell => cell.column === dayRatioColumn)!.lexical = 'N/A'
    const parsed = morganStanleyHoldingsXlsxAdapter.parse(document, match).accounts[0]!.positions[0]!
    expect(parsed.marketValue).toMatchObject({ value: '123.45678901', availability: 'COMPLETE', interpretation: { rounding: 'HALF_AWAY_FROM_ZERO' } })
    expect(parsed.dayChangeRatio).toMatchObject({ value: null, availability: 'UNAVAILABLE', reason: 'NOT_PROVIDED' })
  })

  it('preserves original control comparison while a reasoned review changes the effective comparison',async()=>{
    const bytes=buildMorganStanleyHoldingsFixture()
    const document=await readXlsxStatement(bytes,createHash('sha256').update(bytes).digest('hex'),config)
    const match=morganStanleyHoldingsXlsxAdapter.detect(document)[0]!
    const parsed=morganStanleyHoldingsXlsxAdapter.parse(document,match)
    const draft:StatementDraft={
      schemaVersion:'3.0.0',adapter:{id:morganStanleyHoldingsXlsxAdapter.id,version:morganStanleyHoldingsXlsxAdapter.version},sourceHash:document.sourceHash,recipe:null,
      recordCounts:{total:document.records.length,positions:parsed.accounts[0]!.positions.length,controls:parsed.controls.length,metadata:0,headers:1,blanks:0,unsupported:0},
      accounts:parsed.accounts,controls:parsed.controls,issues:[],
    }
    const corrected=applyCorrections(draft,[{fieldPath:'accounts.0.positions.0.costBasis',value:'800',reason:'Verified adjusted basis correction'}])
    const reconciled=reconcileDraft(normalizeDraft(corrected,new Date(),true),true)
    const adjusted=parsed.controls.find(control=>control.metric==='ADJUSTED_COST')!
    expect(reconciled.accounts[draft.accounts[0]!.occurrenceId]!.controls).toContainEqual(expect.objectContaining({
      fieldPath:`controls.${adjusted.id}`,originalStatus:'MATCHED',effectiveStatus:'MISMATCH',reported:'1800',originalObserved:'1800',effectiveObserved:'1700',
    }))
  })
})
