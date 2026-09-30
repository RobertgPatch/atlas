import path from 'node:path'
import { SaxesParser } from 'saxes'
import type { buildLiquidityCsvConfig } from '../liquidity-statement.config.js'
import type { StatementCell, StatementDocument, StatementRecord, StatementSheet } from '../statement-document.types.js'
import { readXlsxPackage, XlsxPackageError } from './xlsx-package.js'

type StatementReaderConfig = ReturnType<typeof buildLiquidityCsvConfig>
export const XLSX_READER_ID = 'bounded_ooxml_xlsx'
export const XLSX_READER_VERSION = '1.0.0'

const relationNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const attr = (tag: any, name: string): string | undefined => {
  for (const candidate of Object.values(tag.attributes ?? {}) as any[]) {
    if (candidate.name === name || candidate.local === name || name === 'r:id' && candidate.local === 'id' && candidate.prefix === 'r') return candidate.value
  }
  return undefined
}
const parseXml = (bytes: Buffer, handlers: { open?(tag: any): void; text?(text: string): void; close?(tag: any): void }) => {
  const parser = new SaxesParser({ xmlns: true })
  let error: Error | null = null
  parser.on('error', value => { error = value })
  if (handlers.open) parser.on('opentag', handlers.open)
  if (handlers.text) { parser.on('text', handlers.text); parser.on('cdata', handlers.text) }
  if (handlers.close) parser.on('closetag', handlers.close)
  parser.write(bytes.toString('utf8')).close()
  if (error) throw new XlsxPackageError('XLSX_XML_INVALID', { cause: error })
}

interface WorkbookSheet { id: string; name: string; visibility: StatementSheet['visibility'] }
function workbookMetadata(bytes: Buffer): { dateSystem: StatementSheet['dateSystem']; sheets: WorkbookSheet[] } {
  let dateSystem: StatementSheet['dateSystem'] = '1900'
  const sheets: WorkbookSheet[] = []
  parseXml(bytes, { open(tag) {
    if (tag.local === 'workbookPr' && attr(tag, 'date1904') === '1') dateSystem = '1904'
    if (tag.local === 'sheet') {
      const id = attr(tag, 'r:id'), name = attr(tag, 'name')
      if (!id || !name) throw new XlsxPackageError('XLSX_INVALID_PACKAGE')
      const state = attr(tag, 'state')
      sheets.push({ id, name, visibility: state === 'hidden' ? 'HIDDEN' : state === 'veryHidden' ? 'VERY_HIDDEN' : 'VISIBLE' })
    }
  } })
  return { dateSystem, sheets }
}

function workbookTargets(bytes: Buffer): Map<string, string> {
  const targets = new Map<string, string>()
  parseXml(bytes, { open(tag) {
    if (tag.local !== 'Relationship' || attr(tag, 'Type') !== `${relationNs}/worksheet`) return
    const id = attr(tag, 'Id'), target = attr(tag, 'Target')
    if (id && target) targets.set(id, path.posix.normalize(path.posix.join('xl', target)))
  } })
  return targets
}

function sharedStrings(bytes: Buffer | undefined, config: StatementReaderConfig): string[] {
  if (!bytes) return []
  const strings: string[] = []
  let inItem = false, inText = false, value = ''
  parseXml(bytes, {
    open(tag) {
      if (tag.local === 'si') { inItem = true; value = '' }
      if (inItem && tag.local === 't') inText = true
    },
    text(text) { if (inText) value += text },
    close(tag) {
      if (tag.local === 't') inText = false
      if (tag.local === 'si') {
        strings.push(value)
        if (strings.length > config.maxSharedStrings) throw new XlsxPackageError('RESOURCE_LIMIT')
        inItem = false
      }
    },
  })
  return strings
}

const builtinFormats = new Map<number, string>([
  [0, 'General'], [1, '0'], [2, '0.00'], [3, '#,##0'], [4, '#,##0.00'],
  [9, '0%'], [10, '0.00%'], [14, 'mm-dd-yy'], [22, 'm/d/yy h:mm'],
])
function styles(bytes: Buffer, config: StatementReaderConfig): string[] {
  const custom = new Map<number, string>(), formats: string[] = []
  let inCellXfs = false
  parseXml(bytes, {
    open(tag) {
      if (tag.local === 'numFmt') {
        const id = attr(tag, 'numFmtId'), code = attr(tag, 'formatCode')
        if (id && code && /^\d+$/u.test(id)) custom.set(Number(id), code)
      }
      if (tag.local === 'cellXfs') inCellXfs = true
      else if (inCellXfs && tag.local === 'xf') {
        const id = Number(attr(tag, 'numFmtId') ?? '0')
        formats.push(custom.get(id) ?? builtinFormats.get(id) ?? `numFmt:${id}`)
        if (formats.length > config.maxStyles) throw new XlsxPackageError('RESOURCE_LIMIT')
      }
    },
    close(tag) { if (tag.local === 'cellXfs') inCellXfs = false },
  })
  return formats
}

