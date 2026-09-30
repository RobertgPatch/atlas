import { field, sourceDate, unavailable } from '../../csv/fields.js'
import {
  positionFields,
  type CsvRecord,
  type IdentifierQuality,
  type PositionFieldName,
  type StatementAccount,
  type StatementField,
  type StatementPosition,
} from '../../liquidity-statement.types.js'
import type { StatementDocument, StatementRecord } from '../../statement-document.types.js'
import type { AdapterMatch, AdapterRegion, AdapterResult, StatementAdapter } from '../adapter.types.js'

const version = '1.0.0'
const key = (value: string) => value.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ')
const aliases = {
  asOfDate: ['COB Date'],
  accountIdentifier: ['Account #', 'Account Number'],
  accountName: ['Account Nickname'],
  brokerSecurityId: ['Security #', 'Security Number'],
  description: ['Security Description'],
  symbol: ['Symbol'],
  cusip: ['CUSIP #', 'CUSIP'],
  quantity: ['Quantity'],
  price: ['Price ($)'],
  marketValue: ['Value ($)', 'Market Value ($)'],
  costBasis: ['Cost Basis ($)', 'Cost Basis'],
  unrealizedGainLoss: ['Unrealized Gain/Loss ($)'],
  unrealizedGainLossRatio: ['Unrealized Gain/Loss (%)'],
  accruedInterest: ['Accrued Interest ($)'],
  sourceAssetType: ['Asset Type', 'Asset Class'],
  currency: ['Currency'],
  dayChange: ['Day Change ($)'],
  dayChangeRatio: ['Day Change (%)'],
} as const
type Column = keyof typeof aliases
const required: Column[] = ['asOfDate', 'accountIdentifier', 'brokerSecurityId', 'description', 'marketValue', 'unrealizedGainLoss']
const numericFields = new Set<PositionFieldName>(['quantity', 'price', 'marketValue', 'costBasis', 'unrealizedGainLoss', 'unrealizedGainLossRatio', 'accruedInterest', 'dayChange', 'dayChangeRatio'])
const knownCash = new Set(['ml bank deposit program', 'ml bank deposity program', 'blf fedfund'])
const sourceCategories: Readonly<Record<string, string>> = {
  equity: 'equity', equities: 'equity', stock: 'equity', stocks: 'equity',
  etf: 'fund', fund: 'fund', 'mutual fund': 'fund', 'mutual funds': 'fund',
  cash: 'cash', 'cash equivalents': 'cash', 'money market': 'cash',
  bond: 'bond', bonds: 'bond', 'fixed income': 'bond', option: 'option', options: 'option', other: 'other',
}
const missing = (reason = 'NOT_PROVIDED'): StatementField => ({ ...unavailable(reason), evidence: [], interpretation: null })
const blank = (record: StatementRecord) => record.cells.every(cell => !(cell.lexical ?? '').trim())

function columns(header: StatementRecord): Map<Column, number> {
  const labels = header.cells.map(cell => key(cell.lexical ?? ''))
  if (labels.some(label => !label) || new Set(labels).size !== labels.length) throw new Error('DUPLICATE_HEADER')
  const result = new Map<Column, number>()
  for (const name of Object.keys(aliases) as Column[]) {
    const accepted = new Set<string>(aliases[name].map(key))
    const matches = labels.flatMap((label, index) => accepted.has(label) ? [index] : [])
    if (matches.length > 1) throw new Error('AMBIGUOUS_COLUMN_BINDING')
    if (matches.length) result.set(name, matches[0]!)
  }
  return result
}

function detect(document: Readonly<StatementDocument>): AdapterRegion[] {
  if (document.kind !== 'CSV') return []
  return document.sheets.flatMap(sheet => {
    // This export is header-first (apart from blank records). New title or
    // summary sections require their own declared layout, not guessed skipping.
    const header = sheet.records.find(record => !blank(record))
    if (!header) return []
    const labels = new Set(header.cells.map(cell => key(cell.lexical ?? '')))
    if (!required.every(name => aliases[name].some(label => labels.has(key(label))))) return []
    const bound = columns(header)
    if (!required.every(name => bound.has(name))) return []
    return [{ regionId: `${sheet.id}:merrill-holdings:${header.ordinal}`, sheetId: sheet.id, recordStart: sheet.records[0]!.ordinal, recordEnd: sheet.records.at(-1)!.ordinal }]
  })
}

