import ExcelJS from 'exceljs'
import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'
import { buildCsvBytes, buildXlsxFixture, buildXlsxParts, buildZipFixture } from './fixture-builders.js'

describe('synthetic statement fixture builders', () => {
  it('preserves quoted CSV text, optional columns, leading zeroes and explicit encodings', () => {
    const rows = [['Symbol', 'Description', 'Account', 'Extra'], ['DEMO', 'Line one\n"Café", two', '00001234', '']]
    const bytes = buildCsvBytes(rows, { delimiter: ';', encoding: 'UTF16BE', bom: true })
    expect([...bytes.subarray(0, 2)]).toEqual([0xfe, 0xff])
    const text = new TextDecoder('utf-16be').decode(bytes)
    expect(parse(text, { delimiter: ';', bom: true })).toEqual(rows)
    expect(buildCsvBytes([['Value'], ['1.234567890123456789E+7']]).toString()).toBe('Value\r\n1.234567890123456789E+7')
  })

  it.each(['store', 'deflate'] as const)('writes deterministic valid %s XLSX packages with exact numeric lexemes', async compression => {
    const options = {
      compression,
      sheets: [{ name: 'Synthetic holdings', rows: [{ index: 1, cells: [
        { address: 'A1', kind: 'number' as const, value: '9007199254740993.123456789' },
        { address: 'B1', kind: 'number' as const, value: '-1.234567890123456789E-7' },
        { address: 'C1', kind: 'inlineString' as const, value: 'A < B & "quoted"' },
      ] }] }],
    }
    const parts = buildXlsxParts(options)
    const sheet = String(parts.find(part => part.name === 'xl/worksheets/sheet1.xml')!.data)
    expect(sheet).toContain('<v>9007199254740993.123456789</v>')
    expect(sheet).toContain('<v>-1.234567890123456789E-7</v>')
    expect(sheet).toContain('A &lt; B &amp; "quoted"')
    const bytes = buildXlsxFixture(options)
    expect(buildXlsxFixture(options)).toEqual(bytes)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0])
    expect(workbook.worksheets[0]!.getCell('C1').value).toBe('A < B & "quoted"')
  })

  it('represents sparse, hidden, shared/rich string and cached formula source shapes', async () => {
    const bytes = buildXlsxFixture({
      date1904: true,
      sharedStrings: ['00001234', { runs: ['Synthetic ', 'fund'] }],
      sheets: [{
        name: 'Synthetic hidden', visibility: 'veryHidden', dimension: 'A1:XFD1048576',
        rows: [{ index: 8, hidden: true, cells: [
          { address: 'A8', kind: 'sharedString', index: 0 },
          { address: 'C8', kind: 'sharedString', index: 1 },
          { address: 'E8', kind: 'formula', formula: 'SUM(1,2)', cached: { kind: 'number', value: '3.0000000000000001' } },
          { address: 'G8', kind: 'formula', formula: 'NA()', cached: { kind: 'error', value: '#N/A' } },
          { address: 'J8', kind: 'number', value: '0.125', style: 1 },
        ] }],
        merges: ['A1:B1'], autoFilter: 'A8:J8',
      }],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0])
    const sheet = workbook.worksheets[0]!
    expect(workbook.properties.date1904).toBe(true)
    expect(sheet.state).toBe('veryHidden')
    expect(sheet.getRow(8).hidden).toBe(true)
    expect(sheet.getCell('A8').value).toBe('00001234')
    expect(sheet.getCell('C8').text).toBe('Synthetic fund')
    expect(sheet.getCell('E8').value).toMatchObject({ formula: 'SUM(1,2)' })
    expect(sheet.getCell('G8').value).toMatchObject({ result: { error: '#N/A' } })
    expect(sheet.getCell('J8').numFmt).toBe('0.00%')
  })

  it('allows explicit raw package anomalies without silently repairing test input', () => {
    const parts = [{ name: '../unexpected.xml', data: '<broken>' }, { name: '../unexpected.xml', data: 'second' }]
    const bytes = buildZipFixture(parts)
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304')
    expect(bytes.includes(Buffer.from('<broken>'))).toBe(true)
    expect(bytes.readUInt16LE(bytes.length - 12)).toBe(2)
  })

  it('rejects numeric JS input so fixtures cannot silently round authoritative tokens', () => {
    expect(() => buildXlsxFixture({ sheets: [{ name: 'Synthetic', rows: [{ index: 1, cells: [
      { address: 'A1', kind: 'number', value: 9007199254740992 as unknown as string },
    ] }] }] })).toThrow('Numeric fixture values must be lexical strings')
  })
})