const columnNumber = (letters: string) => {
  let value = 0
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64
  return value
}
function coordinate(address: string): { column: number; row: number } {
  const match = /^([A-Z]+)([1-9]\d*)$/u.exec(address)
  if (!match) throw new XlsxReaderError('XLSX_CELL_ADDRESS_INVALID')
  const column = columnNumber(match[1]!), row = Number(match[2])
  if (column > 16_384 || row > 1_048_576) throw new XlsxReaderError('XLSX_CELL_ADDRESS_INVALID')
  return { column, row }
}
const dateFormat = (format: string | null) => !!format && /(?:^|[^\\])[ymdhis]/iu.test(format.replace(/"[^"]*"/gu, ''))
function excelDate(token: string, system: StatementSheet['dateSystem']): { value: string | null; error: StatementCell['dateError'] } {
  if (!/^\d+(?:\.0*)?$/u.test(token)) return { value: null, error: 'OUT_OF_RANGE' }
  const serial = BigInt(token.split('.')[0]!)
  if (system === '1900' && serial === 60n) return { value: null, error: 'EXCEL_1900_LEAP_DAY' }
  const adjusted = system === '1900' && serial > 60n ? serial - 1n : serial
  const base = system === '1900' ? Date.UTC(1899, 11, 31) : Date.UTC(1904, 0, 1)
  if (adjusted > 2_958_465n) return { value: null, error: 'OUT_OF_RANGE' }
  const date = new Date(base + Number(adjusted) * 86_400_000)
  return Number.isNaN(date.valueOf()) ? { value: null, error: 'OUT_OF_RANGE' } : { value: date.toISOString().slice(0, 10), error: null }
}

export class XlsxReaderError extends Error {
  constructor(readonly code: 'XLSX_DUPLICATE_CELL' | 'XLSX_CELL_ADDRESS_INVALID') { super(code) }
}

interface Merge { startColumn: number; endColumn: number; startRow: number; endRow: number; anchor: string }
function merge(ref: string): Merge {
  const [start, end = start] = ref.split(':')
  const a = coordinate(start!), b = coordinate(end!)
  return { startColumn: a.column, endColumn: b.column, startRow: a.row, endRow: b.row, anchor: start! }
}

function worksheetRecords(
  bytes: Buffer,
  sheet: WorkbookSheet,
  dateSystem: StatementSheet['dateSystem'],
  stringTable: string[],
  styleFormats: string[],
  firstOrdinal: number,
  config: StatementReaderConfig,
): { records: StatementRecord[]; populated: number } {
  type PendingCell = { address: string; type: string; styleId: number | null; formula: string | null; value: string | null; inline: string }
  const records: StatementRecord[] = [], seen = new Set<string>(), merges: Merge[] = []
  let ordinal = firstOrdinal, populated = 0, rowIndex = 0, rowHidden = false, cells: StatementCell[] = []
  let current: PendingCell | null = null, content: 'VALUE' | 'FORMULA' | 'INLINE' | null = null
  parseXml(bytes, {
    open(tag) {
      if (tag.local === 'row') {
        const value = attr(tag, 'r')
        if (!value || !/^\d+$/u.test(value)) throw new XlsxReaderError('XLSX_CELL_ADDRESS_INVALID')
        rowIndex = Number(value); rowHidden = attr(tag, 'hidden') === '1'; cells = []
      } else if (tag.local === 'c') {
        const address = attr(tag, 'r')
        if (!address) throw new XlsxReaderError('XLSX_CELL_ADDRESS_INVALID')
        const at = coordinate(address)
        if (at.row !== rowIndex || seen.has(`${sheet.id}:${address}`)) throw new XlsxReaderError(seen.has(`${sheet.id}:${address}`) ? 'XLSX_DUPLICATE_CELL' : 'XLSX_CELL_ADDRESS_INVALID')
        seen.add(`${sheet.id}:${address}`)
        const style = attr(tag, 's')
        current = { address, type: attr(tag, 't') ?? 'n', styleId: style === undefined ? null : Number(style), formula: null, value: null, inline: '' }
      } else if (current && tag.local === 'v') content = 'VALUE'
      else if (current && tag.local === 'f') content = 'FORMULA'
      else if (current && tag.local === 't') content = 'INLINE'
      else if (tag.local === 'mergeCell') {
        const ref = attr(tag, 'ref'); if (ref) merges.push(merge(ref))
      }
    },
    text(text) {
      if (!current || !content) return
      if (content === 'VALUE') current.value = (current.value ?? '') + text
      if (content === 'FORMULA') current.formula = (current.formula ?? '') + text
      if (content === 'INLINE') current.inline += text
    },
    close(tag) {
      if (['v', 'f', 't'].includes(tag.local)) content = null
      if (tag.local === 'c' && current) {
        const at = coordinate(current.address)
        const numberFormat = current.styleId === null ? null : styleFormats[current.styleId] ?? null
        let type: StatementCell['type'] = 'NUMBER', lexical = current.value
        if (current.type === 's') {
          if (!lexical || !/^\d+$/u.test(lexical) || Number(lexical) >= stringTable.length) throw new XlsxPackageError('XLSX_INVALID_PACKAGE')
          type = 'TEXT'; lexical = stringTable[Number(lexical)]!
        } else if (current.type === 'inlineStr') { type = 'TEXT'; lexical = current.inline }
        else if (current.type === 'str' || current.type === 'd') type = 'TEXT'
        else if (current.type === 'b') { type = 'BOOLEAN'; lexical = lexical === '1' ? 'true' : lexical === '0' ? 'false' : lexical }
        else if (current.type === 'e') type = 'ERROR'
        else if (lexical === null && !current.formula) type = 'BLANK'
        const external = current.formula !== null && /\[[^\]]+\]/u.test(current.formula)
        const formulaCache: StatementCell['formulaCache'] = current.formula === null ? 'NONE' : external ? 'EXTERNAL' : lexical === null ? 'MISSING' : type === 'ERROR' ? 'ERROR' : 'SCALAR'
        const date = type === 'NUMBER' && lexical !== null && dateFormat(numberFormat) ? excelDate(lexical, dateSystem) : null
        cells.push({ column: at.column, address: current.address, type, lexical, styleId: current.styleId, numberFormat, formula: current.formula, formulaCache, mergeAnchor: null,
          ...(date ? { interpretedDate: date.value, dateError: date.error } : {}) })
        if (type !== 'BLANK') populated += 1
        if (populated > config.maxPopulatedCells) throw new XlsxPackageError('RESOURCE_LIMIT')
        current = null
      }
      if (tag.local === 'row') {
        const rowBytes = cells.reduce((sum, cell) => sum + Buffer.byteLength(cell.lexical ?? ''), 0)
        if (rowBytes > config.maxRecordBytes || cells.some(cell => Buffer.byteLength(cell.lexical ?? '') > config.maxFieldBytes)) throw new XlsxPackageError('RESOURCE_LIMIT')
        records.push({
          ordinal: ordinal++, role: cells.every(cell => cell.type === 'BLANK') ? 'BLANK' : 'UNSUPPORTED', dispositionRule: null, cells,
          location: { kind: 'XLSX', sheetId: sheet.id, sheetName: sheet.name, row: rowIndex, column: cells[0]?.column ?? 1, address: cells[0]?.address ?? `A${rowIndex}`, header: null, hidden: rowHidden, filtered: false },
        })
        if (records.length > config.maxTotalRecords) throw new XlsxPackageError('RESOURCE_LIMIT')
      }
    },
  })
  for (const record of records) for (const cell of record.cells) {
    const at = coordinate(cell.address!)
    cell.mergeAnchor = merges.find(item => at.row >= item.startRow && at.row <= item.endRow && at.column >= item.startColumn && at.column <= item.endColumn)?.anchor ?? null
  }
  return { records, populated }
}

