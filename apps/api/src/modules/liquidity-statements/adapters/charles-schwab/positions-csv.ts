import { positionFields, type CsvField, type CsvRecord, type PositionFieldName, type StatementAccount, type StatementControl, type StatementField, type StatementPosition } from '../../liquidity-statement.types.js'
import type { StatementDocument, StatementRecord } from '../../statement-document.types.js'
import { titleAccount } from '../../csv/fields.js'
import { lexicalDecimal } from '../../readers/lexical-decimal.js'
import type { AdapterMatch, AdapterRegion, AdapterResult, StatementAdapter, StatementFinding } from '../adapter.types.js'
import { createNamedRow } from '../registry.js'

const id = 'charles_schwab_positions_csv'
const version = '1.0.0'
const key = (value: string) => value.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ')
const bindings: Readonly<Record<string, PositionFieldName>> = {
  symbol: 'symbol', description: 'description', 'qty (quantity)': 'quantity', price: 'price',
  'mkt val (market value)': 'marketValue', 'cost basis': 'costBasis',
  'gain $ (gain/loss $)': 'unrealizedGainLoss', 'gain % (gain/loss %)': 'unrealizedGainLossRatio',
  'day chng $ (day change $)': 'dayChange', 'day chng % (day change %)': 'dayChangeRatio',
  'asset type': 'sourceAssetType', currency: 'currency',
}
const requiredHeaders = ['symbol', 'description', 'qty (quantity)', 'mkt val (market value)', 'cost basis']
const textFields = new Set<PositionFieldName>(['symbol', 'description', 'sourceAssetType', 'currency'])
const products: Readonly<Record<string, string>> = {
  equity: 'equity', equities: 'equity', stock: 'equity', stocks: 'equity',
  etf: 'fund', etfs: 'fund', 'etfs & closed end funds': 'fund', 'mutual fund': 'fund', 'mutual funds': 'fund',
  cash: 'cash', 'cash and money market': 'cash', 'money market': 'cash', 'money market funds': 'cash',
  bond: 'bond', bonds: 'bond', 'fixed income': 'bond', option: 'option', options: 'option', other: 'other',
}
const interpretation = (rule: string, sourceFields: string[]) => ({ rule, version, sourceFields })
const unavailable = (): StatementField => ({ value: null, raw: [], origin: 'UNAVAILABLE', availability: 'UNAVAILABLE', evidence: [], derivation: null, interpretation: null, reason: 'NOT_PROVIDED' })
const usd = (): StatementField => ({ ...unavailable(), value: 'USD', origin: 'IMPORTED', availability: 'COMPLETE', reason: null, interpretation: interpretation('CONFIRMED_USD_DEFAULT', []) })
const isBlank = (record: StatementRecord) => record.cells.every(cell => !(cell.lexical ?? '').trim())
const isHeader = (record: StatementRecord) => {
  const headers = new Set(record.cells.map(cell => key(cell.lexical ?? '')))
  return requiredHeaders.every(header => headers.has(header))
}
const isTitle = (record: StatementRecord) => /^Positions for account\s+.+\s+as of\s+/iu.test(record.cells[0]?.lexical ?? '')

function detect(document: Readonly<StatementDocument>): AdapterRegion[] {
  if (document.kind !== 'CSV') return []
  return document.sheets.flatMap(sheet => !sheet.records.some(isHeader) ? [] : [{
    regionId: `${id}:${sheet.id}:${sheet.records[0]!.ordinal}-${sheet.records.at(-1)!.ordinal}`,
    sheetId: sheet.id, recordStart: sheet.records[0]!.ordinal, recordEnd: sheet.records.at(-1)!.ordinal,
  }])
}

