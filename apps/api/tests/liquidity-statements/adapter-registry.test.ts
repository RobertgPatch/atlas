import { describe, expect, it, vi } from 'vitest'
import { createNamedRow, StatementAdapterRegistry } from '../../src/modules/liquidity-statements/adapters/registry.js'
import { detectStatementAdapters } from '../../src/modules/liquidity-statements/adapters/detect.js'
import type { AdapterMatch, StatementAdapter } from '../../src/modules/liquidity-statements/adapters/adapter.types.js'
import type { StatementDocument, StatementRecord } from '../../src/modules/liquidity-statements/statement-document.types.js'

const location = { kind: 'CSV' as const, record: 1, lineStart: 1, lineEnd: 1, column: null, header: null }
const record = (values: string[], ordinal = 1): StatementRecord => ({
  ordinal, location: { ...location, record: ordinal, lineStart: ordinal, lineEnd: ordinal }, role: 'UNSUPPORTED', dispositionRule: null,
  cells: values.map((lexical, index) => ({ column: index + 1, address: null, type: lexical ? 'TEXT' : 'BLANK', lexical, styleId: null, numberFormat: null, formula: null, formulaCache: 'NONE', mergeAnchor: null })),
})
const document = (records: StatementRecord[]): StatementDocument => ({
  kind: 'CSV', sourceHash: 'a'.repeat(64), reader: { id: 'test', version: '1' },
  resources: { uploadedBytes: 1, inflatedBytes: 1, zipEntries: 0, worksheets: 1, populatedCells: 1, sharedStrings: 0, decodedStringBytes: 1, styles: 0, relationships: 0 },
  sheets: [{ id: 'csv', name: 'CSV', order: 1, visibility: 'VISIBLE', dateSystem: '1900', records }], records,
})
const adapter = (id: string, custodianKey: string, matches: AdapterMatch[]): StatementAdapter => ({
  id, version: '1.0.0', custodianKey, fileKind: 'CSV', canonicalSchemaVersion: '3.0.0',
  detect: vi.fn(() => matches),
  parse: vi.fn(() => ({ accounts: [], controls: [], dispositions: [], findings: [] })),
})

describe('statement adapter registry and detection', () => {
  it('uses named headers, allows reorder/extra columns and rejects duplicate normalized labels', () => {
    const named = createNamedRow(record([' Value ', 'Extra', 'SYMBOL']), record(['100', 'kept', 'DEMO'], 2))
    expect(named.get('symbol')?.lexical).toBe('DEMO')
    expect(named.get('VALUE')?.lexical).toBe('100')
    expect(named.unknown(['symbol', 'value']).map(cell => cell.lexical)).toEqual(['kept'])
    expect(() => createNamedRow(record(['Symbol', ' symbol ']), record(['A', 'B'], 2))).toThrow('DUPLICATE_HEADER')
    expect(() => createNamedRow(record(['Symbol']), record(['A', 'overflow'], 2))).toThrow('ROW_WIDTH_MISMATCH')
  })

  it('rejects duplicate registrations and returns immutable ordered entries', () => {
    const first = adapter('one', 'custodian-a', [])
    const registry = new StatementAdapterRegistry([first])
    expect(registry.compatible('CSV')).toEqual([first])
    expect(() => registry.register(first)).toThrow('DUPLICATE_ADAPTER')
    expect(() => registry.entries().push(adapter('two', 'custodian-b', []))).toThrow()
  })

  it('allows multiple nonoverlapping complete regions', () => {
    const left = adapter('left', 'custodian-a', [{ regionId: 'sheet:1-5', sheetId: 'csv', recordStart: 1, recordEnd: 5 }])
    const right = adapter('right', 'custodian-a', [{ regionId: 'sheet:6-10', sheetId: 'csv', recordStart: 6, recordEnd: 10 }])
    expect(detectStatementAdapters(document(Array.from({ length: 10 }, (_, index) => record(['x'], index + 1))), new StatementAdapterRegistry([left, right]), { custodianKey: 'custodian-a' }))
      .toMatchObject({ outcome: 'MATCHED', matches: [{ adapterId: 'left' }, { adapterId: 'right' }] })
  })

  it('returns explicit ambiguity for overlapping interpretations without first-match wins', () => {
    const broad = adapter('broad', 'custodian-a', [{ regionId: 'broad', sheetId: 'csv', recordStart: 1, recordEnd: 9 }])
    const narrow = adapter('narrow', 'custodian-a', [{ regionId: 'narrow', sheetId: 'csv', recordStart: 3, recordEnd: 5 }])
    const result = detectStatementAdapters(document([record(['x'])]), new StatementAdapterRegistry([broad, narrow]), { custodianKey: 'custodian-a' })
    expect(result).toMatchObject({ outcome: 'AMBIGUOUS_LAYOUT' })
    expect(result.matches.map(match => match.adapterId)).toEqual(['broad', 'narrow'])
  })

  it('distinguishes no-match and custodian mismatch', () => {
    const known = adapter('known', 'custodian-a', [{ regionId: 'all', sheetId: 'csv', recordStart: 1, recordEnd: 2 }])
    expect(detectStatementAdapters(document([]), new StatementAdapterRegistry([]), { custodianKey: 'custodian-a' })).toEqual({ outcome: 'NEEDS_ADAPTER', matches: [] })
    expect(detectStatementAdapters(document([]), new StatementAdapterRegistry([known]), { custodianKey: 'custodian-b' }))
      .toMatchObject({ outcome: 'CUSTODIAN_MISMATCH', matches: [{ adapterId: 'known' }] })
  })

  it('accepts hints only when id/version/file kind and structure all validate', () => {
    const known = adapter('known', 'custodian-a', [{ regionId: 'all', sheetId: 'csv', recordStart: 1, recordEnd: 2 }])
    const registry = new StatementAdapterRegistry([known])
    const validDocument = document([record(['x'], 1), record(['y'], 2)])
    expect(detectStatementAdapters(validDocument, registry, { hint: { id: 'known', version: '1.0.0' }, custodianKey: 'custodian-a' }).outcome).toBe('MATCHED')
    expect(() => detectStatementAdapters(validDocument, registry, { hint: { id: 'known', version: '2.0.0' }, custodianKey: 'custodian-a' })).toThrow('INVALID_ADAPTER_HINT')
    vi.mocked(known.detect).mockReturnValueOnce([])
    expect(() => detectStatementAdapters(validDocument, registry, { hint: { id: 'known', version: '1.0.0' }, custodianKey: 'custodian-a' })).toThrow('INVALID_ADAPTER_HINT')
  })
})
