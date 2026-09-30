import path from 'node:path'
import { SaxesParser } from 'saxes'
import { fromBufferPromise, type Entry, type ZipFile } from 'yauzl'
import type { buildLiquidityCsvConfig } from '../liquidity-statement.config.js'

type StatementReaderConfig = ReturnType<typeof buildLiquidityCsvConfig>
export type XlsxPackageErrorCode = 'XLSX_INVALID_PACKAGE' | 'XLSX_UNSUPPORTED_CONTENT' | 'XLSX_XML_INVALID' | 'XLSX_CANCELLED' | 'RESOURCE_LIMIT'

export class XlsxPackageError extends Error {
  constructor(readonly code: XlsxPackageErrorCode, options?: ErrorOptions) { super(code, options) }
}

export interface XlsxPackage {
  parts: Map<string, Buffer>
  resources: { uploadedBytes: number; inflatedBytes: number; zipEntries: number; relationships: number }
}

const spreadsheetRelationshipNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRelationshipNs = 'http://schemas.openxmlformats.org/package/2006/relationships'
const workbookContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const requiredParts = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels']

const fail = (code: XlsxPackageErrorCode, cause?: unknown): never => {
  throw new XlsxPackageError(code, cause instanceof Error ? { cause } : undefined)
}
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) fail('XLSX_CANCELLED') }

function safePartName(raw: string): string {
  if (!raw || raw.includes('\0') || raw.includes('\\') || raw.startsWith('/') || /^[a-z]:/iu.test(raw)) fail('XLSX_INVALID_PACKAGE')
  if (/%[0-9a-f]{2}/iu.test(raw)) fail('XLSX_INVALID_PACKAGE')
  const segments = raw.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) fail('XLSX_INVALID_PACKAGE')
  const normalized = path.posix.normalize(raw)
  if (normalized !== raw || normalized.startsWith('../')) fail('XLSX_INVALID_PACKAGE')
  return normalized
}

async function readEntry(zip: ZipFile, entry: Entry, config: StatementReaderConfig, signal?: AbortSignal): Promise<Buffer> {
  cancelled(signal)
  if (entry.isEncrypted()) fail('XLSX_UNSUPPORTED_CONTENT')
  if (!entry.canDecodeFileData() || ![0, 8].includes(entry.compressionMethod)) fail('XLSX_INVALID_PACKAGE')
  const isXml = /(?:\.xml|\.rels)$/iu.test(entry.fileName)
  if (entry.uncompressedSize > config.maxInflatedBytes || isXml && entry.uncompressedSize > config.maxXmlEntryBytes) fail('RESOURCE_LIMIT')
  try {
    const stream = await zip.openReadStreamPromise(entry)
    const chunks: Buffer[] = []
    let size = 0
    const abort = () => stream.destroy(new XlsxPackageError('XLSX_CANCELLED'))
    signal?.addEventListener('abort', abort, { once: true })
    try {
      for await (const value of stream) {
        cancelled(signal)
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array)
        size += chunk.length
        if (size > config.maxInflatedBytes || isXml && size > config.maxXmlEntryBytes) {
          stream.destroy()
          fail('RESOURCE_LIMIT')
        }
        chunks.push(chunk)
      }
    } finally { signal?.removeEventListener('abort', abort) }
    if (size !== entry.uncompressedSize) fail('XLSX_INVALID_PACKAGE')
    return Buffer.concat(chunks, size)
  } catch (error) {
    if (error instanceof XlsxPackageError) throw error
    if (signal?.aborted) fail('XLSX_CANCELLED', error)
    fail('XLSX_INVALID_PACKAGE', error)
  }
  throw new XlsxPackageError('XLSX_INVALID_PACKAGE')
}

interface XmlInspection {
  relationships: Array<{ id: string; type: string; target: string; external: boolean }>
  workbookSheets: Array<{ id: string }>
  workbookType: string | null
  decodedBytes: number
}

function attribute(tag: any, name: string): string | undefined {
  for (const candidate of Object.values(tag.attributes ?? {}) as any[]) {
    if (candidate.name === name || candidate.local === name || name === 'r:id' && candidate.local === 'id' && candidate.prefix === 'r') return candidate.value
  }
  return undefined
}