function sourceField(record: StatementRecord, column: number, header: string, numeric: boolean, ratio = false): StatementField {
  if (record.location.kind !== 'CSV') throw new Error('SCHWAB_EXPECTED_CSV_LOCATION')
  const raw = record.cells[column]?.lexical ?? ''
  const field: StatementField = {
    ...unavailable(), raw: [raw], origin: 'IMPORTED', availability: 'COMPLETE', reason: null,
    evidence: [{ ...record.location, column, header }],
  }
  if (/^(?:|--|-|N\/A|Incomplete)$/iu.test(raw.trim())) {
    return { ...field, origin: 'UNAVAILABLE', availability: /^Incomplete$/iu.test(raw.trim()) ? 'INCOMPLETE' : 'UNAVAILABLE', reason: /^Incomplete$/iu.test(raw.trim()) ? 'INCOMPLETE_SOURCE' : 'NOT_PROVIDED' }
  }
  if (!numeric) return { ...field, value: raw.trim() }
  try {
    let token = raw.trim()
    const accountingNegative = token.startsWith('(') && token.endsWith(')')
    if (accountingNegative) token = token.slice(1, -1)
    if (ratio) token = token.replace(/%$/u, '')
    token = token.replace(/^\$/u, '')
    if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(token) || accountingNegative && /^[+-]/u.test(token)) throw new Error('INVALID_DECIMAL')
    token = `${accountingNegative ? '-' : ''}${token.replaceAll(',', '')}`
    if (ratio) {
      const [coefficient, exponent = '0'] = token.toLowerCase().split('e')
      // Percentage-point semantics are declared by this export, not guessed
      // from a value's magnitude. Never route money through IEEE-754.
      if (exponent.length > 4 || BigInt(exponent) > 100n || BigInt(exponent) < -100n) throw new Error('DECIMAL_EXPONENT_LIMIT')
      token = `${coefficient}e${BigInt(exponent) - 2n}`
    }
    const parsed = lexicalDecimal(token, ratio ? 12 : 8)
    return {
      ...field, value: parsed.value,
      interpretation: ratio || parsed.rounded ? {
        ...interpretation(ratio ? 'SCHWAB_PERCENT_POINTS_TO_RATIO' : 'SCHWAB_DECIMAL_QUANTIZATION', [header]),
        ...(parsed.rounded ? { rounding: 'HALF_AWAY_FROM_ZERO' as const } : {}),
      } : null,
    }
  } catch {
    return { ...field, origin: 'UNAVAILABLE', availability: 'UNAVAILABLE', reason: 'INVALID_DECIMAL' }
  }
}

function titleFields(record: StatementRecord | undefined, occurrenceId: string, regionId: string): StatementAccount {
  const account: StatementAccount = {
    occurrenceId, identifierFingerprints: [], identifierQuality: 'ABSENT',
    displayName: unavailable(), accountMask: unavailable(), currency: usd(), asOfDate: unavailable(), asOfAt: unavailable(), sourceZone: unavailable(),
    asOfPrecision: 'UNRESOLVED', completeness: 'SUPPORTED_COMPLETE', sourceSections: [regionId], positions: [],
  }
  if (!record || record.location.kind !== 'CSV') return account
  const title = record.cells[0]?.lexical ?? ''
  const accountText = title.replace(/^Positions for account\s+/iu, '').replace(/\s+as of\s+.*$/iu, '')
  const masked = /(?:\.{3,}|[\u2022*xX]{2,})[\s-]*([A-Za-z0-9]{1,4})$/u.exec(accountText)
  const full = masked ? null : /(?:^|\s)(\d[\d -]{4,}\d)$/u.exec(accountText)
  const identityToken = masked?.[0] ?? full?.[1]
  const suffix = masked?.[1] ?? full?.[1]?.replace(/[\s-]/gu, '').slice(-4)
  const mask = suffix ? `\u2022\u2022\u2022\u2022${suffix}` : null
  const safeTitle = identityToken && mask ? title.replace(identityToken, mask) : title
  const legacyRecord: CsvRecord = {
    ordinal: record.ordinal, lineStart: record.location.lineStart, lineEnd: record.location.lineEnd, role: 'METADATA', cells: [safeTitle],
  }
  const parsed = titleAccount(legacyRecord)
  const promote = (field: CsvField): StatementField => ({ ...field, evidence: field.evidence.map(location => ({ kind: 'CSV', ...location })), interpretation: interpretation('SCHWAB_TITLE_METADATA', ['source metadata']) })
  account.displayName = promote(parsed.displayName)
  account.asOfDate = promote(parsed.asOfDate)
  account.asOfAt = promote(parsed.asOfAt)
  account.sourceZone = promote(parsed.sourceZone)
  account.asOfPrecision = parsed.asOfPrecision
  if (mask) {
    account.accountMask = { ...promote(parsed.displayName), value: mask, raw: [mask], interpretation: interpretation('SCHWAB_MASKED_ACCOUNT_DISPLAY', ['source metadata']) }
    account.identifierQuality = masked ? 'MASKED' : 'FULL_RELIABLE'
  }
  // Fingerprints are deliberately absent: the trusted parent extracts full
  // identifiers from this typed title location and applies scoped HMAC keys.
  return account
}

