import type { buildLiquidityCsvConfig } from '../liquidity-statement.config.js'
import { CsvError } from '../liquidity-statement.errors.js'
import type { MappingProfile } from '../liquidity-statement.types.js'
import type { StatementCell, StatementDocument, StatementRecord } from '../statement-document.types.js'
import { tokenizeCsv } from '../csv/parse.js'

export const CSV_READER_ID = 'bounded_csv'
export const CSV_READER_VERSION = '1.0.0'

type StatementReaderConfig = ReturnType<typeof buildLiquidityCsvConfig>
type CsvReaderOptions = Pick<MappingProfile, 'delimiter' | 'encoding'>

const cell = (lexical: string, column: number): StatementCell => ({
  column,
  address: null,
  type: lexical === '' ? 'BLANK' : 'TEXT',
  lexical,
  styleId: null,
  numberFormat: null,
  formula: null,
  formulaCache: 'NONE',
  mergeAnchor: null,
})

/**
 * Reads CSV syntax without interpreting financial meaning. Variable-width
 * metadata is retained as arrays; adapters, rather than the reader, decide
 * which records are headers, positions, controls, or unsupported content.
 */
export async function readCsvStatement(
  bytes: Buffer,
  sourceHash: string,
  limits: StatementReaderConfig,
  options: Partial<CsvReaderOptions> = {},
): Promise<StatementDocument> {
  const profile = options.delimiter || options.encoding ? {
    delimiter: options.delimiter ?? ',',
    encoding: options.encoding ?? 'UTF8',
  } as MappingProfile : undefined
  const csv = await tokenizeCsv(bytes, limits, profile)
  if (csv.length > limits.maxRows + limits.maxMetadataRecords || csv.length > limits.maxTotalRecords) {
    throw new CsvError('RESOURCE_LIMIT')
  }
  const records: StatementRecord[] = csv.map(record => ({
    ordinal: record.ordinal,
    location: {
      kind: 'CSV',
      record: record.ordinal,
      lineStart: record.lineStart,
      lineEnd: record.lineEnd,
      column: null,
      header: null,
    },
    role: record.role,
    dispositionRule: null,
    cells: record.cells.map((value, index) => cell(value, index + 1)),
  }))
  return {
    kind: 'CSV',
    sourceHash,
    reader: { id: CSV_READER_ID, version: CSV_READER_VERSION },
    resources: {
      uploadedBytes: bytes.length,
      inflatedBytes: bytes.length,
      zipEntries: 0,
      worksheets: 1,
      populatedCells: records.reduce((total, record) => total + record.cells.filter(value => value.type !== 'BLANK').length, 0),
      sharedStrings: 0,
      decodedStringBytes: records.reduce((total, record) => total + record.cells.reduce((sum, value) => sum + Buffer.byteLength(value.lexical ?? ''), 0), 0),
      styles: 0,
      relationships: 0,
    },
    sheets: [{ id: 'csv', name: 'CSV', order: 1, visibility: 'VISIBLE', dateSystem: '1900', records }],
    records,
  }
}
