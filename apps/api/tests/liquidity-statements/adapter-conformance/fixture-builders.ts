import { deflateRawSync } from 'node:zlib'

// Test-only, entirely synthetic. These helpers serialize inputs; they never
// calculate expected holdings or import application parsing/normalization code.
export { buildCsvFixture, merrillHeaders, positionsHeaders } from '../fixtures/buildCsvFixture.js'

export interface CsvFixtureOptions {
  delimiter?: ',' | ';' | '\t'
  encoding?: 'UTF8' | 'UTF16LE' | 'UTF16BE'
  bom?: boolean
  newline?: '\r\n' | '\n'
  finalNewline?: boolean
}

export function buildCsvBytes(rows: readonly (readonly string[])[], options: CsvFixtureOptions = {}): Buffer {
  const delimiter = options.delimiter ?? ','
  const newline = options.newline ?? '\r\n'
  const quote = (value: string) => /["\r\n]/u.test(value) || value.includes(delimiter)
    ? `"${value.replaceAll('"', '""')}"` : value
  const text = rows.map(row => row.map(quote).join(delimiter)).join(newline) + (options.finalNewline ? newline : '')
  const encoding = options.encoding ?? 'UTF8'
  const bytes = Buffer.from(text, encoding === 'UTF8' ? 'utf8' : 'utf16le')
  if (encoding === 'UTF16BE') bytes.swap16()
  if (!options.bom) return bytes
  const bom = encoding === 'UTF8' ? [0xef, 0xbb, 0xbf] : encoding === 'UTF16LE' ? [0xff, 0xfe] : [0xfe, 0xff]
  return Buffer.concat([Buffer.from(bom), bytes])
}

export type ZipCompression = 'store' | 'deflate'
export interface RawZipPart { name: string; data: string | Buffer; compression?: ZipCompression }

const crc32 = (bytes: Buffer): number => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Minimal deterministic ZIP32 writer for test fixtures, not production input.
 * Entry order/names/duplicates are deliberately preserved for hostile tests.
 * No timestamps, filesystem access, ZIP library, or spreadsheet number coercion.
 */
export function buildZipFixture(parts: readonly RawZipPart[], compression: ZipCompression = 'store'): Buffer {
  if (parts.length > 0xffff) throw new Error('Fixture ZIP32 entry count exceeded')
  const localParts: Buffer[] = [], centralParts: Buffer[] = []
  let offset = 0
  for (const part of parts) {
    const name = Buffer.from(part.name, 'utf8')
    if (name.length > 0xffff) throw new Error('Fixture ZIP32 entry name exceeded')
    const data = typeof part.data === 'string' ? Buffer.from(part.data, 'utf8') : part.data
    const method = (part.compression ?? compression) === 'deflate' ? 8 : 0
    const body = method === 8 ? deflateRawSync(data, { level: 9 }) : data
    const checksum = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 entry names.
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(33, 12) // 1980-01-01, fixed for byte/hash reproducibility.
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(33, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    localParts.push(local, name, body)
    centralParts.push(central, name)
    offset += local.length + name.length + body.length
    if (offset > 0xffffffff) throw new Error('Fixture ZIP32 size exceeded')
  }
  const directory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(parts.length, 8)
  end.writeUInt16LE(parts.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, directory, end])
}

export type FormulaCache =
  | { kind: 'number'; value: string }
  | { kind: 'string' | 'error'; value: string }
  | { kind: 'boolean'; value: boolean }

export type XlsxFixtureCell = { address: string; style?: number } & (
  | { kind: 'number'; value: string }
  | { kind: 'inlineString'; value: string }
  | { kind: 'sharedString'; index: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'error'; value: string }
  | { kind: 'date'; value: string }
  | { kind: 'blank' }
  | { kind: 'formula'; formula: string; cached?: FormulaCache }
)

export interface XlsxFixtureRow { index: number; cells: readonly XlsxFixtureCell[]; hidden?: boolean }
export interface XlsxFixtureSheet {
  name: string
  rows: readonly XlsxFixtureRow[]
  visibility?: 'visible' | 'hidden' | 'veryHidden'
  dimension?: string
  merges?: readonly string[]
  autoFilter?: string
}
export type XlsxSharedString = string | { runs: readonly string[] }
export interface XlsxFixtureOptions {
  sheets: readonly XlsxFixtureSheet[]
  sharedStrings?: readonly XlsxSharedString[]
  date1904?: boolean
  stylesXml?: string
  compression?: ZipCompression
}

const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const attribute = (value: string) => xml(value).replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const spreadsheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const relationshipNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRelationshipNs = 'http://schemas.openxmlformats.org/package/2006/relationships'
const numberToken = (value: string) => {
  if (typeof value !== 'string') throw new Error('Numeric fixture values must be lexical strings')
  return xml(value)
}

function cellXml(cell: XlsxFixtureCell): string {
  const attrs = ` r="${attribute(cell.address)}"${cell.style === undefined ? '' : ` s="${cell.style}"`}`
  switch (cell.kind) {
    case 'number': return `<c${attrs}><v>${numberToken(cell.value)}</v></c>`
    case 'inlineString': return `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`
    case 'sharedString': return `<c${attrs} t="s"><v>${cell.index}</v></c>`
    case 'boolean': return `<c${attrs} t="b"><v>${cell.value ? '1' : '0'}</v></c>`
    case 'error': return `<c${attrs} t="e"><v>${xml(cell.value)}</v></c>`
    case 'date': return `<c${attrs} t="d"><v>${xml(cell.value)}</v></c>`
    case 'blank': return `<c${attrs}/>`
    case 'formula': {
      const cache = cell.cached
      const type = !cache || cache.kind === 'number' ? '' : ` t="${cache.kind === 'string' ? 'str' : cache.kind === 'error' ? 'e' : 'b'}"`
      const value = !cache ? '' : `<v>${cache.kind === 'number' ? numberToken(cache.value) : cache.kind === 'boolean' ? (cache.value ? '1' : '0') : xml(cache.value)}</v>`
      return `<c${attrs}${type}><f>${xml(cell.formula)}</f>${value}</c>`
    }
  }
}

/** Style indices: 0 general, 1 percentage, 2 date, 3 eight-place decimal. */
export const fixtureStylesXml = `${declaration}<styleSheet xmlns="${spreadsheetNs}"><numFmts count="3"><numFmt numFmtId="164" formatCode="0.00%"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="0.00000000"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4">${[0, 164, 165, 166].map(numFmtId => `<xf numFmtId="${numFmtId}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

/** Returns raw parts so tests can deliberately replace XML, relationships or
 * ZIP metadata. Numeric tokens and formulas are never evaluated or normalized.
 */
export function buildXlsxParts(options: XlsxFixtureOptions): RawZipPart[] {
  const sheetParts = options.sheets.map((sheet, index): RawZipPart => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    data: `${declaration}<worksheet xmlns="${spreadsheetNs}">${sheet.dimension ? `<dimension ref="${attribute(sheet.dimension)}"/>` : ''}<sheetData>${sheet.rows.map(row => `<row r="${row.index}"${row.hidden ? ' hidden="1"' : ''}>${row.cells.map(cellXml).join('')}</row>`).join('')}</sheetData>${sheet.autoFilter ? `<autoFilter ref="${attribute(sheet.autoFilter)}"/>` : ''}${sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref => `<mergeCell ref="${attribute(ref)}"/>`).join('')}</mergeCells>` : ''}</worksheet>`,
  }))
  const withStrings = options.sharedStrings !== undefined
  const parts: RawZipPart[] = [
    { name: '[Content_Types].xml', data: `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${options.sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${withStrings ? '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' : ''}</Types>` },
    { name: '_rels/.rels', data: `${declaration}<Relationships xmlns="${packageRelationshipNs}"><Relationship Id="rId1" Type="${relationshipNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `${declaration}<workbook xmlns="${spreadsheetNs}" xmlns:r="${relationshipNs}"><workbookPr date1904="${options.date1904 ? '1' : '0'}"/><sheets>${options.sheets.map((sheet, index) => `<sheet name="${attribute(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}" state="${sheet.visibility ?? 'visible'}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `${declaration}<Relationships xmlns="${packageRelationshipNs}">${options.sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${relationshipNs}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="${relationshipNs}/styles" Target="styles.xml"/>${withStrings ? `<Relationship Id="strings" Type="${relationshipNs}/sharedStrings" Target="sharedStrings.xml"/>` : ''}</Relationships>` },
    { name: 'xl/styles.xml', data: options.stylesXml ?? fixtureStylesXml },
    ...sheetParts,
  ]
  if (withStrings) {
    const strings = options.sharedStrings!
    const count = options.sheets.flatMap(sheet => sheet.rows).flatMap(row => row.cells).filter(cell => cell.kind === 'sharedString').length
    parts.push({ name: 'xl/sharedStrings.xml', data: `${declaration}<sst xmlns="${spreadsheetNs}" count="${count}" uniqueCount="${strings.length}">${strings.map(value => typeof value === 'string' ? `<si><t xml:space="preserve">${xml(value)}</t></si>` : `<si>${value.runs.map(run => `<r><t xml:space="preserve">${xml(run)}</t></r>`).join('')}</si>`).join('')}</sst>` })
  }
  return parts
}

export const buildXlsxFixture = (options: XlsxFixtureOptions): Buffer => buildZipFixture(buildXlsxParts(options), options.compression)