function parse(document: Readonly<StatementDocument>, match: Readonly<AdapterMatch>): AdapterResult {
  const detected = detect(document).find(region => region.regionId === match.regionId && region.sheetId === match.sheetId && region.recordStart === match.recordStart && region.recordEnd === match.recordEnd)
  if (!detected || match.adapterId && match.adapterId !== id || match.adapterVersion && match.adapterVersion !== version || match.custodianKey && match.custodianKey !== 'charles_schwab') throw new Error('INVALID_ADAPTER_MATCH')
  const records = document.sheets.find(sheet => sheet.id === match.sheetId)!.records
  const headerIndex = records.findIndex(isHeader)
  const header = records[headerIndex]!
  createNamedRow(header, header) // Reject duplicate normalized labels before any extraction.
  const titleRecords = records.slice(0, headerIndex).filter(isTitle)
  const account = titleFields(titleRecords[0], `schwab-account-${header.ordinal}`, match.regionId)
  const result: AdapterResult = { accounts: [account], controls: [], dispositions: [], findings: [] }
  const finding = (code: string, record: StatementRecord, severity: StatementFinding['severity'] = 'BLOCKING') => {
    result.findings.push({ code, severity, sourceRecords: [record.ordinal] })
    if (severity === 'BLOCKING') account.completeness = 'REVIEW_REQUIRED'
  }
  if (!account.asOfDate.value) finding('MISSING_DATE', titleRecords[0] ?? header)
  if (titleRecords.length > 1) finding('AMBIGUOUS_ACCOUNT', titleRecords[1]!)
  if (titleRecords[0] && /\d{1,2}:\d{2}/u.test(titleRecords[0].cells[0]?.lexical ?? '') && account.asOfPrecision !== 'INSTANT') finding('UNRESOLVED_TIMESTAMP', titleRecords[0])
  let footer: { record: StatementRecord; fields: Partial<Record<PositionFieldName, StatementField>> } | null = null
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!
    let role: StatementRecord['role'], rule: string
    if (isBlank(record)) { role = 'BLANK'; rule = 'SCHWAB_BLANK' }
    else if (index === headerIndex) { role = 'HEADER'; rule = 'SCHWAB_POSITIONS_HEADER' }
    else if (index < headerIndex && isTitle(record)) { role = 'METADATA'; rule = 'SCHWAB_ACCOUNT_TITLE' }
    else if (index < headerIndex || footer || isHeader(record) || record.cells.length !== header.cells.length) {
      role = 'UNSUPPORTED'; rule = 'SCHWAB_UNSUPPORTED_SECTION'; finding('UNSUPPORTED_RECORD', record)
    } else {
      const fields: Partial<Record<PositionFieldName, StatementField>> = {}
      header.cells.forEach((cell, column) => {
        const label = cell.lexical ?? '', target = bindings[key(label)]
        if (target) fields[target] = sourceField(record, column, label, !textFields.has(target), target.endsWith('Ratio'))
      })
      const symbol = fields.symbol?.value
      if (symbol === 'Positions Total') {
        role = 'TOTAL'; rule = 'SCHWAB_ACCOUNT_TOTAL'; footer = { record, fields }
      } else {
        const category = products[key(String(fields.sourceAssetType?.value ?? ''))]
        const cashLabel = symbol === 'Cash & Cash Investments'
        const ordinarySymbol = typeof symbol === 'string' && /^[A-Za-z0-9][A-Za-z0-9.^/=_:-]{0,63}$/u.test(symbol)
        if (!cashLabel && !ordinarySymbol && !(symbol === null && category === 'cash' && fields.description?.value)) {
          role = 'UNSUPPORTED'; rule = 'SCHWAB_UNRECOGNIZED_POSITION'; finding('UNSUPPORTED_RECORD', record)
        } else {
          role = 'POSITION'; rule = 'SCHWAB_HOLDING_ROW'
          const position: StatementPosition = {
            ...Object.fromEntries(positionFields.map(name => [name, unavailable()])) as Record<PositionFieldName, StatementField>,
            ...fields, occurrenceId: `schwab-position-${record.ordinal}`, sourceRecord: record.ordinal,
            currency: fields.currency?.availability === 'COMPLETE' ? { ...fields.currency, value: String(fields.currency.value).toUpperCase() } : usd(),
            valuationConvention: { priceUnit: 'UNKNOWN', quantityUnit: 'UNKNOWN', multiplier: null, accruedInterest: 'UNKNOWN', providerIdentity: null },
          }
          if (category) position.assetType = { ...position.sourceAssetType, value: category, interpretation: interpretation('SCHWAB_ASSET_TYPE', ['Asset Type']) }
          if (cashLabel) {
            position.description = { ...position.symbol }
            position.symbol = { ...position.symbol, value: null, origin: 'UNAVAILABLE', availability: 'NOT_APPLICABLE', reason: 'CASH_WITHOUT_SYMBOL' }
            position.assetType = { ...position.description, value: 'cash', interpretation: interpretation('SCHWAB_CASH_LABEL', ['Symbol']) }
          }
          if (position.assetType.value === 'equity' || position.assetType.value === 'fund') {
            position.valuationConvention = { priceUnit: 'PER_UNIT', quantityUnit: 'SHARES', multiplier: '1', accruedInterest: 'EXCLUDED', providerIdentity: null }
          } else if (position.assetType.value === 'cash') {
            position.valuationConvention.quantityUnit = 'CURRENCY'
          }
          if (position.marketValue.value === null) finding('MISSING_VALUE', record)
          if (position.currency.value !== 'USD') finding('UNSUPPORTED_CURRENCY', record)
          for (const field of Object.values(fields)) if (field.reason === 'INVALID_DECIMAL') finding('MALFORMED_RECORD', record)
          account.positions.push(position)
        }
      }
    }
    result.dispositions.push({ recordOrdinal: record.ordinal, role, rule })
  }
  const currencies = new Set(account.positions.map(position => String(position.currency.value)))
  if (currencies.size === 1) account.currency = structuredClone(account.positions[0]!.currency)
  if (currencies.size > 1) {
    account.currency = { ...unavailable(), reason: 'MIXED_CURRENCY' }
    finding('MIXED_CURRENCY', footer?.record ?? header)
  }
  // A mixed-currency footer has no established unit and cannot be labelled USD.
  if (footer && currencies.size <= 1 && /^[A-Z]{3}$/u.test(String(account.currency.value))) {
    for (const [metric, operandField] of [['MARKET_VALUE', 'marketValue'], ['COST_BASIS', 'costBasis'], ['GAIN', 'unrealizedGainLoss']] as const) {
      const reported = footer.fields[operandField]
      if (!reported || reported.availability === 'UNAVAILABLE') {
        if (reported?.reason === 'INVALID_DECIMAL') finding('MALFORMED_RECORD', footer.record)
        continue
      }
      const complete = reported.availability === 'COMPLETE'
      const members = metric === 'MARKET_VALUE' ? account.positions : account.positions.filter(position => position[operandField].availability === 'COMPLETE')
      // Schwab's footer does not declare which rows contribute when an
      // individual basis/gain is unavailable. Availability alone is not
      // evidence of a known subtotal membership, so do not manufacture an
      // explicit subset or turn an unverifiable footer into a blocker.
      const knownScope = members.length === account.positions.length
      const scope: StatementControl['scope'] = {
        kind: !complete || !knownScope ? 'UNKNOWN' : 'COMPLETE_ACCOUNT',
        occurrenceIds: complete && knownScope ? members.map(position => position.occurrenceId) : [], operandField,
        rule: complete && knownScope ? 'SCHWAB_COMPLETE_REPORTED_ROWS' : 'SCHWAB_UNDECLARED_PARTIAL_CONTROL', version,
      }
      result.controls.push({ id: `schwab-control-${footer.record.ordinal}-${metric}`, accountOccurrenceId: account.occurrenceId, metric, currency: String(account.currency.value), reported, location: reported.evidence[0]!, scope, tolerance: '0.01' })
    }
  }
  return result
}

export const charlesSchwabPositionsCsvAdapter: StatementAdapter = Object.freeze({
  id, version, custodianKey: 'charles_schwab', fileKind: 'CSV', canonicalSchemaVersion: '3.0.0', detect, parse,
})
