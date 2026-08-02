export type CsvCell = string | number | boolean | null | undefined

const startsSpreadsheetFormula = (value: string): boolean =>
  /^[\t\r\n ]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)

/**
 * Escapes a CSV cell and neutralizes spreadsheet formula prefixes in strings.
 * Numeric values remain numeric, including legitimate negative numbers.
 */
export const escapeCsvCell = (value: CsvCell): string => {
  if (value == null) return ''

  let text = String(value)
  if (typeof value === 'string' && startsSpreadsheetFormula(text)) {
    text = `'${text}`
  }

  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}
