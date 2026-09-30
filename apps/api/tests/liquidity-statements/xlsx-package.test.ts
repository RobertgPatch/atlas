import http from 'node:http'
import https from 'node:https'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLiquidityCsvConfig } from '../../src/modules/liquidity-statements/liquidity-statement.config.js'
import { buildXlsxParts, buildZipFixture, type RawZipPart } from './adapter-conformance/fixture-builders.js'

// Package-layer contract, deliberately independent of adapter/financial output.
// The nonliteral import lets the test-first suite collect before T019 exists.
// Always load it OUTSIDE rejection assertions: a missing implementation must
// fail each case, never masquerade as a successful hostile-input rejection.
type Config = ReturnType<typeof buildLiquidityCsvConfig>
type Package = {
  parts: Map<string, Buffer>
  resources: { uploadedBytes: number; inflatedBytes: number; zipEntries: number; relationships: number }
}
type Reader = (bytes: Buffer, config: Config, options?: { signal?: AbortSignal }) => Promise<Package>
async function reader(): Promise<Reader> {
  const modulePath = '../../src/modules/liquidity-statements/readers/xlsx-package.js'
  const module = await import(modulePath) as { readXlsxPackage?: Reader }
  expect(module.readXlsxPackage).toBeTypeOf('function')
  return module.readXlsxPackage!
}

const config = buildLiquidityCsvConfig({ LIQUIDITY_XLSX_ENABLED: 'true' })
const spreadsheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const relNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRelNs = 'http://schemas.openxmlformats.org/package/2006/relationships'
const workbookType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const worksheet = 'xl/worksheets/sheet1.xml'
const externalUrl = 'https://statement-parser-must-not-resolve.invalid/source'
const baseParts = (): RawZipPart[] => buildXlsxParts({ sheets: [{ name: 'Synthetic Holdings', rows: [
  { index: 1, cells: [{ address: 'A1', kind: 'inlineString', value: 'Symbol' }] },
  { index: 2, cells: [{ address: 'A2', kind: 'inlineString', value: 'DEMO' }] },
] }] })
const bytes = (parts = baseParts()) => buildZipFixture(parts, 'deflate')
const replacePart = (name: string, change: (xml: string) => string, parts = baseParts()) => {
  expect(parts.some(part => part.name === name)).toBe(true)
  return parts.map(part => part.name === name ? { ...part, data: change(String(part.data)) } : part)
}
const addWorksheetXml = (fragment: string) => replacePart(worksheet, xml => xml.replace('</worksheet>', `${fragment}</worksheet>`))
const relations = (entries: string) => `<Relationships xmlns="${packageRelNs}">${entries}</Relationships>`
const relation = (id: string, type: string, target: string, external = false) =>
  `<Relationship Id="${id}" Type="${relNs}/${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`
function forbidNetworkResolution() {
  const forbidden = () => { throw new Error('Unexpected external resource resolution') }
  return [vi.spyOn(globalThis, 'fetch').mockImplementation(forbidden),
    vi.spyOn(http, 'get').mockImplementation(forbidden), vi.spyOn(http, 'request').mockImplementation(forbidden),
    vi.spyOn(https, 'get').mockImplementation(forbidden), vi.spyOn(https, 'request').mockImplementation(forbidden)]
}

// Patch both independent ZIP metadata locations, retaining the actual payload.
// This is test-only binary mutation, not a production ZIP reader.
function patchEntry(archive: Buffer, name: string, patch: (copy: Buffer, local: number, central: number) => void): Buffer {
  const copy = Buffer.from(archive)
  const end = copy.length - 22
  expect(copy.readUInt32LE(end)).toBe(0x06054b50)
  let central = copy.readUInt32LE(end + 16)
  for (let i = 0; i < copy.readUInt16LE(end + 10); i++) {
    expect(copy.readUInt32LE(central)).toBe(0x02014b50)
    const nameLength = copy.readUInt16LE(central + 28)
    const entryName = copy.subarray(central + 46, central + 46 + nameLength).toString('utf8')
    if (entryName === name) {
      patch(copy, copy.readUInt32LE(central + 42), central)
      return copy
    }
    central += 46 + nameLength + copy.readUInt16LE(central + 30) + copy.readUInt16LE(central + 32)
  }
  throw new Error('Synthetic ZIP entry not found')
}

