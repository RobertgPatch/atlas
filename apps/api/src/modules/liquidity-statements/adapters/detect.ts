import type { StatementDocument } from '../statement-document.types.js'
import type { AdapterMatch, DetectionResult, StatementAdapter } from './adapter.types.js'
import type { StatementAdapterRegistry } from './registry.js'
import { validateDeclaredAccountSections } from './account-sections.js'

export interface DetectionOptions {
  custodianKey?: string
  hint?: { id: string; version: string }
}

const decorate = (adapter: StatementAdapter, match: ReturnType<StatementAdapter['detect']>[number]): AdapterMatch => ({
  ...match, adapterId: adapter.id, adapterVersion: adapter.version, custodianKey: adapter.custodianKey,
})
const overlaps = (left: AdapterMatch, right: AdapterMatch) => left.sheetId === right.sheetId
  && left.recordStart <= right.recordEnd && right.recordStart <= left.recordEnd

export function detectStatementAdapters(
  document: Readonly<StatementDocument>,
  registry: StatementAdapterRegistry,
  options: DetectionOptions = {},
): DetectionResult {
  let adapters = registry.compatible(document.kind)
  if (options.hint) {
    const selected = registry.get(options.hint.id, options.hint.version)
    if (!selected || selected.fileKind !== document.kind) throw new Error('INVALID_ADAPTER_HINT')
    adapters = [selected]
  }
  const matches = adapters.flatMap(adapter => adapter.detect(document).map(match => decorate(adapter, match)))
    .sort((left, right) => left.sheetId.localeCompare(right.sheetId) || left.recordStart - right.recordStart || (left.adapterId ?? '').localeCompare(right.adapterId ?? ''))
  if (options.hint && matches.length === 0) throw new Error('INVALID_ADAPTER_HINT')
  if (matches.length === 0) return { outcome: 'NEEDS_ADAPTER', matches: [] }
  if (options.custodianKey && matches.some(match => match.custodianKey !== options.custodianKey)) {
    return { outcome: 'CUSTODIAN_MISMATCH', matches }
  }
  for (let left = 0; left < matches.length; left++) {
    for (let right = left + 1; right < matches.length; right++) {
      if (overlaps(matches[left]!, matches[right]!)) return { outcome: 'AMBIGUOUS_LAYOUT', matches }
    }
  }
  validateDeclaredAccountSections(document, matches)
  return { outcome: 'MATCHED', matches }
}
