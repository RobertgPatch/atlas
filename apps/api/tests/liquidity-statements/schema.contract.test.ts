import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decimalString, ratioString, uploadRequestSchema, mappingProfileSchema, reviewSchema } from '../../src/modules/liquidity-statements/liquidity-statement.zod.js'
import { statementLocationSchema, statementFieldSchema, statementControlSchema, statementRecipeSchema, statementRecipeHash } from '../../src/modules/liquidity-statements/statement-draft.compat.js'
const canonical = JSON.parse(readFileSync(new URL('../../../../specs/031-liquidity-redesign-statement-upload/contracts/csv-import-schema.json', import.meta.url), 'utf8'))
describe('CSV contract boundaries', () => {
  it('matches canonical decimal grammar including fractional negative values', () => {
    const money = new RegExp(canonical.$defs.DecimalField.allOf[1].properties.value.pattern)
    const ratio = new RegExp(canonical.$defs.RatioField.allOf[1].properties.value.pattern)
    for (const value of ['0', '-200.25', '12345678901234567890.12345678']) {
      expect(decimalString.safeParse(value).success).toBe(true)
      expect(money.test(value)).toBe(true)
    }
    expect(ratio.test('-0.202712345678')).toBe(true)
    expect(ratioString.safeParse('10000000000000000').success).toBe(false)
    expect(decimalString.safeParse('1e8').success).toBe(false)
  })
  it('rejects upload overlimits and client-supplied object keys', () => {
    const body = { entityId: '11111111-1111-4111-8111-111111111111', fileName: 'fixture.csv', sizeBytes: 12, sha256: 'a'.repeat(64), contentType: 'text/csv', custodian: 'Synthetic' }
    expect(uploadRequestSchema.safeParse(body).success).toBe(true)
    expect(uploadRequestSchema.safeParse({ ...body, storageKey: 'other/file' }).success).toBe(false)
    expect(uploadRequestSchema.safeParse({ ...body, sizeBytes: 10485761 }).success).toBe(false)
  })
  it('rejects executable mappings and arbitrary correction paths', () => {
    expect(mappingProfileSchema.safeParse({ expression: 'process.exit()' }).success).toBe(false)
    expect(reviewSchema.safeParse({ expectedVersion: 1, changes: [{ fieldPath: '__proto__.value', value: 'bad', reason: 'test' }], accountBindings: [] }).success).toBe(false)
  })
})

