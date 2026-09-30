import { describe, expect, it } from 'vitest'
import { detectStatementAdapters } from '../../src/modules/liquidity-statements/adapters/detect.js'
import { createNamedRow, StatementAdapterRegistry } from '../../src/modules/liquidity-statements/adapters/registry.js'
import type { StatementAdapter } from '../../src/modules/liquidity-statements/adapters/adapter.types.js'
import type { StatementDocument, StatementRecord } from '../../src/modules/liquidity-statements/statement-document.types.js'
import { unmatchedStatementStatus } from '../../src/modules/liquidity-statements/csv-processing.service.js'

const record = (ordinal: number, cells: string[]): StatementRecord => ({
  ordinal, location: { kind: 'CSV', record: ordinal, lineStart: ordinal, lineEnd: ordinal, column: null, header: null }, role: 'UNSUPPORTED', dispositionRule: null,
  cells: cells.map((lexical, index) => ({ column: index + 1, address: null, type: lexical ? 'TEXT' : 'BLANK', lexical, styleId: null, numberFormat: null, formula: null, formulaCache: 'NONE', mergeAnchor: null })),
})
const document = (records: StatementRecord[]): StatementDocument => ({
  kind: 'CSV', sourceHash: 'a'.repeat(64), reader: { id: 'test', version: '1.0.0' },
  resources: { uploadedBytes: 1, inflatedBytes: 1, zipEntries: 0, worksheets: 1, populatedCells: records.length, sharedStrings: 0, decodedStringBytes: 1, styles: 0, relationships: 0 },
  sheets: [{ id: 'csv', name: 'CSV', order: 1, visibility: 'VISIBLE', dateSystem: '1900', records }], records,
})
const adapter = (id: string, start: number, end: number, custodianKey = 'known'): StatementAdapter => ({
  id, version: '1.0.0', custodianKey, fileKind: 'CSV', canonicalSchemaVersion: '3.0.0',
  detect: () => [{ regionId: `${id}:${start}-${end}`, sheetId: 'csv', recordStart: start, recordEnd: end }],
  parse: () => ({ accounts: [], controls: [], dispositions: [], findings: [] }),
})

describe('statement detection drift contract', () => {
  it('returns explicit unsupported, ambiguous and custodian-mismatch outcomes', () => {
    const source = document([record(1, ['Symbol', 'Value'])])
    expect(detectStatementAdapters(source, new StatementAdapterRegistry([]))).toMatchObject({ outcome: 'NEEDS_ADAPTER', matches: [] })
    expect(detectStatementAdapters(source, new StatementAdapterRegistry([adapter('broad', 1, 3), adapter('narrow', 2, 2)]))).toMatchObject({ outcome: 'AMBIGUOUS_LAYOUT' })
    expect(detectStatementAdapters(source, new StatementAdapterRegistry([adapter('known_layout', 1, 1)]), { custodianKey: 'different' })).toMatchObject({ outcome: 'CUSTODIAN_MISMATCH' })
  })

  it('permits extra/reordered columns but rejects duplicate semantic labels and invalid hints', () => {
    const headers = record(1, ['Value', 'Extra', 'Symbol'])
    expect(createNamedRow(headers, record(2, ['100', 'kept', 'ABC'])).get('symbol')?.lexical).toBe('ABC')
    expect(() => createNamedRow(record(1, ['Symbol', ' symbol ']), record(2, ['A', 'B']))).toThrow('DUPLICATE_HEADER')
    const registry = new StatementAdapterRegistry([adapter('known_layout', 1, 1)])
    expect(() => detectStatementAdapters(document([headers]), registry, { hint: { id: 'known_layout', version: '9.0.0' } })).toThrow('INVALID_ADAPTER_HINT')
  })

  it('allows disjoint regions but never silently chooses overlapping or unknown regions', () => {
    const source = document([record(1, ['A']), record(2, ['B']), record(3, ['C'])])
    expect(detectStatementAdapters(source, new StatementAdapterRegistry([adapter('first', 1, 1), adapter('last', 3, 3)])).outcome).toBe('MATCHED')
    expect(detectStatementAdapters(source, new StatementAdapterRegistry([adapter('all', 1, 3), adapter('middle', 2, 2)])).outcome).toBe('AMBIGUOUS_LAYOUT')
  })

  it('permits one-off mapping only for an unknown CSV and routes ambiguous/XLSX layouts to adapter development',()=>{
    expect(unmatchedStatementStatus('CSV','NEEDS_ADAPTER')).toBe('NEEDS_MAPPING')
    expect(unmatchedStatementStatus('CSV','AMBIGUOUS_LAYOUT')).toBe('NEEDS_ADAPTER')
    expect(unmatchedStatementStatus('XLSX','NEEDS_ADAPTER')).toBe('NEEDS_ADAPTER')
    expect(unmatchedStatementStatus('XLSX','AMBIGUOUS_LAYOUT')).toBe('NEEDS_ADAPTER')
  })
})
