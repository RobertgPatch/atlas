import type {
  StatementAccount,
  StatementControl,
  StatementField,
  StatementLocation,
  StatementPosition,
} from '../../liquidity-statement.types.js'
import type { StatementCell, StatementDocument, StatementRecord } from '../../statement-document.types.js'
import { lexicalDecimal } from '../../readers/lexical-decimal.js'
import type { AdapterMatch, AdapterResult, SourceDisposition, StatementAdapter } from '../adapter.types.js'

const VERSION = '1.0.0'
const REQUIRED_HEADERS = ['name', 'product type', 'symbol', 'cusip', 'last ($)', 'quantity', 'market value ($)'] as const
const normalize = (value: string | null) => (value ?? '').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ')
const missing = (value: string | null) => /^(?:|--|-|N\/A)$/iu.test((value ?? '').trim())
const incomplete = (value: string | null) => /^incomplete$/iu.test((value ?? '').trim())

const unavailable = (reason = 'NOT_PROVIDED', availability: StatementField['availability'] = 'UNAVAILABLE', evidence: StatementLocation[] = [], raw: string[] = []): StatementField => ({
  value: null, raw, origin: 'UNAVAILABLE', availability, evidence, derivation: null, reason, interpretation: null,
})

function cellLocation(record: StatementRecord, cell: StatementCell, header: string | null): StatementLocation {
  if (record.location.kind !== 'XLSX') throw new Error('MORGAN_STANLEY_REQUIRES_XLSX')
  return { ...record.location, column: cell.column, address: cell.address ?? `${cell.column}:${record.location.row}`, header }
}