describe('statement schema-3 contract boundaries', () => {
  const location = { kind: 'XLSX', sheetId: 'sheet-1', sheetName: 'Synthetic Holdings', row: 12, column: 5, address: 'E12', header: 'Market Value' }
  const field = { value: '9007199254740993.12345678', raw: ['9007199254740993.123456789'], origin: 'IMPORTED', availability: 'COMPLETE', evidence: [location], derivation: null, interpretation: { rule: 'SOURCE_QUANTIZATION', version: '1.0.0', sourceFields: ['E12'], rounding: 'HALF_AWAY_FROM_ZERO' }, reason: null }
  const recipe = {
    reader: { id: 'xlsx', version: '1.0.0' }, registryRevision: 'registry-1', limitsRevision: 'limits-1',
    adapters: [{ id: 'synthetic_holdings_xlsx', version: '1.0.0', regionId: 'sheet-1:holdings' }],
    schemaVersion: '3.0.0', normalizerVersion: '2.0.0', reconcilerVersion: '2.0.0', classificationCatalogVersion: 'catalog-1',
    accountIdentityVersion: '1.0.0', structuralSelection: ['sheet-1:holdings'], mapping: null,
  }

  it('distinguishes physical CSV spans from real worksheet coordinates', () => {
    expect(statementLocationSchema.parse(location)).toEqual(location)
    expect(statementLocationSchema.parse({ kind: 'CSV', record: 4, lineStart: 4, lineEnd: 6, column: 0, header: 'Description' })).toMatchObject({ lineEnd: 6, column: 0 })
    for (const invalid of [
      { ...location, lineStart: 12, lineEnd: 12 }, { ...location, row: 0 }, { ...location, column: 0 }, { ...location, address: 'D12' },
      { kind: 'CSV', record: 4, lineStart: 6, lineEnd: 4, column: 0, header: 'Value' },
    ]) expect(statementLocationSchema.safeParse(invalid).success).toBe(false)
  })

  it('keeps exact financial strings and interpretations separate from recalculable derivations', () => {
    const parsed = statementFieldSchema.parse(field)
    expect(parsed.value).toBe('9007199254740993.12345678')
    expect(parsed.raw).toEqual(['9007199254740993.123456789'])
    expect(parsed.interpretation?.rule).toBe('SOURCE_QUANTIZATION')
    expect(parsed.derivation).toBeNull()
    expect(statementFieldSchema.safeParse({ ...field, value: 9007199254740992 }).success).toBe(false)
    const derived = statementFieldSchema.parse({ ...field, value: '40', raw: [], origin: 'DERIVED', interpretation: null, derivation: { rule: 'GAIN_FROM_VALUE_BASIS', version: '2.0.0', operands: ['marketValue', 'costBasis'], estimated: false } })
    expect(derived.derivation?.operands).toEqual(['marketValue', 'costBasis'])
    expect(derived.interpretation).toBeNull()
  })

  it('preserves zero, incomplete, unavailable and not-applicable as distinct states', () => {
    expect(statementFieldSchema.parse({ ...field, value: '0' }).value).toBe('0')
    for (const availability of ['INCOMPLETE', 'UNAVAILABLE', 'NOT_APPLICABLE']) {
      expect(statementFieldSchema.parse({ ...field, value: null, availability, origin: 'UNAVAILABLE', interpretation: null }).availability).toBe(availability)
    }
    expect(statementFieldSchema.safeParse({ ...field, value: null }).success).toBe(false)
    expect(statementFieldSchema.safeParse({ ...field, value: '0', availability: 'UNAVAILABLE' }).success).toBe(false)
  })

  it('requires explicit control metric, source subset, currency and tolerance', () => {
    const control = { id: 'basis-control', accountOccurrenceId: 'account-1', metric: 'ADJUSTED_COST', currency: 'USD', reported: { ...field, value: '160' }, location,
      scope: { kind: 'EXPLICIT_SUBSET', occurrenceIds: ['position-1'], operandField: 'sourceAdjustedCost', rule: 'REPORTED_ADJUSTED_COST_ROWS', version: '1.0.0' }, tolerance: '0.01' }
    expect(statementControlSchema.parse(control).scope.occurrenceIds).toEqual(['position-1'])
    expect(statementControlSchema.safeParse({ ...control, scope: undefined }).success).toBe(false)
    expect(statementControlSchema.safeParse({ ...control, tolerance: '-0.01' }).success).toBe(false)
    expect(statementControlSchema.safeParse({ ...control, scope: { ...control.scope, occurrenceIds: ['position-1', 'position-1'] } }).success).toBe(false)
  })

  it('binds each parser layer and structural choice to recipe identity without accepting secrets or executable mappings', () => {
    expect(statementRecipeSchema.parse(recipe)).toEqual(recipe)
    const baseline = statementRecipeHash(recipe)
    expect(statementRecipeHash(Object.fromEntries(Object.entries(recipe).reverse()))).toBe(baseline)
    for (const changed of [
      { ...recipe, reader: { ...recipe.reader, version: '1.0.1' } },
      { ...recipe, adapters: [{ ...recipe.adapters[0], version: '1.0.1' }] },
      { ...recipe, normalizerVersion: '2.0.1' }, { ...recipe, reconcilerVersion: '2.0.1' },
      { ...recipe, classificationCatalogVersion: 'catalog-2' }, { ...recipe, limitsRevision: 'limits-2' },
      { ...recipe, structuralSelection: ['sheet-1:other-table'] },
    ]) expect(statementRecipeHash(changed)).not.toBe(baseline)
    expect(statementRecipeSchema.safeParse({ ...recipe, hmacKey: 'synthetic-secret-canary' }).success).toBe(false)
    expect(statementRecipeSchema.safeParse({ ...recipe, mapping: { expression: 'process.exit()' } }).success).toBe(false)
  })
})
