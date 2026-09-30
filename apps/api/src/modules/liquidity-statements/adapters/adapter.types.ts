import type { StatementAccount, StatementControl, StatementFileKind } from '../liquidity-statement.types.js'
import type { StatementDocument, StatementRecord } from '../statement-document.types.js'

export interface AdapterRegion {
  regionId: string
  sheetId: string
  recordStart: number
  recordEnd: number
}

export interface AdapterMatch extends AdapterRegion {
  adapterId?: string
  adapterVersion?: string
  custodianKey?: string
}

export interface SourceDisposition {
  recordOrdinal: number
  role: StatementRecord['role']
  rule: string
}

export interface StatementFinding {
  code: string
  severity: 'INFO' | 'WARNING' | 'BLOCKING'
  sourceRecords: number[]
}

export interface AdapterResult {
  accounts: StatementAccount[]
  controls: StatementControl[]
  dispositions: SourceDisposition[]
  findings: StatementFinding[]
}

export interface StatementAdapter {
  readonly id: string
  readonly version: string
  readonly custodianKey: string
  readonly fileKind: StatementFileKind
  readonly canonicalSchemaVersion: '3.0.0'
  detect(document: Readonly<StatementDocument>): AdapterRegion[]
  parse(document: Readonly<StatementDocument>, match: Readonly<AdapterMatch>): AdapterResult
}

export type DetectionOutcome = 'MATCHED' | 'NEEDS_ADAPTER' | 'AMBIGUOUS_LAYOUT' | 'CUSTODIAN_MISMATCH'
export interface DetectionResult { outcome: DetectionOutcome; matches: AdapterMatch[] }
