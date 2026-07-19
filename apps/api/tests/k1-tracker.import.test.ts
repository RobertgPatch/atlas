import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseTrackerWorkbook } from '../src/modules/k1-tracker/k1-tracker.import.js'

const parse = async (configure: (sheet: ExcelJS.Worksheet) => void) => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Basis rollforward')
  configure(sheet)
  return parseTrackerWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()))
}

describe('K1 Tracker workbook parser', () => {
  it('maps aliases, source cells, signed values, and normalized distribution decreases', async () => {
    const result = await parse((sheet) => {
      sheet.getCell('B1').value = 2024
      sheet.getCell('A2').value = 'line 1 - ordinary income'; sheet.getCell('B2').value = '125.50'
      sheet.getCell('A3').value = 'line 19 - distributions'; sheet.getCell('B3').value = '(10.00)'
    })
    const year = result.preview.sheets[0]!.years[0]!
    expect(year.state).toBe('POPULATED')
    expect(year.values).toContainEqual({ fieldKey: 'box_1_ordinary_income_loss', amount: '125.50', sourceCell: 'B2' })
    expect(year.values).toContainEqual({ fieldKey: 'box_19_distributions', amount: '10.00', sourceCell: 'B3' })
  })

  it('treats formula-only future columns as incomplete rather than populated', async () => {
    const result = await parse((sheet) => {
      sheet.getCell('B1').value = 2024; sheet.getCell('C1').value = 2025
      sheet.getCell('A2').value = 'line 1 - ordinary income'; sheet.getCell('B2').value = 12
      sheet.getCell('C2').value = { formula: 'B2', result: 12 }
    })
    expect(result.preview.sheets[0]!.years.map((year) => year.state)).toEqual(['POPULATED', 'FORMULA_ONLY'])
  })

  it('skips hidden sheets and reports unsupported visible sheets as warnings', async () => {
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Notes').getCell('A1').value = 'No tax years'
    const hidden = workbook.addWorksheet('Hidden'); hidden.state = 'hidden'; hidden.getCell('A1').value = 2024
    const result = await parseTrackerWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()))
    expect(result.preview.sheets).toHaveLength(0)
    expect(result.preview.warnings.join(' ')).toContain('Hidden sheet Hidden was skipped')
    expect(result.preview.warnings.join(' ')).toContain('No tax-year headers')
  })

  it('does not evaluate external or cached formulas as authoritative source input', async () => {
    const result = await parse((sheet) => {
      sheet.getCell('B1').value = 2024
      sheet.getCell('A2').value = 'line 1 - ordinary income'
      sheet.getCell('B2').value = { formula: "'[other.xlsx]Sheet1'!A1", result: 999 }
    })
    expect(result.preview.sheets[0]!.years[0]!.state).toBe('FORMULA_ONLY')
    expect(result.preview.sheets[0]!.years[0]!.values).toEqual([])
  })

  it('parses a 50-year worksheet within the preview performance budget', async () => {
    const startedAt = Date.now()
    const result = await parse((sheet) => {
      sheet.getCell('A2').value = 'line 1 - ordinary income'
      for (let column = 2; column <= 51; column += 1) { sheet.getCell(1, column).value = 1973 + column; sheet.getCell(2, column).value = column }
    })
    expect(result.preview.sheets[0]!.years).toHaveLength(50)
    expect(Date.now() - startedAt).toBeLessThan(5_000)
  })

  it('maps the CPA-approved workbook inputs while excluding its calculated future years', async () => {
    const buffer = await readFile(new URL('./fixtures/k1-tracker-basis-template.xlsx', import.meta.url))
    const result = await parseTrackerWorkbook(buffer)
    const sheet = result.preview.sheets[0]

    expect(sheet?.sheetName).toBe('AC Bell Investors, LLC')
    expect(sheet?.years.slice(0, 5).map((year) => year.state)).toEqual(['POPULATED', 'POPULATED', 'POPULATED', 'POPULATED', 'POPULATED'])
    expect(sheet?.years.slice(5).map((year) => year.state)).toEqual(['FORMULA_ONLY', 'FORMULA_ONLY', 'FORMULA_ONLY', 'FORMULA_ONLY', 'FORMULA_ONLY'])
    expect(sheet?.years[0]?.values).toContainEqual({ fieldKey: 'capital_contributions', amount: '3000000.00', sourceCell: 'B13' })
    expect(sheet?.years[0]?.values).toContainEqual({ fieldKey: 'box_1_ordinary_income_loss', amount: '-1067656.00', sourceCell: 'B30' })
    expect(sheet?.years[4]?.values).toContainEqual({ fieldKey: 'box_13_other_deductions', amount: '3226.00', sourceCell: 'F37' })
  })
})
