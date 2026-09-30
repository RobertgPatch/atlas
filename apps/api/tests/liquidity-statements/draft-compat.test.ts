import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decodeStoredStatementDraft } from '../../src/modules/liquidity-statements/statement-draft.compat.js'
import { positionFields, type CsvDraft, type CsvField } from '../../src/modules/liquidity-statements/liquidity-statement.types.js'

const storedHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const field = (value: string | null, availability: CsvField['availability'] = value === null ? 'UNAVAILABLE' : 'COMPLETE'): CsvField => ({
  value, raw: value === null ? ['--'] : [value], origin: value === null ? 'UNAVAILABLE' : 'IMPORTED', availability,
  evidence: [{ record: 4, lineStart: 4, lineEnd: 4, column: 0, header: 'Synthetic source' }], derivation: null, reason: null,
})
const legacyFixture = (): CsvDraft => ({
  schemaVersion: '2.0.0', adapter: { id: 'positions_v1', version: '1.3.0' }, sourceHash: 'a'.repeat(64),
  recordCounts: { total: 5, positions: 2, controls: 1, metadata: 1, headers: 1, blanks: 0, unsupported: 0 }, issues: [],
  accounts: [{ occurrenceId: 'account-1', identifierFingerprints: [], displayName: field('Synthetic account'), accountMask: field('1234'),
    currency: field('USD'), asOfDate: field('2026-09-01'), asOfAt: field(null), sourceZone: field(null), asOfPrecision: 'DATE', reportedTotal: field('235'), reportedBasis: field('160'),
    positions: [
      { occurrenceId: 'row-4', sourceRecord: 4, ...Object.fromEntries(positionFields.map(name => [name, field(null)])), symbol: field('DEMO'), assetType: field('equity'), currency: field('USD'), quantity: field('12.5'), marketValue: field('200'), costBasis: field('160'), unrealizedGainLoss: field('40') },
      { occurrenceId: 'row-5', sourceRecord: 5, ...Object.fromEntries(positionFields.map(name => [name, field(null)])), symbol: field('OTHER'), assetType: field('other'), currency: field('USD'), price: field('1'), marketValue: field('35'), costBasis: { ...field('35'), origin: 'DERIVED', derivation: { rule: 'CASH_AT_PAR', version: '1.0.0', operands: ['marketValue', 'price'], estimated: false } } },
    ] as CsvDraft['accounts'][number]['positions'],
  }],
})

describe('immutable stored statement compatibility projection', () => {
  it('keeps old amounts, adapter evidence and stored operation hash without applying new cash rules', () => {
    const stored = legacyFixture(), original = structuredClone(stored), hash = storedHash(stored)
    const result = decodeStoredStatementDraft(stored, hash)
    expect(result.sourceSchemaVersion).toBe('2.0.0')
    expect(result.storedCanonicalHash).toBe(hash)
    expect(result.draft.schemaVersion).toBe('3.0.0')
    expect(result.draft.adapter).toEqual({ id: 'positions_v1', version: '1.3.0' })
    expect(result.draft.recipe).toBeNull()
    expect(result.draft.accounts[0]!.positions[1]!.costBasis.value).toBe('35')
    expect(result.draft.accounts[0]!.positions[1]!.costBasis.derivation?.rule).toBe('CASH_AT_PAR')
    expect(stored).toEqual(original)
    expect(storedHash(stored)).toBe(hash)
    result.draft.accounts[0]!.positions[0]!.marketValue.value = '999'
    expect(stored.accounts[0]!.positions[0]!.marketValue.value).toBe('200')
  })

  it('tags legacy source locations but never invents quote eligibility or control membership', () => {
    const result = decodeStoredStatementDraft(legacyFixture(), 'b'.repeat(64))
    expect(result.draft.accounts[0]!.positions[0]!.marketValue.evidence[0]).toMatchObject({ kind: 'CSV', record: 4, lineStart: 4, column: 0 })
    expect(result.draft.accounts[0]!.positions[0]!.valuationConvention).toEqual({ priceUnit: 'UNKNOWN', quantityUnit: 'UNKNOWN', multiplier: null, accruedInterest: 'UNKNOWN', providerIdentity: null })
    const basisControl = result.draft.controls.find(control => control.metric === 'COST_BASIS')!
    expect(basisControl.reported.value).toBe('160')
    expect(basisControl.scope).toMatchObject({ kind: 'UNKNOWN', occurrenceIds: [], rule: 'LEGACY_SCOPE_UNKNOWN' })
    expect(result.draft.controls.every(control => control.scope.kind === 'UNKNOWN')).toBe(true)
  })

  it('preserves incomplete and zero source fields and tolerates older missing optional fingerprints', () => {
    const stored = legacyFixture()
    stored.accounts[0]!.positions[0]!.costBasis = field('0', 'INCOMPLETE')
    delete (stored.accounts[0] as Partial<CsvDraft['accounts'][number]>).identifierFingerprints
    const result = decodeStoredStatementDraft(stored, storedHash(stored))
    expect(result.draft.accounts[0]!.identifierFingerprints).toEqual([])
    expect(result.draft.accounts[0]!.positions[0]!.costBasis).toMatchObject({ value: '0', availability: 'INCOMPLETE' })
    expect(result.draft.accounts[0]!.positions[1]!.quantity.value).toBeNull()
    expect('identifierFingerprints' in stored.accounts[0]!).toBe(false)
  })

  it('fails visibly for unknown schemas and malformed stored amounts instead of guessing a new approval', () => {
    expect(() => decodeStoredStatementDraft({ ...legacyFixture(), schemaVersion: '99.0.0' }, 'c'.repeat(64))).toThrow()
    const stored = legacyFixture()
    stored.accounts[0]!.positions[0]!.marketValue.value = 200 as unknown as string
    expect(() => decodeStoredStatementDraft(stored, 'c'.repeat(64))).toThrow()
  })
})
