import { describe, expect, it } from 'vitest'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { readXlsxStatement } from '../../src/modules/liquidity-statements/readers/xlsx.reader.js'
import {
  buildXlsxFixture,
  buildXlsxParts,
  buildZipFixture,
  fixtureStylesXml,
} from './adapter-conformance/fixture-builders.js'

const config = buildLiquidityCsvConfig({ LIQUIDITY_XLSX_ENABLED: 'true' })
const hash = 'a'.repeat(64)

describe('bounded typed XLSX reader', () => {
  it('preserves shared, inline and rich strings plus sparse typed coordinates', async () => {
    const bytes = buildXlsxFixture({
      sharedStrings: ['Shared', { runs: ['Rich ', 'Text'] }],
      sheets: [{ name: 'Holdings', rows: [
        { index: 2, cells: [
          { address: 'A2', kind: 'sharedString', index: 0 },
          { address: 'C2', kind: 'sharedString', index: 1 },
          { address: 'F2', kind: 'inlineString', value: '  Inline  ' },
          { address: 'H2', kind: 'boolean', value: true },
          { address: 'J2', kind: 'error', value: '#N/A' },
        ] },
      ] }],
    })

    const document = await readXlsxStatement(bytes, hash, config)

    expect(document.kind).toBe('XLSX')
    expect(document.sourceHash).toBe(hash)
    expect(document.sheets[0]?.records[0]?.cells).toEqual([
      expect.objectContaining({ address: 'A2', column: 1, type: 'TEXT', lexical: 'Shared' }),
      expect.objectContaining({ address: 'C2', column: 3, type: 'TEXT', lexical: 'Rich Text' }),
      expect.objectContaining({ address: 'F2', column: 6, type: 'TEXT', lexical: '  Inline  ' }),
      expect.objectContaining({ address: 'H2', column: 8, type: 'BOOLEAN', lexical: 'true' }),
      expect.objectContaining({ address: 'J2', column: 10, type: 'ERROR', lexical: '#N/A' }),
    ])
    expect(document.sheets[0]?.records[0]?.location).toEqual(expect.objectContaining({
      kind: 'XLSX', sheetName: 'Holdings', row: 2,
    }))
  })

  it('keeps exact numeric lexemes, styles, visibility, merges, filters and global ordinals', async () => {
    const bytes = buildXlsxFixture({ sheets: [
      {
        name: 'Visible', dimension: 'A1:XFD1048576', merges: ['A1:B1'], autoFilter: 'A1:D9',
        rows: [{ index: 1, cells: [
          { address: 'A1', kind: 'number', value: '9007199254740993.12500000', style: 3 },
          { address: 'B1', kind: 'number', value: '0.131234567890123456', style: 1 },
        ] }],
      },
      {
        name: 'Hidden', visibility: 'hidden',
        rows: [{ index: 7, hidden: true, cells: [{ address: 'D7', kind: 'number', value: '-0.000000005' }] }],
      },
      { name: 'Very Hidden', visibility: 'veryHidden', rows: [] },
    ] })

    const document = await readXlsxStatement(bytes, hash, config)

    expect(document.sheets.map(sheet => sheet.visibility)).toEqual(['VISIBLE', 'HIDDEN', 'VERY_HIDDEN'])
    expect(document.records.map(record => record.ordinal)).toEqual([1, 2])
    expect(document.records[0]?.cells).toEqual([
      expect.objectContaining({ address: 'A1', lexical: '9007199254740993.12500000', styleId: 3, numberFormat: '0.00000000', mergeAnchor: 'A1' }),
      expect.objectContaining({ address: 'B1', lexical: '0.131234567890123456', styleId: 1, numberFormat: '0.00%', mergeAnchor: 'A1' }),
    ])
    expect(document.records[1]?.location).toEqual(expect.objectContaining({ sheetName: 'Hidden', row: 7, hidden: true }))
    expect(document.resources.populatedCells).toBe(3)
  })

  it.each([
    { date1904: false, serial: '1', expected: '1900-01-01' },
    { date1904: false, serial: '59', expected: '1900-02-28' },
    { date1904: false, serial: '60', expected: null },
    { date1904: false, serial: '61', expected: '1900-03-01' },
    { date1904: true, serial: '0', expected: '1904-01-01' },
  ])('records date-system semantics without silently normalizing serial $serial', async ({ date1904, serial, expected }) => {
    const document = await readXlsxStatement(buildXlsxFixture({
      date1904,
      sheets: [{ name: 'Dates', rows: [{ index: 1, cells: [{ address: 'A1', kind: 'number', value: serial, style: 2 }] }] }],
    }), hash, config)
    const cell = document.records[0]?.cells[0] as (typeof document.records[number]['cells'][number] & {
      interpretedDate?: string | null
      dateError?: string | null
    }) | undefined

    expect(document.sheets[0]?.dateSystem).toBe(date1904 ? '1904' : '1900')
    expect(cell).toEqual(expect.objectContaining({ lexical: serial, numberFormat: 'yyyy-mm-dd' }))
    expect(cell?.interpretedDate ?? null).toBe(expected)
    expect(cell?.dateError ?? null).toBe(serial === '60' ? 'EXCEL_1900_LEAP_DAY' : null)
  })

  it('never evaluates formulas and distinguishes cached, missing, error and external formulas', async () => {
    const document = await readXlsxStatement(buildXlsxFixture({ sheets: [{ name: 'Formulae', rows: [
      { index: 1, cells: [
        { address: 'A1', kind: 'formula', formula: '1+1', cached: { kind: 'number', value: '2.0000000000000001' } },
        { address: 'B1', kind: 'formula', formula: 'SUM(A1:A9)' },
        { address: 'C1', kind: 'formula', formula: '1/0', cached: { kind: 'error', value: '#DIV/0!' } },
        { address: 'D1', kind: 'formula', formula: "'[1]Sheet1'!A1", cached: { kind: 'number', value: '9' } },
      ] },
    ] }] }), hash, config)

    expect(document.records[0]?.cells).toEqual([
      expect.objectContaining({ formula: '1+1', lexical: '2.0000000000000001', formulaCache: 'SCALAR' }),
      expect.objectContaining({ formula: 'SUM(A1:A9)', lexical: null, formulaCache: 'MISSING' }),
      expect.objectContaining({ formula: '1/0', lexical: '#DIV/0!', formulaCache: 'ERROR' }),
      expect.objectContaining({ formula: "'[1]Sheet1'!A1", lexical: '9', formulaCache: 'EXTERNAL' }),
    ])
  })

  it('rejects duplicate coordinates and absurd coordinates instead of allocating from dimensions', async () => {
    const duplicate = buildXlsxFixture({ sheets: [{ name: 'Bad', rows: [{ index: 1, cells: [
      { address: 'A1', kind: 'number', value: '1' }, { address: 'A1', kind: 'number', value: '2' },
    ] }] }] })
    await expect(readXlsxStatement(duplicate, hash, config)).rejects.toMatchObject({ code: 'XLSX_DUPLICATE_CELL' })

    const parts = buildXlsxParts({ sheets: [{ name: 'Bad', rows: [] }], stylesXml: fixtureStylesXml })
    const index = parts.findIndex(part => part.name === 'xl/worksheets/sheet1.xml')
    parts[index] = { name: 'xl/worksheets/sheet1.xml', data: '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:XFD1048576"/><sheetData><row r="1"><c r="XFE1"><v>1</v></c></row></sheetData></worksheet>' }
    await expect(readXlsxStatement(buildZipFixture(parts), hash, config)).rejects.toMatchObject({ code: 'XLSX_CELL_ADDRESS_INVALID' })
  })
})