afterEach(() => vi.restoreAllMocks())

describe('bounded OOXML package acceptance', () => {
  it.each(['store', 'deflate'] as const)('accepts a standard %s package and reports actual all-part bytes', async compression => {
    const read = await reader()
    const parts = baseParts()
    const archive = buildZipFixture(parts, compression)
    const result = await read(archive, config)
    expect(result.parts).toBeInstanceOf(Map)
    expect([...result.parts.keys()].sort()).toEqual(parts.map(part => part.name).sort())
    for (const part of parts) expect(result.parts.get(part.name)).toEqual(Buffer.from(part.data))
    expect(result.resources).toMatchObject({
      uploadedBytes: archive.length,
      inflatedBytes: parts.reduce((sum, part) => sum + Buffer.byteLength(part.data), 0),
      zipEntries: parts.length,
      relationships: 3,
    })
  })

  it.each([
    ['arbitrary ZIP', () => bytes([{ name: 'readme.txt', data: 'Not an OOXML workbook' }])],
    ['empty ZIP', () => bytes([])],
    ['renamed legacy/encrypted OLE file', () => Buffer.from('d0cf11e0a1b11ae1' + '00'.repeat(128), 'hex')],
    ['truncated archive', () => bytes().subarray(0, bytes().length - 8)],
  ] as const)('rejects %s without mistaking ZIP magic for an XLSX', async (_label, build) => {
    const read = await reader()
    await expect(read(build(), config)).rejects.toMatchObject({ code: 'XLSX_INVALID_PACKAGE' })
  })

  it.each(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', worksheet])(
    'rejects the missing essential package part %s', async missing => {
      const read = await reader()
      await expect(read(bytes(baseParts().filter(part => part.name !== missing)), config))
        .rejects.toMatchObject({ code: 'XLSX_INVALID_PACKAGE' })
    },
  )

  it('rejects a ZIP entry flagged as encrypted in both local and central headers', async () => {
    const read = await reader()
    const encrypted = patchEntry(bytes(), worksheet, (copy, local, central) => {
      copy.writeUInt16LE(copy.readUInt16LE(local + 6) | 1, local + 6)
      copy.writeUInt16LE(copy.readUInt16LE(central + 8) | 1, central + 8)
    })
    await expect(read(encrypted, config)).rejects.toMatchObject({ code: 'XLSX_UNSUPPORTED_CONTENT' })
  })

  it('rejects macro-enabled workbook content types even without a VBA part', async () => {
    const read = await reader()
    const parts = replacePart('[Content_Types].xml', xml => xml.replace(workbookType, 'application/vnd.ms-excel.sheet.macroEnabled.main+xml'))
    await expect(read(bytes(parts), config)).rejects.toMatchObject({ code: 'XLSX_UNSUPPORTED_CONTENT' })
  })

  it.each([
    ['xl/vbaProject.bin', 'application/vnd.ms-office.vbaProject'],
    ['xl/activeX/activeX1.bin', 'application/vnd.ms-office.activeX'],
    ['xl/embeddings/oleObject1.bin', 'application/vnd.openxmlformats-officedocument.oleObject'],
    ['xl/embeddings/payload.exe', 'application/octet-stream'],
  ])('rejects embedded active content %s even when unreferenced', async (name, contentType) => {
    const read = await reader()
    const parts = replacePart('[Content_Types].xml', xml => xml.replace('</Types>', `<Override PartName="/${name}" ContentType="${contentType}"/></Types>`))
    parts.push({ name, data: Buffer.from('MZ_SYNTHETIC_NOT_EXECUTABLE') })
    await expect(read(bytes(parts), config)).rejects.toMatchObject({ code: 'XLSX_UNSUPPORTED_CONTENT' })
  })
})