function inspectXml(name: string, bytes: Buffer, config: StatementReaderConfig): XmlInspection {
  let text = ''
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch (error) { fail('XLSX_XML_INVALID', error) }
  const parser = new SaxesParser({ xmlns: true, position: true })
  const relationships: XmlInspection['relationships'] = []
  const workbookSheets: XmlInspection['workbookSheets'] = []
  const relationshipIds = new Set<string>()
  const textBytes: number[] = []
  let decodedBytes = 0
  let workbookType: string | null = null
  let parseError: Error | null = null
  parser.on('error', error => { parseError = error })
  parser.on('doctype', () => { throw new XlsxPackageError('XLSX_XML_INVALID') })
  parser.on('opentag', tag => {
    const elementBytes = Buffer.byteLength(tag.name)
    if (elementBytes > config.maxXmlNameBytes || Object.keys(tag.attributes).length > config.maxXmlAttributes) fail('RESOURCE_LIMIT')
    textBytes.push(0)
    if (textBytes.length > config.maxXmlDepth) fail('RESOURCE_LIMIT')
    for (const item of Object.values(tag.attributes) as any[]) {
      if (Buffer.byteLength(item.name) > config.maxXmlNameBytes) fail('RESOURCE_LIMIT')
      const valueBytes = Buffer.byteLength(item.value)
      if (valueBytes > config.maxFieldBytes) fail('RESOURCE_LIMIT')
      decodedBytes += valueBytes
      if (decodedBytes > config.maxDecodedStringBytes) fail('RESOURCE_LIMIT')
    }
    if (tag.local === 'Override' && attribute(tag, 'PartName') === '/xl/workbook.xml') workbookType = attribute(tag, 'ContentType') ?? null
    if (tag.local === 'Relationship') {
      if (tag.uri !== packageRelationshipNs) fail('XLSX_INVALID_PACKAGE')
      const id = attribute(tag, 'Id'), type = attribute(tag, 'Type'), target = attribute(tag, 'Target')
      if (!id || !type || !target || relationshipIds.has(id)) throw new XlsxPackageError('XLSX_INVALID_PACKAGE')
      relationshipIds.add(id)
      relationships.push({ id, type, target, external: attribute(tag, 'TargetMode') === 'External' })
    }
    if (name === 'xl/workbook.xml' && tag.local === 'sheet') {
      const id = attribute(tag, 'r:id')
      if (!id) throw new XlsxPackageError('XLSX_INVALID_PACKAGE')
      workbookSheets.push({ id })
    }
  })
  const accountText = (value: string) => {
    const count = Buffer.byteLength(value)
    const index = textBytes.length - 1
    if (index >= 0) {
      textBytes[index] = (textBytes[index] ?? 0) + count
      if (textBytes[index]! > config.maxFieldBytes) fail('RESOURCE_LIMIT')
    }
    decodedBytes += count
    if (decodedBytes > config.maxDecodedStringBytes) fail('RESOURCE_LIMIT')
  }
  parser.on('text', accountText)
  parser.on('cdata', accountText)
  parser.on('closetag', () => { textBytes.pop() })
  try { parser.write(text).close() } catch (error) {
    if (error instanceof XlsxPackageError) throw error
    fail('XLSX_XML_INVALID', error)
  }
  if (parseError) fail('XLSX_XML_INVALID', parseError)
  return { relationships, workbookSheets, workbookType, decodedBytes }
}

function relationshipSource(name: string): string {
  if (name === '_rels/.rels') return ''
  const marker = '/_rels/'
  const index = name.lastIndexOf(marker)
  if (index < 0 || !name.endsWith('.rels')) fail('XLSX_INVALID_PACKAGE')
  return `${name.slice(0, index)}/${name.slice(index + marker.length, -5)}`
}

function resolveRelationship(source: string, target: string): string {
  if (target.includes('\\') || /%[0-9a-f]{2}/iu.test(target) || /^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('/')) fail('XLSX_INVALID_PACKAGE')
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), target))
  if (resolved.startsWith('../') || resolved === '..') fail('XLSX_INVALID_PACKAGE')
  return safePartName(resolved)
}