function sourceField(record: StatementRecord, header: StatementRecord, index: number | undefined, numeric = false, ratio = false, replacement?: string): StatementField {
  if (index === undefined) return missing()
  if (record.location.kind !== 'CSV') throw new Error('INVALID_ADAPTER_MATCH')
  const source: CsvRecord = {
    ordinal: record.ordinal, lineStart: record.location.lineStart, lineEnd: record.location.lineEnd,
    cells: record.cells.map(cell => cell.lexical ?? ''), role: 'POSITION',
  }
  const parsed = field(replacement ?? record.cells[index]!.lexical ?? '', source, index, header.cells[index]!.lexical ?? '', numeric, ratio)
  return {
    ...parsed,
    evidence: parsed.evidence.map(location => ({ kind: 'CSV' as const, ...location })),
    interpretation: ratio && parsed.value !== null ? { rule: 'PERCENT_POINTS_TO_RATIO', version, sourceFields: [header.cells[index]!.lexical!] } : null,
  }
}

function identifierQuality(raw: string): IdentifierQuality {
  if (!raw) return 'ABSENT'
  if (/[*•…]|x{2,}/iu.test(raw) || raw.replace(/[\s-]/gu, '').length <= 4) return 'MASKED'
  return /^[A-Z0-9]+$/iu.test(raw.replace(/[\s-]/gu, '')) ? 'FULL_RELIABLE' : 'ABSENT'
}

