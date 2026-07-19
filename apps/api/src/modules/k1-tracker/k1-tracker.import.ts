import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import type { K1TrackerFieldKey, K1TrackerImportPreview, K1TrackerMoney } from './k1-tracker.contracts.js'
import { moneyToCents, centsToMoney } from './k1-tracker.calculation.js'
import { trackerFieldByK1Alias, trackerFieldByWorkbookLabel, trackerFields } from './k1-tracker.field-map.js'

const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const yearFrom = (value: unknown): number | null => {
  const match = cellText(value as ExcelJS.CellValue).match(/(?<!\d)(?:19|20)\d{2}(?!\d)/)
  return match ? Number(match[0]) : null
}
const cellText = (value: ExcelJS.CellValue): string => {
  if (value == null) return ''
  if (typeof value === 'object' && 'result' in value && value.result != null) return String(value.result)
  if (typeof value === 'object' && 'text' in value) return String(value.text)
  return String(value)
}
const isFormulaCell = (value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue =>
  typeof value === 'object' && value != null && ('formula' in value || 'sharedFormula' in value)

const isStandaloneNumericFormula = (value: ExcelJS.CellValue): boolean =>
  typeof value === 'object'
  && value != null
  && 'formula' in value
  && typeof value.formula === 'string'
  && /^[\d\s()+\-*/.]+$/.test(value.formula)

export interface ParsedTrackerWorkbook {
  preview: Omit<K1TrackerImportPreview, 'importBatchId' | 'expiresAt' | 'proposedPartnershipId'>
}

export const hashTrackerWorkbook = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex')

export const parseTrackerWorkbook = async (buffer: Buffer): Promise<ParsedTrackerWorkbook> => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  const warnings: string[] = []
  const sheets: K1TrackerImportPreview['sheets'] = []

  for (const sheet of workbook.worksheets) {
    const years = new Map<number, number>()
    const firstRows = Math.min(sheet.rowCount, 12)
    for (let row = 1; row <= firstRows; row += 1) {
      sheet.getRow(row).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const year = yearFrom(cellText(cell.value))
        if (year) years.set(year, columnNumber)
      })
    }
    if (sheet.state === 'hidden' || sheet.state === 'veryHidden') {
      warnings.push(`Hidden sheet ${sheet.name} was skipped.`)
      continue
    }
    if (!years.size) {
      warnings.push(`No tax-year headers were detected on sheet ${sheet.name}.`)
      continue
    }

    const detected = [...years.entries()].map(([taxYear, column]) => {
      const values: Array<{ fieldKey: K1TrackerFieldKey; amount: K1TrackerMoney | null; sourceCell: string }> = []
      let formulaInputCount = 0
      for (let row = 1; row <= sheet.rowCount; row += 1) {
        const label = normalize(cellText(sheet.getCell(row, 1).value))
        const field = trackerFieldByWorkbookLabel.get(label)
          ?? trackerFieldByK1Alias.get(label)
          ?? trackerFields.find((candidate) => normalize(candidate.label) === label)
        if (!field) continue
        const cell = sheet.getCell(row, column)
        if (isFormulaCell(cell.value) && !isStandaloneNumericFormula(cell.value)) {
          formulaInputCount += 1
          continue
        }
        const raw = cellText(cell.value)
        if (!raw) continue
        const cents = moneyToCents(raw)
        if (raw && cents == null) {
          warnings.push(`${sheet.name}!${cell.address} for ${field.label} is not a numeric value.`)
          continue
        }
        const normalizedCents = cents == null
          ? null
          : field.signed && label.includes('loss') && cents > 0n
            ? -cents
            : (field.role === 'deduction' || field.role === 'distribution') && cents < 0n
              ? -cents
              : cents
        values.push({ fieldKey: field.key, amount: centsToMoney(normalizedCents), sourceCell: cell.address })
      }
      const populated = values.filter((value) => value.amount != null)
      return {
        taxYear,
        state: populated.length ? 'POPULATED' as const : formulaInputCount ? 'FORMULA_ONLY' as const : 'BLANK' as const,
        mappedFieldCount: populated.length,
        conflicts: [],
        warnings: populated.length ? [] : [formulaInputCount ? 'Only formulas were found; no source input values will be imported.' : 'No mapped input values were found for this year.'],
        values,
      }
    })
    sheets.push({
      sheetName: sheet.name,
      proposedPartnershipName: sheet.name,
      proposedPartnershipId: null,
      years: detected,
    })
  }

  if (!sheets.length) warnings.push('The workbook did not contain a supported year-column layout.')
  return {
    preview: {
      workbookHash: hashTrackerWorkbook(buffer),
      sheets,
      warnings,
    },
  }
}