function validateGraph(parts: Map<string, Buffer>, inspections: Map<string, XmlInspection>, config: StatementReaderConfig): number {
  if (inspections.get('[Content_Types].xml')?.workbookType !== workbookContentType) {
    const content = parts.get('[Content_Types].xml')?.toString('utf8') ?? ''
    if (/macroEnabled|vbaProject|activeX|oleObject|application\/octet-stream/iu.test(content)) fail('XLSX_UNSUPPORTED_CONTENT')
    fail('XLSX_INVALID_PACKAGE')
  }
  const allRelationships = [...inspections.entries()].filter(([name]) => name.endsWith('.rels'))
  const count = allRelationships.reduce((total, [, item]) => total + item.relationships.length, 0)
  if (count > config.maxRelationships) fail('RESOURCE_LIMIT')
  for (const [name, inspection] of allRelationships) {
    const source = relationshipSource(name)
    for (const relation of inspection.relationships) {
      const kind = relation.type.slice(relation.type.lastIndexOf('/') + 1)
      if (relation.external) {
        if (kind !== 'hyperlink') fail('XLSX_INVALID_PACKAGE')
        continue
      }
      const target = resolveRelationship(source, relation.target)
      if (!parts.has(target)) fail('XLSX_INVALID_PACKAGE')
    }
  }
  const root = inspections.get('_rels/.rels')!.relationships.filter(item => item.type === `${spreadsheetRelationshipNs}/officeDocument`)
  if (root.length !== 1 || root[0]!.external || resolveRelationship('', root[0]!.target) !== 'xl/workbook.xml') fail('XLSX_INVALID_PACKAGE')
  const workbookRelations = inspections.get('xl/_rels/workbook.xml.rels')!.relationships
  const workbookById = new Map(workbookRelations.map(item => [item.id, item]))
  for (const sheet of inspections.get('xl/workbook.xml')!.workbookSheets) {
    const relation = workbookById.get(sheet.id)
    if (!relation || relation.external || relation.type !== `${spreadsheetRelationshipNs}/worksheet`) fail('XLSX_INVALID_PACKAGE')
  }
  return count
}

export async function readXlsxPackage(bytes: Buffer, config: StatementReaderConfig, options: { signal?: AbortSignal } = {}): Promise<XlsxPackage> {
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail('XLSX_INVALID_PACKAGE')
  if (bytes.length > config.maxBytes) fail('RESOURCE_LIMIT')
  cancelled(options.signal)
  let zip: ZipFile | undefined
  try {
    zip = await fromBufferPromise(bytes, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true })
    cancelled(options.signal)
    if (zip.entryCount > config.maxZipEntries) fail('RESOURCE_LIMIT')
    const parts = new Map<string, Buffer>()
    let inflatedBytes = 0
    let entries = 0
    for await (const entry of zip.eachEntry()) {
      cancelled(options.signal)
      entries += 1
      if (entries > config.maxZipEntries) fail('RESOURCE_LIMIT')
      const name = safePartName(entry.fileName)
      if (parts.has(name)) fail('XLSX_INVALID_PACKAGE')
      if (/\.(?:xlsm|bin|exe|dll|com|msi|js|vbs|ps1)$/iu.test(name) || /\/(?:vbaProject|activeX|embeddings)\//iu.test(`/${name}`)) fail('XLSX_UNSUPPORTED_CONTENT')
      const data = await readEntry(zip, entry, config, options.signal)
      inflatedBytes += data.length
      if (inflatedBytes > config.maxInflatedBytes) fail('RESOURCE_LIMIT')
      parts.set(name, data)
    }
    cancelled(options.signal)
    if (entries !== zip.entryCount) fail('XLSX_INVALID_PACKAGE')
    for (const name of requiredParts) if (!parts.has(name)) fail('XLSX_INVALID_PACKAGE')
    const inspections = new Map<string, XmlInspection>()
    let decodedBytes = 0
    for (const [name, data] of parts) {
      if (!/(?:\.xml|\.rels)$/iu.test(name)) continue
      const inspection = inspectXml(name, data, config)
      decodedBytes += inspection.decodedBytes
      if (decodedBytes > config.maxDecodedStringBytes) fail('RESOURCE_LIMIT')
      inspections.set(name, inspection)
    }
    const relationships = validateGraph(parts, inspections, config)
    const workbook = inspections.get('xl/workbook.xml')!
    if (!workbook.workbookSheets.length || workbook.workbookSheets.length > config.maxWorksheets) fail('RESOURCE_LIMIT')
    for (const sheet of workbook.workbookSheets) {
      const relation = inspections.get('xl/_rels/workbook.xml.rels')!.relationships.find(item => item.id === sheet.id)!
      if (!parts.has(resolveRelationship('xl/workbook.xml', relation.target))) fail('XLSX_INVALID_PACKAGE')
    }
    return { parts, resources: { uploadedBytes: bytes.length, inflatedBytes, zipEntries: entries, relationships } }
  } catch (error) {
    if (error instanceof XlsxPackageError) throw error
    if (options.signal?.aborted) fail('XLSX_CANCELLED', error)
    fail('XLSX_INVALID_PACKAGE', error)
  } finally {
    if (zip?.isOpen) zip.close()
  }
  throw new XlsxPackageError('XLSX_INVALID_PACKAGE')
}