export async function readXlsxStatement(bytes: Buffer, sourceHash: string, config: StatementReaderConfig, options: { signal?: AbortSignal } = {}): Promise<StatementDocument> {
  const pkg = await readXlsxPackage(bytes, config, options)
  const workbook = workbookMetadata(pkg.parts.get('xl/workbook.xml')!)
  const targets = workbookTargets(pkg.parts.get('xl/_rels/workbook.xml.rels')!)
  const strings = sharedStrings(pkg.parts.get('xl/sharedStrings.xml'), config)
  const styleFormats = styles(pkg.parts.get('xl/styles.xml')!, config)
  const sheets: StatementSheet[] = [], records: StatementRecord[] = []
  let populatedCells = 0
  for (const [index, metadata] of workbook.sheets.entries()) {
    const target = targets.get(metadata.id), data = target ? pkg.parts.get(target) : undefined
    if (!target || !data) throw new XlsxPackageError('XLSX_INVALID_PACKAGE')
    const parsed = worksheetRecords(data, metadata, workbook.dateSystem, strings, styleFormats, records.length + 1, config)
    populatedCells += parsed.populated
    records.push(...parsed.records)
    sheets.push({ ...metadata, order: index + 1, dateSystem: workbook.dateSystem, records: parsed.records })
  }
  return {
    kind: 'XLSX', sourceHash, reader: { id: XLSX_READER_ID, version: XLSX_READER_VERSION }, sheets, records,
    resources: { ...pkg.resources, worksheets: sheets.length, populatedCells, sharedStrings: strings.length,
      decodedStringBytes: records.reduce((sum, record) => sum + record.cells.reduce((cellSum, cell) => cellSum + Buffer.byteLength(cell.lexical ?? ''), 0), 0), styles: styleFormats.length },
  }
}
