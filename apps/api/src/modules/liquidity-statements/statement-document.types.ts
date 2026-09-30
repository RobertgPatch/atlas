import type { StatementFileKind, StatementLocation } from './liquidity-statement.types.js'

export type StatementCellType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'ERROR' | 'BLANK'
export type StatementRecordRole = 'METADATA' | 'HEADER' | 'POSITION' | 'SUBTOTAL' | 'TOTAL' | 'NOTE' | 'BLANK' | 'EXCLUDED_SECTION' | 'UNSUPPORTED'

export interface StatementCell {
  column: number
  address: string | null
  type: StatementCellType
  lexical: string | null
  styleId: number | null
  numberFormat: string | null
  formula: string | null
  formulaCache: 'NONE' | 'SCALAR' | 'MISSING' | 'ERROR' | 'EXTERNAL'
  mergeAnchor: string | null
  interpretedDate?: string | null
  dateError?: 'EXCEL_1900_LEAP_DAY' | 'OUT_OF_RANGE' | null
}

export interface StatementRecord {
  ordinal: number
  location: StatementLocation
  role: StatementRecordRole
  dispositionRule: string | null
  cells: StatementCell[]
}

export interface StatementSheet {
  id: string
  name: string
  order: number
  visibility: 'VISIBLE' | 'HIDDEN' | 'VERY_HIDDEN'
  dateSystem: '1900' | '1904'
  records: StatementRecord[]
}

export interface StatementResourceCounts {
  uploadedBytes: number
  inflatedBytes: number
  zipEntries: number
  worksheets: number
  populatedCells: number
  sharedStrings: number
  decodedStringBytes: number
  styles: number
  relationships: number
}

export interface StatementDocument {
  kind: StatementFileKind
  sourceHash: string
  reader: { id: string; version: string }
  resources: StatementResourceCounts
  sheets: StatementSheet[]
  records: StatementRecord[]
}
