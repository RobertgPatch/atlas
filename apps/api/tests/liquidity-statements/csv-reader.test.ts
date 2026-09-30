import { describe, expect, it } from 'vitest'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { readCsvStatement } from '../../src/modules/liquidity-statements/readers/csv.reader.js'
import { buildCsvBytes } from './adapter-conformance/fixture-builders.js'

const config = buildLiquidityCsvConfig({})
const hash = 'b'.repeat(64)

describe('typed CSV reader', () => {
  it('preserves arrays, BOM, delimiter, blank fields and physical quoted-newline spans', async () => {
    const bytes = buildCsvBytes([
      ['Statement for', 'Synthetic Account'],
      ['Symbol', 'Description', 'Value'],
      ['DEMO', 'Line one\nLine "two", text', '9007199254740993.12500000'],
      ['', '', ''],
    ], { bom: true, delimiter: ';', finalNewline: true })

    const document = await readCsvStatement(bytes, hash, config, { delimiter: ';' })

    expect(document.kind).toBe('CSV')
    expect(document.sourceHash).toBe(hash)
    expect(document.records.map(record => record.ordinal)).toEqual([1, 2, 3, 4])
    expect(document.records[2]?.location).toEqual({ kind: 'CSV', record: 3, lineStart: 3, lineEnd: 4, column: null, header: null })
    expect(document.records[2]?.cells.map(cell => cell.lexical)).toEqual([
      'DEMO', 'Line one\nLine "two", text', '9007199254740993.12500000',
    ])
    expect(document.records[3]?.role).toBe('BLANK')
  })

  it('allows variable declared metadata widths without dropping or padding cells', async () => {
    const bytes = buildCsvBytes([
      ['Account', '1234'],
      ['As of', '2026-09-21', 'USD'],
      ['Symbol', 'Value'],
      ['DEMO', '100.00'],
    ])
    const document = await readCsvStatement(bytes, hash, config)
    expect(document.records.map(record => record.cells.length)).toEqual([2, 3, 2, 2])
    expect(document.records.flatMap(record => record.cells).every(cell => cell.address === null)).toBe(true)
  })

  it.each([
    Buffer.from('A,B\n"unterminated'),
    Buffer.from('A,B\n1,2\n3,"broken"tail'),
  ])('rejects malformed input and never skips the offending record', async bytes => {
    await expect(readCsvStatement(bytes, hash, config)).rejects.toMatchObject({ code: 'MALFORMED_CSV' })
  })

  it('enforces independent record, field, column and record-count limits', async () => {
    await expect(readCsvStatement(Buffer.from(`A\n${'x'.repeat(9)}`), hash, { ...config, maxFieldBytes: 8 }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(readCsvStatement(Buffer.from('A,B,C'), hash, { ...config, maxColumns: 2 }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(readCsvStatement(Buffer.from('A\nB\nC'), hash, { ...config, maxRows: 1, maxMetadataRecords: 1 }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })
})