function imported(
  record: StatementRecord,
  cell: StatementCell | undefined,
  header: string,
  kind: 'TEXT' | 'MONEY' | 'RATIO' = 'TEXT',
): StatementField {
  if (!cell) return unavailable()
  const raw = cell.lexical ?? ''
  const evidence = [cellLocation(record, cell, header)]
  if (incomplete(raw)) return unavailable('INCOMPLETE_SOURCE', 'INCOMPLETE', evidence, [raw])
  if (missing(raw)) return unavailable('NOT_PROVIDED', 'UNAVAILABLE', evidence, [raw])
  try {
    let token = raw.trim()
    const accountingNegative = token.startsWith('(') && token.endsWith(')')
    if (accountingNegative) token = token.slice(1, -1)
    if (kind === 'RATIO') token = token.replace(/%$/u, '')
    token = token.replace(/^\$/u, '').replaceAll(',', '')
    if (accountingNegative) token = `-${token}`
    if (kind === 'RATIO') {
      const [coefficient, exponent = '0'] = token.toLocaleLowerCase('en-US').split('e')
      if (exponent.length > 4 || BigInt(exponent) > 100n || BigInt(exponent) < -100n) throw new Error('DECIMAL_EXPONENT_LIMIT')
      token = `${coefficient}e${BigInt(exponent) - 2n}`
    }
    const formatSection = (cell.numberFormat ?? '').split(';')[0]!.replace(/"[^"]*"/gu, '')
    const decimalPlaces = /[0#?]+\.([0#?]+)/u.exec(formatSection)?.[1]?.length
    const sourceScale = decimalPlaces === undefined ? undefined : Math.min(kind === 'RATIO' ? decimalPlaces + 2 : decimalPlaces, kind === 'RATIO' ? 12 : 8)
    const parsed = kind === 'TEXT' ? null : lexicalDecimal(token, sourceScale ?? (kind === 'RATIO' ? 12 : 8))
    return {
      value: kind === 'TEXT' ? raw.trim() : parsed!.value,
      raw: [raw], origin: 'IMPORTED', availability: 'COMPLETE', evidence, derivation: null, reason: null,
      interpretation: {
        rule: kind === 'RATIO' ? 'MORGAN_STANLEY_PLAIN_NUMERIC_PERCENTAGE_POINTS' : 'MORGAN_STANLEY_DIRECT_FIELD',
        version: VERSION,
        sourceFields: [header],
        ...(parsed?.rounded ? { rounding: 'HALF_AWAY_FROM_ZERO' as const } : {}),
        ...(sourceScale === undefined ? {} : { sourceScale }),
      },
    }
  } catch {
    return unavailable('INVALID_DECIMAL', 'UNAVAILABLE', evidence, [raw])
  }
}

function derived(value: string, rule: string, sourceFields: string[], evidence: StatementLocation[] = []): StatementField {
  return {
    value, raw: [], origin: 'DERIVED', availability: 'COMPLETE', evidence, derivation: null, reason: null,
    interpretation: { rule, version: VERSION, sourceFields },
  }
}

function columns(header: StatementRecord): Map<string, { label: string; column: number }> {
  const result = new Map<string, { label: string; column: number }>()
  for (const cell of header.cells) {
    const key = normalize(cell.lexical)
    if (!key) continue
    if (result.has(key)) throw new Error('DUPLICATE_HEADER')
    result.set(key, { label: cell.lexical!.trim(), column: cell.column })
  }
  return result
}

function at(record: StatementRecord, index: Map<string, { label: string; column: number }>, label: string): StatementCell | undefined {
  const descriptor = index.get(normalize(label))
  return descriptor ? record.cells.find(cell => cell.column === descriptor.column) : undefined
}

function field(record: StatementRecord, index: Map<string, { label: string; column: number }>, label: string, kind: 'TEXT' | 'MONEY' | 'RATIO' = 'TEXT'): StatementField {
  return imported(record, at(record, index, label), label, kind)
}

function sourceType(record: StatementRecord, index: Map<string, { label: string; column: number }>): string {
  return (at(record, index, 'Product Type')?.lexical ?? '').trim()
}

function assetType(record: StatementRecord, index: Map<string, { label: string; column: number }>): string {
  const label = sourceType(record, index).toLocaleLowerCase('en-US')
  const name = (at(record, index, 'Name')?.lexical ?? '').toLocaleLowerCase('en-US')
  const symbol = (at(record, index, 'Symbol')?.lexical ?? '').trim().toLocaleUpperCase('en-US')
  if (label.includes('cash') || label.includes('mmf') || label.includes('bdp') || symbol === 'INGXX') return 'cash'
  if (label.includes('corporate fixed income')) return 'bond'
  if (label.includes('mutual fund')) return 'fund'
  if (label.includes('stocks / options')) return /\b(?:call|put|option|warrant)\b/iu.test(name) ? 'option' : 'equity'
  return 'other'
}

function accountMetadata(record: StatementRecord): { displayName: string; mask: string; date: string; instant: string } | null {
  const raw = record.cells.map(cell => cell.lexical ?? '').join(' ').trim()
  const match = /^Holdings for Account\s+(.+?)\s+-\s+([^\s]+)\s+as of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+ET$/iu.exec(raw)
  if (!match) return null
  const [, displayName, accountToken, month, day, year, hourToken, minute, meridiem] = match
  const date = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
  const hour = Number(hourToken) % 12 + (meridiem!.toUpperCase() === 'PM' ? 12 : 0)
  const local = new Date(`${date}T${String(hour).padStart(2, '0')}:${minute}:00Z`)
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const candidates = [4, 5].map(offset => new Date(local.valueOf() + offset * 3_600_000)).filter(candidate => {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}` === date && Number(parts.hour) === hour && parts.minute === minute
  })
  if (candidates.length !== 1) return null
  const mask = accountToken!.replace(/[^0-9A-Za-z]/gu, '').slice(-4)
  return { displayName: displayName!.trim(), mask, date, instant: candidates[0]!.toISOString() }
}

function copyWithInterpretation(source: StatementField, rule: string, sourceFields: string[]): StatementField {
  return { ...source, evidence: [...source.evidence], raw: [...source.raw], interpretation: { rule, version: VERSION, sourceFields } }
}

function parsePosition(record: StatementRecord, index: Map<string, { label: string; column: number }>): StatementPosition {
  const description = field(record, index, 'Name')
  const original = field(record, index, 'Total Cost ($)', 'MONEY')
  const adjusted = field(record, index, 'Adjusted Cost ($)', 'MONEY')
  let costBasis: StatementField
  let basisSourceField: string | null
  if (adjusted.availability === 'COMPLETE') {
    costBasis = copyWithInterpretation(adjusted, 'MORGAN_STANLEY_ADJUSTED_COST_FIRST', ['Adjusted Cost ($)'])
    basisSourceField = 'ADJUSTED_COST'
  } else if (adjusted.availability === 'INCOMPLETE') {
    costBasis = copyWithInterpretation(adjusted, 'MORGAN_STANLEY_ADJUSTED_COST_INCOMPLETE_NO_FALLBACK', ['Adjusted Cost ($)', 'Total Cost ($)'])
    basisSourceField = 'ADJUSTED_COST_INCOMPLETE'
  } else if (original.availability === 'COMPLETE') {
    costBasis = copyWithInterpretation(original, 'MORGAN_STANLEY_TOTAL_COST_FALLBACK', ['Adjusted Cost ($)', 'Total Cost ($)'])
    basisSourceField = 'TOTAL_COST'
  } else {
    costBasis = unavailable()
    basisSourceField = null
  }
  const classified = assetType(record, index)
  const sourceAssetType = field(record, index, 'Product Type')
  const asset = derived(classified, 'MORGAN_STANLEY_PRODUCT_CLASSIFICATION', ['Product Type', 'Name', 'Symbol'], sourceAssetType.evidence)
  const currency = derived('USD', 'MORGAN_STANLEY_US_EXPORT_DEFAULT', ['Market Value ($)'])
  const base = {
    occurrenceId: `morgan-position-${record.ordinal}`,
    sourceRecord: record.ordinal,
    description,
    symbol: field(record, index, 'Symbol'),
    cusip: field(record, index, 'CUSIP'),
    isin: unavailable(),
    brokerSecurityId: unavailable(),
    assetType: asset,
    sourceAssetType,
    currency,
    quantity: field(record, index, 'Quantity', 'MONEY'),
    price: field(record, index, 'Last ($)', 'MONEY'),
    marketValue: field(record, index, 'Market Value ($)', 'MONEY'),
    costBasis,
    unrealizedGainLoss: field(record, index, 'Unrealized Gain/Loss ($)', 'MONEY'),
    unrealizedGainLossRatio: field(record, index, 'Unrealized Gain/Loss (%)', 'RATIO'),
    dayChange: field(record, index, "Today's Change ($)", 'MONEY'),
    dayChangeRatio: field(record, index, "Today's Change (%)", 'RATIO'),
    accruedInterest: field(record, index, 'Accrued Interest', 'MONEY'),
    quoteMultiplier: classified === 'bond' ? derived('0.01', 'MORGAN_STANLEY_PERCENT_OF_PAR_MULTIPLIER', ['Product Type', 'Last ($)']) : derived('1', 'MORGAN_STANLEY_PER_UNIT_MULTIPLIER', ['Product Type']),
    sourceOriginalCost: original,
    sourceAdjustedCost: adjusted,
    basisSourceField,
  }
  return {
    ...base,
    valuationConvention: classified === 'bond'
      ? { priceUnit: 'PERCENT_OF_PAR', quantityUnit: 'PRINCIPAL', multiplier: '0.01', accruedInterest: 'EXCLUDED', providerIdentity: 'MORGAN_STANLEY' }
      : classified === 'equity' || classified === 'fund' || classified === 'option' || classified === 'cash' && base.quantity.availability === 'COMPLETE'
        ? { priceUnit: 'PER_UNIT', quantityUnit: classified === 'option' ? 'CONTRACTS' : 'SHARES', multiplier: '1', accruedInterest: 'UNKNOWN', providerIdentity: 'MORGAN_STANLEY' }
        : { priceUnit: 'UNKNOWN', quantityUnit: classified === 'cash' ? 'CURRENCY' : 'UNKNOWN', multiplier: null, accruedInterest: 'UNKNOWN', providerIdentity: 'MORGAN_STANLEY' },
  }
}

function control(
  accountId: string,
  metric: StatementControl['metric'],
  reported: StatementField,
  occurrenceIds: string[],
  kind: StatementControl['scope']['kind'],
  operandField: string,
): StatementControl {
  return {
    id: `${accountId}:${metric.toLocaleLowerCase('en-US')}`,
    accountOccurrenceId: accountId,
    metric,
    currency: 'USD',
    reported,
    location: reported.evidence[0]!,
    scope: { kind, occurrenceIds, operandField, rule: 'MORGAN_STANLEY_TOTAL_ROW_SCOPE', version: VERSION },
    tolerance: '0.01',
  }
}

function detectRegions(document: Readonly<StatementDocument>) {
  if (document.kind !== 'XLSX') return []
  const regions = []
  for (const sheet of document.sheets) {
    if (sheet.visibility !== 'VISIBLE') continue
    const metadataRecords = sheet.records.filter(record => accountMetadata(record) !== null)
    for (const metadata of metadataRecords) {
      const nextMetadata = metadataRecords.find(candidate => candidate.ordinal > metadata.ordinal)
      const header = sheet.records.find(record => {
        if (record.ordinal <= metadata.ordinal || nextMetadata && record.ordinal >= nextMetadata.ordinal) return false
        const labels = new Set(record.cells.map(cell => normalize(cell.lexical)))
        return REQUIRED_HEADERS.every(label => labels.has(label))
      })
      if (!header) continue
      const total = sheet.records.find(record => record.ordinal > header.ordinal
        && (!nextMetadata || record.ordinal < nextMetadata.ordinal)
        && normalize(record.cells[0]?.lexical) === 'total')
      if (!total) continue
      regions.push({
        regionId: `${sheet.name.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '-')}:${(metadata.location.kind === 'XLSX' ? metadata.location.row : metadata.ordinal)}-${(total.location.kind === 'XLSX' ? total.location.row : total.ordinal)}`,
        sheetId: sheet.id,
        recordStart: metadata.ordinal,
        recordEnd: total.ordinal,
      })
    }
  }
  return regions
}

export const morganStanleyHoldingsXlsxAdapter: StatementAdapter = {
  id: 'morgan_stanley_holdings_xlsx',
  version: VERSION,
  custodianKey: 'morgan-stanley',
  fileKind: 'XLSX',
  canonicalSchemaVersion: '3.0.0',
  detect: detectRegions,
  parse(document: Readonly<StatementDocument>, match: Readonly<AdapterMatch>): AdapterResult {
    if (document.kind !== 'XLSX') throw new Error('MORGAN_STANLEY_REQUIRES_XLSX')
    const sheet = document.sheets.find(candidate => candidate.id === match.sheetId)
    if (!sheet) throw new Error('ADAPTER_REGION_NOT_FOUND')
    const records = sheet.records.filter(record => record.ordinal >= match.recordStart && record.ordinal <= match.recordEnd)
    const metadataRecord = records.find(record => accountMetadata(record) !== null)
    const header = records.find(record => {
      const labels = new Set(record.cells.map(cell => normalize(cell.lexical)))
      return REQUIRED_HEADERS.every(label => labels.has(label))
    })
    if (!metadataRecord || !header) throw new Error('ADAPTER_STRUCTURE_CHANGED')
    const metadata = accountMetadata(metadataRecord)!
    const index = columns(header)
    const total = records.find(record => record.ordinal > header.ordinal && normalize(record.cells[0]?.lexical) === 'total')
    if (!total) throw new Error('ADAPTER_STRUCTURE_CHANGED')
    const positionRecords = records.filter(record => record.ordinal > header.ordinal && record.ordinal < total.ordinal && !missing(at(record, index, 'Name')?.lexical ?? null))
    const positions = positionRecords.map(record => parsePosition(record, index))
    const accountId = `morgan-account-${metadataRecord.ordinal}`
    const metadataCell = metadataRecord.cells[0]
    const metadataEvidence = metadataCell ? [cellLocation(metadataRecord, metadataCell, 'Account metadata')] : []
    const account: StatementAccount = {
      occurrenceId: accountId,
      identifierFingerprints: [],
      identifierQuality: 'MASKED',
      displayName: derived(metadata.displayName, 'MORGAN_STANLEY_ACCOUNT_TITLE', ['Account metadata'], metadataEvidence),
      accountMask: derived(metadata.mask, 'MORGAN_STANLEY_MASKED_ACCOUNT_TITLE', ['Account metadata'], metadataEvidence),
      currency: derived('USD', 'MORGAN_STANLEY_US_EXPORT_DEFAULT', ['Market Value ($)']),
      asOfDate: derived(metadata.date, 'MORGAN_STANLEY_STATEMENT_AS_OF', ['Account metadata'], metadataEvidence),
      asOfAt: derived(metadata.instant, 'MORGAN_STANLEY_STATEMENT_AS_OF_INSTANT', ['Account metadata'], metadataEvidence),
      sourceZone: derived('America/New_York', 'MORGAN_STANLEY_SOURCE_ZONE', ['Account metadata'], metadataEvidence),
      asOfPrecision: 'INSTANT',
      completeness: 'SUPPORTED_COMPLETE',
      sourceSections: [sheet.name],
      positions,
    }
    const originalIds = positions.filter(position => position.sourceOriginalCost?.availability === 'COMPLETE').map(position => position.occurrenceId)
    const adjustedIds = positions.filter(position => position.sourceAdjustedCost?.availability === 'COMPLETE').map(position => position.occurrenceId)
    const gainIds = positions.filter(position => position.unrealizedGainLoss.availability === 'COMPLETE').map(position => position.occurrenceId)
    const controls = [
      control(accountId, 'MARKET_VALUE', field(total, index, 'Market Value ($)', 'MONEY'), positions.map(position => position.occurrenceId), 'COMPLETE_ACCOUNT', 'marketValue'),
      control(accountId, 'ORIGINAL_COST', field(total, index, 'Total Cost ($)', 'MONEY'), originalIds, 'EXPLICIT_SUBSET', 'sourceOriginalCost'),
      control(accountId, 'ADJUSTED_COST', field(total, index, 'Adjusted Cost ($)', 'MONEY'), adjustedIds, 'EXPLICIT_SUBSET', 'sourceAdjustedCost'),
      control(accountId, 'GAIN', field(total, index, 'Unrealized Gain/Loss ($)', 'MONEY'), gainIds, 'EXPLICIT_SUBSET', 'unrealizedGainLoss'),
    ]
    const dispositions: SourceDisposition[] = records.map(record => ({
      recordOrdinal: record.ordinal,
      role: record.ordinal === metadataRecord.ordinal ? 'METADATA'
        : record.ordinal === header.ordinal ? 'HEADER'
          : record.ordinal === total.ordinal ? 'TOTAL'
            : positionRecords.some(position => position.ordinal === record.ordinal) ? 'POSITION'
              : normalize(record.cells[0]?.lexical).includes('summary') ? 'METADATA' : 'SUBTOTAL',
      rule: 'MORGAN_STANLEY_HOLDINGS_REGION',
    }))
    return { accounts: [account], controls, dispositions, findings: [] }
  },
}