describe('ZIP names, metadata and streamed inflation', () => {
  it.each([
    'xl/workbook.xml', 'xl/./workbook.xml', 'xl/worksheets/../workbook.xml',
    'xl\\workbook.xml', 'xl/%77orkbook.xml',
  ])('rejects duplicate or aliased package entry %s', async name => {
    const read = await reader()
    await expect(read(bytes([...baseParts(), { name, data: '<synthetic/>' }]), config))
      .rejects.toMatchObject({ code: 'XLSX_INVALID_PACKAGE' })
  })

  it.each(['../outside.xml', 'xl/../../../outside.xml', '/absolute.xml', 'C:/absolute.xml', 'xl/bad\0.xml'])(
    'rejects unsafe ZIP path %s', async name => {
      const read = await reader()
      await expect(read(bytes([...baseParts(), { name, data: '<synthetic/>' }]), config))
        .rejects.toMatchObject({ code: 'XLSX_INVALID_PACKAGE' })
    },
  )

  it.each([1, 0xffffffff])('rejects forged uncompressed size %i without trusting directory claims', async declared => {
    const read = await reader()
    const forged = patchEntry(bytes(), worksheet, (copy, local, central) => {
      copy.writeUInt32LE(declared, local + 22)
      copy.writeUInt32LE(declared, central + 24)
    })
    await expect(read(forged, config)).rejects.toMatchObject({ code: expect.stringMatching(/^(XLSX_INVALID_PACKAGE|RESOURCE_LIMIT)$/u) })
  })

  it('rejects corrupted compressed data and never returns partial package success', async () => {
    const read = await reader()
    const corrupted = patchEntry(bytes(), worksheet, (copy, local) => {
      const body = local + 30 + copy.readUInt16LE(local + 26) + copy.readUInt16LE(local + 28)
      copy[body] = 0x07 // Reserved DEFLATE block type, independent of CRC support.
    })
    await expect(read(corrupted, config)).rejects.toMatchObject({ code: 'XLSX_INVALID_PACKAGE' })
  })

  it('independently bounds upload size and ZIP entry count', async () => {
    const read = await reader()
    const archive = bytes()
    await expect(read(archive, { ...config, maxBytes: archive.length - 1 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(read(archive, { ...config, maxZipEntries: baseParts().length - 1 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })

  it('bounds an individual highly compressed XML entry before returning any parts', async () => {
    const read = await reader()
    const parts = replacePart(worksheet, xml => xml.replace('</sheetData>', `${' '.repeat(32_768)}</sheetData>`))
    const archive = bytes(parts)
    expect(archive.length).toBeLessThan(4_096)
    await expect(read(archive, { ...config, maxXmlEntryBytes: 4_096 }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })

  it('counts aggregate inflated bytes across individually small and unreferenced parts', async () => {
    const read = await reader()
    const parts = [...baseParts(), ...Array.from({ length: 3 }, (_, index) => ({
      name: `customXml/item${index + 1}.xml`, data: `<synthetic>${' '.repeat(2_048)}</synthetic>`,
    }))]
    const inflated = parts.reduce((sum, part) => sum + Buffer.byteLength(part.data), 0)
    expect(Math.max(...parts.map(part => Buffer.byteLength(part.data)))).toBeLessThan(4_096)
    await expect(read(bytes(parts), { ...config, maxXmlEntryBytes: 4_096, maxInflatedBytes: inflated - 1 }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })
})

describe('required content types and relationship graph', () => {
  it.each([
    ['incorrect workbook content type', () => replacePart('[Content_Types].xml', xml => xml.replace(workbookType, 'application/xml'))],
    ['missing officeDocument relation', () => replacePart('_rels/.rels', () => relations(''))],
    ['multiple officeDocument relations', () => replacePart('_rels/.rels', () => relations(relation('one', 'officeDocument', 'xl/workbook.xml') + relation('two', 'officeDocument', 'xl/workbook.xml')))],
    ['wrong relationship namespace', () => replacePart('_rels/.rels', xml => xml.replace(packageRelNs, 'urn:synthetic:wrong'))],
    ['missing worksheet target', () => replacePart('xl/_rels/workbook.xml.rels', xml => xml.replace('worksheets/sheet1.xml', 'worksheets/missing.xml'))],
    ['duplicate relationship IDs', () => replacePart('xl/_rels/workbook.xml.rels', xml => xml.replace('Id="styles"', 'Id="rId1"'))],
    ['unknown workbook sheet relationship ID', () => replacePart('xl/workbook.xml', xml => xml.replace('r:id="rId1"', 'r:id="missing"'))],
    ['wrong sheet relationship type', () => replacePart('xl/_rels/workbook.xml.rels', xml => xml.replace(`${relNs}/worksheet`, `${relNs}/image`))],
    ['relationship escaping the package', () => replacePart('xl/_rels/workbook.xml.rels', xml => xml.replace('worksheets/sheet1.xml', '../../outside.xml'))],
    ['encoded relationship traversal', () => replacePart('xl/_rels/workbook.xml.rels', xml => xml.replace('worksheets/sheet1.xml', '%2e%2e/%2e%2e/outside.xml'))],
    ['backslash relationship traversal', () => replacePart('xl/_rels/workbook.xml.rels', xml => xml.replace('worksheets/sheet1.xml', '..\\..\\outside.xml'))],
  ] as const)('rejects %s', async (_label, build) => {
    const read = await reader()
    await expect(read(bytes(build()), config)).rejects.toMatchObject({ code: 'XLSX_INVALID_PACKAGE' })
  })

  it('counts relationships across parts, not only per XML document', async () => {
    const read = await reader()
    await expect(read(bytes(), { ...config, maxRelationships: 2 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })
})

describe('strict XML parsing and independent work ceilings', () => {
  it.each([
    ['unclosed element', '<worksheet><sheetData></worksheet>'],
    ['duplicate attribute', '<worksheet a="1" a="2"/>'],
    ['undeclared entity', '<worksheet>&unresolved;</worksheet>'],
    ['illegal control character', '<worksheet>\u0001</worksheet>'],
    ['trailing root', '<worksheet/><worksheet/>'],
    ['internal DTD', '<!DOCTYPE worksheet [<!ENTITY expanded "synthetic">]><worksheet>&expanded;</worksheet>'],
    ['external DTD', `<!DOCTYPE worksheet SYSTEM "${externalUrl}"><worksheet/>`],
    ['external entity', `<!DOCTYPE worksheet [<!ENTITY external SYSTEM "${externalUrl}">]><worksheet>&external;</worksheet>`],
    ['parameter entity', `<!DOCTYPE worksheet [<!ENTITY % remote SYSTEM "${externalUrl}">%remote;]><worksheet/>`],
  ])('rejects %s', async (_label, xml) => {
    const read = await reader()
    const spies = forbidNetworkResolution()
    await expect(read(bytes(replacePart(worksheet, () => xml)), config))
      .rejects.toMatchObject({ code: 'XLSX_XML_INVALID' })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('also validates XML in unreferenced package parts', async () => {
    const read = await reader()
    await expect(read(bytes([...baseParts(), { name: 'customXml/unreferenced.xml', data: '<bad>' }]), config))
      .rejects.toMatchObject({ code: 'XLSX_XML_INVALID' })
  })

  it('bounds nesting depth, including otherwise uninterpreted XML nodes', async () => {
    const read = await reader()
    const parts = addWorksheetXml(`${'<nested>'.repeat(9)}text${'</nested>'.repeat(9)}`)
    await expect(read(bytes(parts), { ...config, maxXmlDepth: 8 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })

  it('bounds attributes per element', async () => {
    const read = await reader()
    const parts = addWorksheetXml(`<synthetic ${Array.from({ length: 9 }, (_, index) => `a${index}="x"`).join(' ')}/>`)
    await expect(read(bytes(parts), { ...config, maxXmlAttributes: 8 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })

  it.each(['n'.repeat(257), 'é'.repeat(129)])('bounds XML names by UTF-8 bytes', async name => {
    const read = await reader()
    await expect(read(bytes(addWorksheetXml(`<${name}/>`)), config)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })

  it('bounds attribute names as well as element names', async () => {
    const read = await reader()
    await expect(read(bytes(addWorksheetXml(`<synthetic ${'a'.repeat(257)}="x"/>`)), config))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })

  it.each([
    'x'.repeat(16_385),
    '<![CDATA[' + 'x'.repeat(16_385) + ']]>',
    '&#233;'.repeat(8_193),
  ])('bounds decoded XML text, including CDATA and character references', async text => {
    const read = await reader()
    await expect(read(bytes(addWorksheetXml(`<synthetic>${text}</synthetic>`)), config))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })

  it('bounds aggregate decoded text independently from per-field and inflated-byte limits', async () => {
    const read = await reader()
    const parts = addWorksheetXml(`<synthetic>${'<item>abcdefgh</item>'.repeat(9)}</synthetic>`)
    await expect(read(bytes(parts), { ...config, maxDecodedStringBytes: 64 }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })
})

describe('external resources remain inert and cancellation fails closed', () => {
  it.each([
    ['external officeDocument', () => replacePart('_rels/.rels', () => relations(relation('rId1', 'officeDocument', externalUrl, true)))],
    ['external worksheet', () => replacePart('xl/_rels/workbook.xml.rels', () => relations(relation('rId1', 'worksheet', externalUrl, true)))],
    ['absolute URL without external marker', () => replacePart('xl/_rels/workbook.xml.rels', () => relations(relation('rId1', 'worksheet', externalUrl)))],
    ['local file worksheet', () => replacePart('xl/_rels/workbook.xml.rels', () => relations(relation('rId1', 'worksheet', 'file:///synthetic-never-read.xml', true)))],
  ] as const)('never resolves %s', async (_label, build) => {
    const read = await reader()
    const spies = forbidNetworkResolution()
    await expect(read(bytes(build()), config)).rejects.toMatchObject({ code: 'XLSX_INVALID_PACKAGE' })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('preserves an ordinary external hyperlink as inert metadata without fetching it', async () => {
    const read = await reader()
    const spies = forbidNetworkResolution()
    const parts = replacePart(worksheet, xml => xml.replace(`<worksheet xmlns="${spreadsheetNs}">`, `<worksheet xmlns="${spreadsheetNs}" xmlns:r="${relNs}">`)
      .replace('</worksheet>', '<hyperlinks><hyperlink ref="A1" r:id="link"/></hyperlinks></worksheet>'))
    parts.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: relations(relation('link', 'hyperlink', externalUrl, true)) })
    const result = await read(bytes(parts), config)
    expect(result.parts.get('xl/worksheets/_rels/sheet1.xml.rels')?.toString()).toContain(externalUrl)
    expect(result.resources.relationships).toBe(4)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a pre-aborted operation without returning package contents', async () => {
    const read = await reader()
    const controller = new AbortController()
    controller.abort()
    await expect(read(bytes(), config, { signal: controller.signal })).rejects.toMatchObject({ code: 'XLSX_CANCELLED' })
  })

  it('rejects an abort during asynchronous archive work and allows a subsequent clean read', async () => {
    const read = await reader()
    const controller = new AbortController()
    const pending = read(bytes(), config, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'XLSX_CANCELLED' })
    const result = await read(bytes(), config)
    expect(result.resources.zipEntries).toBe(baseParts().length)
  })
})
