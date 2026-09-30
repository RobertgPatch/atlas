import type { MappingProfile, StatementDraft } from '../liquidity-statement.types.js'
import type { StatementDocument, StatementRecord } from '../statement-document.types.js'
import { mappedProfile } from '../csv/mapped.profile.js'
import { decodeStoredStatementDraft } from '../statement-draft.compat.js'
import type { AdapterMatch, AdapterResult, StatementAdapter } from './adapter.types.js'

const VERSION = '1.0.0'
const toCsvRecord = (record: StatementRecord) => {
  if (record.location.kind !== 'CSV') throw new Error('MAPPED_CSV_REQUIRES_CSV')
  return {
    ordinal: record.ordinal,
    lineStart: record.location.lineStart,
    lineEnd: record.location.lineEnd,
    cells: record.cells.map(cell => cell.lexical ?? ''),
    role: record.role === 'SUBTOTAL' || record.role === 'NOTE' || record.role === 'EXCLUDED_SECTION' ? 'UNSUPPORTED' as const : record.role,
  }
}

function mappedAdapter(profile: MappingProfile | null): StatementAdapter {
  return {
    id: 'mapped_csv', version: VERSION, custodianKey: 'mapped', fileKind: 'CSV', canonicalSchemaVersion: '3.0.0',
    detect(document) {
      if (!profile || document.kind !== 'CSV') return []
      const header = document.records[profile.headerRecord - 1]
      if (!header || profile.columns.some(binding => header.cells[binding.sourceIndex]?.lexical !== binding.sourceHeader)) return []
      return [{ regionId: `mapped:${profile.headerRecord}`, sheetId: document.sheets[0]?.id ?? 'csv', recordStart: 1, recordEnd: document.records.at(-1)?.ordinal ?? 1 }]
    },
    parse(document: Readonly<StatementDocument>, match: Readonly<AdapterMatch>): AdapterResult {
      if (!profile || document.kind !== 'CSV' || !this.detect(document).some(region => region.regionId === match.regionId)) throw new Error('INVALID_ADAPTER_MATCH')
      const records = document.records.map(toCsvRecord)
      const parsed = mappedProfile(records, structuredClone(profile))
      const counts = (role: (typeof records)[number]['role']) => records.filter(record => record.role === role).length
      const legacy = {
        schemaVersion: '2.0.0' as const,
        adapter: { id: 'mapped_csv_v1' as const, version: '1.3.0' },
        sourceHash: document.sourceHash,
        recordCounts: { total: records.length, positions: counts('POSITION'), controls: counts('TOTAL'), metadata: counts('METADATA'), headers: counts('HEADER'), blanks: counts('BLANK'), unsupported: counts('UNSUPPORTED') },
        ...parsed,
      }
      const draft: StatementDraft = decodeStoredStatementDraft(legacy, document.sourceHash).draft
      return {
        accounts: draft.accounts,
        controls: draft.controls,
        dispositions: records.map(record => ({ recordOrdinal: record.ordinal, role: record.role, rule: 'IMPORT_SCOPED_MAPPING' })),
        findings: parsed.issues.map(issue => ({ code: issue.code, severity: issue.severity, sourceRecords: issue.sourceRecords })),
      }
    },
  }
}

/** The registry entry never guesses. A persisted import-scoped mapping must be
 * bound explicitly for detection and parsing of one import/run. */
export const mappedCsvAdapter = Object.freeze(mappedAdapter(null))
export const createMappedCsvAdapter = (profile: MappingProfile): StatementAdapter => Object.freeze(mappedAdapter(structuredClone(profile)))
