import type { StatementAccount, StatementField, StatementPosition } from '../../../src/modules/liquidity-statements/liquidity-statement.types.js'
import type { StatementDocument, StatementRecord } from '../../../src/modules/liquidity-statements/statement-document.types.js'
import { lexicalDecimal } from '../../../src/modules/liquidity-statements/readers/lexical-decimal.js'
import type { AdapterMatch, AdapterResult, StatementAdapter } from '../../../src/modules/liquidity-statements/adapters/adapter.types.js'

const id = 'synthetic_fourth_positions_csv'
const version = '1.0.0'
const labels = ['Account', 'As Of', 'Symbol', 'Description', 'Market Value', 'Currency'] as const
const key = (value: string) => value.trim().toLocaleLowerCase('en-US')
const empty = (): StatementField => ({ value: null, raw: [], origin: 'UNAVAILABLE', availability: 'UNAVAILABLE', evidence: [], derivation: null, interpretation: null, reason: 'NOT_PROVIDED' })
const field = (record: StatementRecord, column: number, header: string, value: string | null): StatementField => ({
  ...empty(), value, raw: [record.cells[column]?.lexical ?? ''], origin: value === null ? 'UNAVAILABLE' : 'IMPORTED',
  availability: value === null ? 'UNAVAILABLE' : 'COMPLETE', reason: value === null ? 'NOT_PROVIDED' : null,
  evidence: record.location.kind === 'CSV' ? [{ ...record.location, column, header }] : [],
})
const header = (record: StatementRecord) => labels.every(label => record.cells.some(cell => key(cell.lexical ?? '') === key(label)))
const namedRow = (headerRecord: StatementRecord, row: StatementRecord) => {
  if (headerRecord.cells.length !== row.cells.length) throw new Error('ROW_WIDTH_MISMATCH')
  const indexes = new Map(headerRecord.cells.map((cell, index) => [key(cell.lexical ?? ''), index]))
  if (indexes.size !== headerRecord.cells.length) throw new Error('DUPLICATE_HEADER')
  return { get: (label: string) => row.cells[indexes.get(key(label)) ?? -1] }
}

export const syntheticFourthAdapter: StatementAdapter = Object.freeze({
  id, version, custodianKey: 'synthetic_fourth', fileKind: 'CSV', canonicalSchemaVersion: '3.0.0',
  detect(document) {
    if (document.kind !== 'CSV') return []
    const match = document.records.find(header)
    return match ? [{ regionId: `synthetic-fourth:${match.ordinal}`, sheetId: document.sheets[0]!.id, recordStart: match.ordinal, recordEnd: document.records.at(-1)!.ordinal }] : []
  },
  parse(document: Readonly<StatementDocument>, match: Readonly<AdapterMatch>): AdapterResult {
    const records = document.sheets.find(sheet => sheet.id === match.sheetId)?.records ?? []
    const headerRecord = records.find(record => record.ordinal === match.recordStart)
    if (!headerRecord || !header(headerRecord)) throw new Error('INVALID_ADAPTER_MATCH')
    const first = records.find(record => record.ordinal > headerRecord.ordinal)!
    const named = namedRow(headerRecord, first)
    const account: StatementAccount = {
      occurrenceId: 'synthetic-fourth-account', identifierFingerprints: [], identifierQuality: 'FULL_RELIABLE',
      displayName: field(first, 0, 'Account', named.get('Account')?.lexical ?? null),
      accountMask: field(first, 0, 'Account', `••••${(named.get('Account')?.lexical ?? '').slice(-4)}`),
      currency: field(first, 5, 'Currency', named.get('Currency')?.lexical ?? null),
      asOfDate: field(first, 1, 'As Of', named.get('As Of')?.lexical ?? null), asOfAt: empty(), sourceZone: empty(),
      asOfPrecision: 'DATE', completeness: 'SUPPORTED_COMPLETE', sourceSections: [match.regionId], positions: [],
    }
    const result: AdapterResult = { accounts: [account], controls: [], findings: [], dispositions: [] }
    for (const record of records) {
      if (record.ordinal === headerRecord.ordinal) {
        result.dispositions.push({ recordOrdinal: record.ordinal, role: 'HEADER', rule: 'SYNTHETIC_FOURTH_HEADER' })
        continue
      }
      const row = namedRow(headerRecord, record)
      let marketValue: string | null = null
      try { marketValue = lexicalDecimal((row.get('Market Value')?.lexical ?? '').replaceAll(',', '').replace(/^\$/u, ''), 8).value } catch { /* finding below */ }
      const position: StatementPosition = {
        occurrenceId: `synthetic-fourth-position-${record.ordinal}`, sourceRecord: record.ordinal,
        symbol: field(record, 2, 'Symbol', row.get('Symbol')?.lexical ?? null),
        brokerSecurityId: empty(), cusip: empty(), description: field(record, 3, 'Description', row.get('Description')?.lexical ?? null),
        assetType: { ...field(record, 2, 'Symbol', 'equity'), interpretation: { rule: 'SYNTHETIC_FOURTH_EQUITY_EXPORT', version, sourceFields: ['Symbol'] } },
        sourceAssetType: empty(), currency: field(record, 5, 'Currency', row.get('Currency')?.lexical ?? null), quantity: empty(), price: empty(),
        marketValue: field(record, 4, 'Market Value', marketValue), costBasis: empty(), unrealizedGainLoss: empty(), unrealizedGainLossRatio: empty(),
        dayChange: empty(), dayChangeRatio: empty(), accruedInterest: empty(),
        valuationConvention: { priceUnit: 'UNKNOWN', quantityUnit: 'UNKNOWN', multiplier: null, accruedInterest: 'UNKNOWN', providerIdentity: null },
      }
      account.positions.push(position)
      result.dispositions.push({ recordOrdinal: record.ordinal, role: 'POSITION', rule: 'SYNTHETIC_FOURTH_POSITION' })
      if (marketValue === null) result.findings.push({ code: 'MALFORMED_RECORD', severity: 'BLOCKING', sourceRecords: [record.ordinal] })
    }
    return result
  },
})