function parse(document: Readonly<StatementDocument>, match: Readonly<AdapterMatch>): AdapterResult {
  const valid = detect(document).find(region => region.regionId === match.regionId && region.sheetId === match.sheetId && region.recordStart === match.recordStart && region.recordEnd === match.recordEnd)
  if (!valid || match.adapterId && match.adapterId !== 'merrill_holdings_csv' || match.adapterVersion && match.adapterVersion !== version || match.custodianKey && match.custodianKey !== 'merrill_lynch') throw new Error('INVALID_ADAPTER_MATCH')
  const records = document.sheets.find(sheet => sheet.id === match.sheetId)!.records
  const header = records.find(record => !blank(record))!, bound = columns(header)
  const result: AdapterResult = { accounts: [], controls: [], dispositions: [], findings: [] }
  // Full identifiers exist only as transient map keys. Parent-side identity
  // handling can use accountMask.evidence to find and fingerprint original cells.
  const accounts = new Map<string, StatementAccount>()
  const finding = (code: string, ordinal: number, account?: StatementAccount) => {
    result.findings.push({ code, severity: 'BLOCKING', sourceRecords: [ordinal] })
    if (account) account.completeness = 'REVIEW_REQUIRED'
  }
  for (const record of records) {
    if (blank(record)) {
      result.dispositions.push({ recordOrdinal: record.ordinal, role: 'BLANK', rule: 'MERRILL_BLANK_RECORD' })
      continue
    }
    if (record.ordinal === header.ordinal || record.cells.length === header.cells.length && record.cells.every((cell, index) => key(cell.lexical ?? '') === key(header.cells[index]!.lexical ?? ''))) {
      result.dispositions.push({ recordOrdinal: record.ordinal, role: 'HEADER', rule: 'MERRILL_HOLDINGS_HEADER' })
      continue
    }
    if (record.cells.length !== header.cells.length) throw new Error('ROW_WIDTH_MISMATCH')
    const read = (name: Column, numeric = false, ratio = false) => sourceField(record, header, bound.get(name), numeric, ratio)
    const rawId = record.cells[bound.get('accountIdentifier')!]!.lexical?.trim() ?? ''
    const id = rawId.normalize('NFKC').replace(/[\s-]+/gu, '').toLocaleUpperCase('en-US')
    const description = read('description')
    // No total/footer grammar is established for this holdings export. Preserve
    // unsupported rows as such; never count a summary as another position.
    if (/^(?:grand total|account total|positions total|total|subtotal)\s*:?$/iu.test(String(description.value ?? '').trim())) {
      result.dispositions.push({ recordOrdinal: record.ordinal, role: 'UNSUPPORTED', rule: 'MERRILL_UNSUPPORTED_CONTROL' })
      finding('UNSUPPORTED_RECORD', record.ordinal)
      continue
    }
    let account = accounts.get(id || `missing:${record.ordinal}`)
    const dateField = read('asOfDate'), date = sourceDate(String(dateField.value ?? ''), 'M/D/YYYY')
    const currency = read('currency')
    if (typeof currency.value === 'string') currency.value = currency.value.toUpperCase()
    if (!account) {
      const mask = rawId.replace(/[\s-]/gu, '').slice(-4)
      const name = read('accountName')
      if (rawId && typeof name.value === 'string') {
        name.value = name.value.replaceAll(rawId, `…${mask}`)
        name.raw = name.raw.map(value => value.replaceAll(rawId, `…${mask}`))
      }
      account = {
        occurrenceId: `account-${accounts.size + 1}`, identifierFingerprints: [], identifierQuality: identifierQuality(rawId),
        displayName: name, accountMask: sourceField(record, header, bound.get('accountIdentifier'), false, false, mask),
        currency: structuredClone(currency), asOfDate: date ? { ...dateField, value: date, interpretation: { rule: 'MERRILL_COB_DATE', version, sourceFields: ['COB Date'] } } : { ...dateField, value: null, origin: 'UNAVAILABLE', availability: 'UNAVAILABLE', reason: 'INVALID_DATE' },
        asOfAt: missing(), sourceZone: missing(), asOfPrecision: date ? 'DATE' : 'UNRESOLVED',
        completeness: 'SUPPORTED_COMPLETE', sourceSections: [match.regionId], positions: [],
      }
      accounts.set(id || `missing:${record.ordinal}`, account)
      result.accounts.push(account)
      if (account.identifierQuality === 'ABSENT') finding('AMBIGUOUS_ACCOUNT', record.ordinal, account)
    }
    if (!date || account.asOfDate.value !== date) finding('MISSING_DATE', record.ordinal, account)
    if (currency.value !== null) {
      if (!/^[A-Z]{3}$/u.test(String(currency.value))) finding('MISSING_CURRENCY', record.ordinal, account)
      else if (account.currency.value === null) account.currency = structuredClone(currency)
      else if (account.currency.value !== currency.value) finding('MISSING_CURRENCY', record.ordinal, account)
    }
    const fields = Object.fromEntries(positionFields.map(name => [name, missing()])) as Record<PositionFieldName, StatementField>
    for (const name of Object.keys(aliases) as Column[]) {
      if (!positionFields.includes(name as PositionFieldName)) continue
      const target = name as PositionFieldName
      fields[target] = read(name, numericFields.has(target), target.endsWith('Ratio'))
      if (fields[target].reason === 'INVALID_DECIMAL') finding('MALFORMED_RECORD', record.ordinal, account)
    }
    fields.currency = currency
    const cashProgram = knownCash.has(key(String(description.value ?? '')))
    const category = cashProgram ? 'cash' : sourceCategories[key(String(fields.sourceAssetType.value ?? ''))]
    if (category) {
      const evidence = cashProgram ? description : fields.sourceAssetType
      fields.assetType = { ...structuredClone(evidence), value: category, interpretation: { rule: cashProgram ? 'MERRILL_KNOWN_CASH_PROGRAM' : 'MERRILL_SOURCE_CATEGORY', version, sourceFields: [cashProgram ? 'Security Description' : header.cells[bound.get('sourceAssetType')!]!.lexical!] } }
    }
    if (fields.marketValue.value === null) finding('MISSING_VALUE', record.ordinal, account)
    const position: StatementPosition = {
      occurrenceId: `row-${record.ordinal}`, sourceRecord: record.ordinal, ...fields,
      valuationConvention: { priceUnit: 'UNKNOWN', quantityUnit: 'UNKNOWN', multiplier: null, accruedInterest: 'UNKNOWN', providerIdentity: null },
    }
    account.positions.push(position)
    result.dispositions.push({ recordOrdinal: record.ordinal, role: 'POSITION', rule: 'MERRILL_HOLDINGS_POSITION' })
  }
  if (!result.accounts.length) finding('AMBIGUOUS_ACCOUNT', header.ordinal)
  return result
}

export const merrillHoldingsCsvAdapter: StatementAdapter = {
  id: 'merrill_holdings_csv', version, custodianKey: 'merrill_lynch', fileKind: 'CSV', canonicalSchemaVersion: '3.0.0', detect, parse,
}
