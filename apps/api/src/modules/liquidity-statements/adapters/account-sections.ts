import type { StatementDocument, StatementRecord } from '../statement-document.types.js'
import type { AdapterMatch, SourceDisposition, StatementFinding } from './adapter.types.js'

const overlaps = (left: AdapterMatch, right: AdapterMatch) => left.sheetId === right.sheetId
  && left.recordStart <= right.recordEnd && right.recordStart <= left.recordEnd

const values = (record: StatementRecord) => record.cells
  .map(cell => (cell.lexical ?? '').trim().toLocaleLowerCase('en-US'))
  .filter(Boolean)

const resemblesHoldings = (record: StatementRecord) => {
  const cells = values(record)
  const labels = new Set(cells)
  return ['name', 'symbol', 'quantity', 'market value ($)'].every(label => labels.has(label))
    || cells.some(value => /holdings\s+for\s+account/iu.test(value))
}

const isBlank = (record: StatementRecord) => record.cells.every(cell => cell.type === 'BLANK' || !(cell.lexical ?? '').trim())
const containsNumericData = (record: StatementRecord) => record.cells.some(cell => cell.type === 'NUMBER' && (cell.lexical ?? '').trim() !== '')

export function validateDeclaredAccountSections(document: Readonly<StatementDocument>, matches: readonly AdapterMatch[]): void {
  for (const match of matches) {
    const sheet = document.sheets.find(candidate => candidate.id === match.sheetId)
    if (!sheet || match.recordStart > match.recordEnd) throw Object.assign(new Error('INVALID_ADAPTER_REGION'), { code: 'AMBIGUOUS_LAYOUT' })
    const ordinals = new Set(sheet.records.map(record => record.ordinal))
    if (!ordinals.has(match.recordStart) || !ordinals.has(match.recordEnd)) throw Object.assign(new Error('INVALID_ADAPTER_REGION'), { code: 'AMBIGUOUS_LAYOUT' })
  }
  for (let left = 0; left < matches.length; left++) for (let right = left + 1; right < matches.length; right++) {
    if (overlaps(matches[left]!, matches[right]!)) throw Object.assign(new Error('OVERLAPPING_ACCOUNT_SECTIONS'), { code: 'AMBIGUOUS_LAYOUT' })
  }
}

export function classifyUnclaimedSections(document: Readonly<StatementDocument>, matches: readonly AdapterMatch[]): {
  dispositions: SourceDisposition[]
  findings: StatementFinding[]
} {
  validateDeclaredAccountSections(document, matches)
  const claimed = new Set<number>()
  for (const match of matches) for (let ordinal = match.recordStart; ordinal <= match.recordEnd; ordinal++) claimed.add(ordinal)
  const dispositions: SourceDisposition[] = []
  const hidden: number[] = [], unknown: number[] = []
  for (const sheet of document.sheets) for (const record of sheet.records) {
    if (claimed.has(record.ordinal)) continue
    if (isBlank(record)) {
      dispositions.push({ recordOrdinal: record.ordinal, role: 'BLANK', rule: 'UNCLAIMED_BLANK_RECORD' })
      continue
    }
    const holdingsLike = resemblesHoldings(record)
    if (sheet.visibility !== 'VISIBLE' && holdingsLike) {
      hidden.push(record.ordinal)
      dispositions.push({ recordOrdinal: record.ordinal, role: 'EXCLUDED_SECTION', rule: 'HIDDEN_HOLDINGS_SECTION_REQUIRES_REVIEW' })
    } else if (sheet.visibility === 'VISIBLE' && (holdingsLike || containsNumericData(record))) {
      unknown.push(record.ordinal)
      dispositions.push({ recordOrdinal: record.ordinal, role: 'UNSUPPORTED', rule: 'UNCLAIMED_DATA_SECTION' })
    } else {
      dispositions.push({ recordOrdinal: record.ordinal, role: sheet.visibility === 'VISIBLE' ? 'NOTE' : 'EXCLUDED_SECTION', rule: sheet.visibility === 'VISIBLE' ? 'UNCLAIMED_NOTE' : 'HIDDEN_NONDATA_SECTION' })
    }
  }
  const findings: StatementFinding[] = []
  if (hidden.length) findings.push({ code: 'HIDDEN_ACCOUNT_SECTION', severity: 'BLOCKING', sourceRecords: hidden })
  if (unknown.length) findings.push({ code: 'UNKNOWN_HOLDINGS_SECTION', severity: 'BLOCKING', sourceRecords: unknown })
  return { dispositions, findings }
}
