import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decimalString, ratioString, uploadRequestSchema, mappingProfileSchema, reviewSchema } from '../../src/modules/liquidity-statements/liquidity-statement.zod.js'
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
