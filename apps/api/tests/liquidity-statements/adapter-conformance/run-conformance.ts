import { expect } from 'vitest'
import type { AdapterMatch, AdapterResult, StatementAdapter } from '../../../src/modules/liquidity-statements/adapters/adapter.types.js'
import type { StatementDocument } from '../../../src/modules/liquidity-statements/statement-document.types.js'

export interface AdapterConformanceCase<T> {
  name: string
  adapter: StatementAdapter
  document: StatementDocument
  project(result: AdapterResult): T
  expected: T
  expectedPositionCount: number
}

const matched = (adapter: StatementAdapter, document: StatementDocument): AdapterMatch => {
  const matches = adapter.detect(document)
  expect(matches, `${adapter.id} must claim exactly one fixture region`).toHaveLength(1)
  return { ...matches[0]!, adapterId: adapter.id, adapterVersion: adapter.version, custodianKey: adapter.custodianKey }
}

/** Shared executable contract for every production and test-only adapter. */
export function runAdapterConformance<T>(fixture: AdapterConformanceCase<T>): AdapterResult {
  const before = structuredClone(fixture.document)
  const match = matched(fixture.adapter, fixture.document)
  const first = fixture.adapter.parse(fixture.document, match)
  const second = fixture.adapter.parse(fixture.document, match)

  expect(second, `${fixture.name} parsing must be deterministic`).toEqual(first)
  expect(fixture.document, `${fixture.name} must not mutate reader evidence`).toEqual(before)
  expect(fixture.project(first), `${fixture.name} must match its independent golden`).toEqual(fixture.expected)
  expect(first.accounts.reduce((total, account) => total + account.positions.length, 0)).toBe(fixture.expectedPositionCount)

  const selected = fixture.document.records.filter(record =>
    record.ordinal >= match.recordStart && record.ordinal <= match.recordEnd
      && fixture.document.sheets.some(sheet => sheet.id === match.sheetId && sheet.records.some(candidate => candidate.ordinal === record.ordinal)),
  )
  const dispositions = first.dispositions.filter(item => selected.some(record => record.ordinal === item.recordOrdinal))
  expect(dispositions).toHaveLength(selected.length)
  expect(new Set(dispositions.map(item => item.recordOrdinal)).size).toBe(selected.length)
  expect(dispositions.every(item => item.rule.trim().length > 0)).toBe(true)
  expect(first.accounts.every(account => account.sourceSections.length > 0)).toBe(true)
  expect(first.accounts.every(account => account.completeness !== 'UNKNOWN')).toBe(true)
  return first
}
