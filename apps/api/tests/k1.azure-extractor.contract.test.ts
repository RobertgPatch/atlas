/**
 * Azure Document Intelligence — K-1 Extractor Contract Test
 *
 * Validates the pure mapping function against the synthetic fixture file so CI
 * never needs network access. Per contracts/azure-extractor.contract.md §3.2.
 */
import { describe, it, expect } from 'vitest'
import { mapAzureAnalyzeResult, type AnalyzeResult } from '../src/modules/k1/extraction/mapAzureAnalyzeResult.js'
import { azureFieldMap } from '../src/modules/k1/extraction/azureFieldMap.js'
import fixture from './fixtures/azure-di-analyze-result.sample.json'

const ctx = { k1DocumentId: 'k1-contract-test' }

// ---------------------------------------------------------------------------
// §3.2-1  Happy-path: outcome must be SUCCESS
// ---------------------------------------------------------------------------
describe('mapAzureAnalyzeResult — happy path', () => {
  const result = mapAzureAnalyzeResult(fixture as unknown as AnalyzeResult, ctx)

  it('returns outcome SUCCESS', () => {
    expect(result.outcome).toBe('SUCCESS')
  })

  it('produces exactly one fieldValue per azureFieldMap entry', () => {
    if (result.outcome !== 'SUCCESS') throw new Error('result is FAILURE')
    expect(result.fieldValues).toHaveLength(azureFieldMap.length)
  })

  it('every canonical fieldName from azureFieldMap appears exactly once', () => {
    if (result.outcome !== 'SUCCESS') throw new Error('result is FAILURE')
    const names = result.fieldValues.map((fv) => fv.fieldName)
    const unique = new Set(names)
    expect(unique.size).toBe(azureFieldMap.length)
    for (const entry of azureFieldMap) {
      expect(unique).toContain(entry.canonicalName)
    }
  })
})

// ---------------------------------------------------------------------------
// §3.2-2  Spot-checks for specific field values
// ---------------------------------------------------------------------------
describe('mapAzureAnalyzeResult — field value assertions', () => {
  const result = mapAzureAnalyzeResult(fixture as unknown as AnalyzeResult, ctx)
  if (result.outcome !== 'SUCCESS') throw new Error('result is FAILURE')
  const byName = Object.fromEntries(result.fieldValues.map((fv) => [fv.fieldName, fv]))

  it('partnership_ein.rawValue is "12-3456789"', () => {
    expect(byName['partnership_ein']?.rawValue).toBe('12-3456789')
  })

  it('partnership_name.rawValue contains "IRON TRIANGLE FUND"', () => {
    expect(byName['partnership_name']?.rawValue).toContain('IRON TRIANGLE FUND')
  })

  it('box_1_ordinary_income.rawValue is "12345.67" (2 decimal places)', () => {
    expect(byName['box_1_ordinary_income']?.rawValue).toBe('12345.67')
  })

  it('box_19_distributions.rawValue is "50000.00" (2 decimal places)', () => {
    expect(byName['box_19_distributions']?.rawValue).toBe('50000.00')
  })

  it('box_5_interest_income.rawValue is "234.56"', () => {
    expect(byName['box_5_interest_income']?.rawValue).toBe('234.56')
  })

  it('profit_share_ending.rawValue is formatted to 6 decimal places', () => {
    // Fixture valueNumber = 3.0329
    expect(byName['profit_share_ending']?.rawValue).toBe('3.032900')
  })

  it('loss_share_ending.rawValue is formatted to 6 decimal places', () => {
    expect(byName['loss_share_ending']?.rawValue).toBe('3.032900')
  })

  it('capital_share_ending.rawValue is formatted to 6 decimal places', () => {
    expect(byName['capital_share_ending']?.rawValue).toBe('3.032900')
  })

  it('all currency rawValues are formatted to exactly 2 decimal places', () => {
    const currencyEntries = azureFieldMap.filter((e) => e.valueKind === 'currency')
    for (const entry of currencyEntries) {
      const fv = byName[entry.canonicalName]
      if (fv?.rawValue != null) {
        expect(fv.rawValue).toMatch(/^-?\d+\.\d{2}$/)
      }
    }
  })

  it('all percentage rawValues are formatted to exactly 6 decimal places', () => {
    const pctEntries = azureFieldMap.filter((e) => e.valueKind === 'percentage')
    for (const entry of pctEntries) {
      const fv = byName[entry.canonicalName]
      if (fv?.rawValue != null) {
        expect(fv.rawValue).toMatch(/^-?\d+\.\d{6}$/)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// §3.2-3  Data integrity: no duplicate fieldNames, all valid sections
// ---------------------------------------------------------------------------
describe('mapAzureAnalyzeResult — data integrity', () => {
  const result = mapAzureAnalyzeResult(fixture as unknown as AnalyzeResult, ctx)
  if (result.outcome !== 'SUCCESS') throw new Error('result is FAILURE')

  it('no duplicate fieldNames in output', () => {
    const names = result.fieldValues.map((fv) => fv.fieldName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('all fieldValues have valid section values', () => {
    const validSections = new Set(['entityMapping', 'partnershipMapping', 'core'])
    for (const fv of result.fieldValues) {
      expect(validSections).toContain(fv.section)
    }
  })

  it('required flag matches azureFieldMap entry', () => {
    const mapByName = Object.fromEntries(azureFieldMap.map((e) => [e.canonicalName, e]))
    for (const fv of result.fieldValues) {
      expect(fv.required).toBe(mapByName[fv.fieldName]?.required)
    }
  })
})

// ---------------------------------------------------------------------------
// §3.2-4  Issue generation: MISSING_FIELD for required fields absent from fixture
// ---------------------------------------------------------------------------
describe('mapAzureAnalyzeResult — issue emission', () => {
  const result = mapAzureAnalyzeResult(fixture as unknown as AnalyzeResult, ctx)
  if (result.outcome !== 'SUCCESS') throw new Error('result is FAILURE')

  it('emits MISSING_FIELD issue for every required field with rawValue null', () => {
    const missingRequired = result.fieldValues.filter((fv) => fv.required && fv.rawValue === null)
    const missingFieldIssues = result.issues.filter((i) => i.issueType === 'MISSING_FIELD')
    expect(missingFieldIssues.length).toBe(missingRequired.length)
  })

  it('MISSING_FIELD issues have severity MEDIUM', () => {
    const missingFieldIssues = result.issues.filter((i) => i.issueType === 'MISSING_FIELD')
    for (const issue of missingFieldIssues) {
      expect(issue.severity).toBe('MEDIUM')
    }
  })

  it('emits LOW_CONFIDENCE issue for fields with confidence < 0.5', () => {
    const lowConfFields = result.fieldValues.filter(
      (fv) => fv.confidenceScore < 0.5,
    )
    const lowConfIssues = result.issues.filter((i) => i.issueType === 'LOW_CONFIDENCE')
    expect(lowConfIssues.length).toBe(lowConfFields.length)
  })

  it('LOW_CONFIDENCE issues have severity LOW', () => {
    const lowConfIssues = result.issues.filter((i) => i.issueType === 'LOW_CONFIDENCE')
    for (const issue of lowConfIssues) {
      expect(issue.severity).toBe('LOW')
    }
  })

  it('LOW_CONFIDENCE fields retain their rawValue (not cleared)', () => {
    for (const fv of result.fieldValues) {
      if (fv.confidenceScore < 0.5 && fv.rawValue === null) {
        // Check it's not in the fixture data — rawValue null here means the field
        // simply wasn't in the fixture, not that it was cleared due to low confidence
        const matchingIssues = result.issues.filter(
          (i) => i.issueType === 'MISSING_FIELD' && i.message.includes(fv.label),
        )
        // Either it's absent from the fixture (MISSING_FIELD issue) or rawValue is non-null
        expect(matchingIssues.length).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// §3.2-5  nextStatus logic
// ---------------------------------------------------------------------------
describe('mapAzureAnalyzeResult — nextStatus', () => {
  it('returns NEEDS_REVIEW when any issues exist', () => {
    const result = mapAzureAnalyzeResult(fixture as unknown as AnalyzeResult, ctx)
    if (result.outcome !== 'SUCCESS') throw new Error('result is FAILURE')
    if (result.issues.length > 0) {
      expect(result.nextStatus).toBe('NEEDS_REVIEW')
    }
  })

  it('returns READY_FOR_APPROVAL when no issues and all required fields present', () => {
    // Build a minimal result-like object where all required fields are populated
    // by injecting every required azurePath into a synthetic AnalyzeResult.
    const syntheticFields: Record<string, unknown> = {}

    // Helper to set nested valueObject path
    const setNested = (
      root: Record<string, unknown>,
      path: string,
      leaf: unknown,
    ) => {
      const parts = path.split('.')
      let cur = root
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i]
        if (!cur[key]) {
          cur[key] = { type: 'object', valueObject: {} }
        }
        cur = (cur[key] as { valueObject: Record<string, unknown> }).valueObject
      }
      cur[parts[parts.length - 1]] = leaf
    }

    for (const entry of azureFieldMap) {
      let leaf: unknown
      switch (entry.valueKind) {
        case 'string':
          leaf = { type: 'string', valueString: 'TEST', content: 'TEST', confidence: 0.99 }
          break
        case 'currency':
          leaf = { type: 'currency', valueCurrency: { amount: 0, currencyCode: 'USD' }, confidence: 0.99 }
          break
        case 'percentage':
          leaf = { type: 'number', valueNumber: 1.0, confidence: 0.99 }
          break
        case 'number':
          leaf = { type: 'number', valueNumber: 0, confidence: 0.99 }
          break
        case 'boolean':
          leaf = { type: 'boolean', valueBoolean: false, content: 'No', confidence: 0.99 }
          break
        case 'date':
          leaf = { type: 'date', valueDate: '2025-01-01', confidence: 0.99 }
          break
        default:
          leaf = { type: 'string', valueString: '', confidence: 0.99 }
      }
      setNested(syntheticFields, entry.azurePath, leaf)
    }

    const syntheticResult: AnalyzeResult = {
      documents: [{ docType: 'tax.us.1065SchK1', fields: syntheticFields as Record<string, { type?: string; valueString?: string; valueNumber?: number; valueCurrency?: { amount: number }; valueBoolean?: boolean; valueDate?: string; valueObject?: Record<string, unknown>; content?: string; confidence?: number }> }],
    }

    const mapped = mapAzureAnalyzeResult(syntheticResult, ctx)
    if (mapped.outcome !== 'SUCCESS') throw new Error('result is FAILURE')
    expect(mapped.issues).toHaveLength(0)
    expect(mapped.nextStatus).toBe('READY_FOR_APPROVAL')
  })
})

// ---------------------------------------------------------------------------
// §3.2-6  Failure path: no documents in result
// ---------------------------------------------------------------------------
describe('mapAzureAnalyzeResult — failure paths', () => {
  it('returns FAILURE with PARSE_SCHEMA_MISMATCH when documents is empty', () => {
    const empty: AnalyzeResult = { documents: [] }
    const result = mapAzureAnalyzeResult(empty, ctx)
    expect(result.outcome).toBe('FAILURE')
    if (result.outcome === 'FAILURE') {
      expect(result.errorCode).toBe('PARSE_SCHEMA_MISMATCH')
    }
  })

  it('returns FAILURE with PARSE_SCHEMA_MISMATCH when fields is missing', () => {
    const noFields: AnalyzeResult = { documents: [{ docType: 'tax.us.1065SchK1' }] }
    const result = mapAzureAnalyzeResult(noFields, ctx)
    expect(result.outcome).toBe('FAILURE')
    if (result.outcome === 'FAILURE') {
      expect(result.errorCode).toBe('PARSE_SCHEMA_MISMATCH')
    }
  })

  it('ignores unknown root-level keys like _note', () => {
    // Fixture has a `_note` at root — mapper should not crash
    const result = mapAzureAnalyzeResult(fixture as unknown as AnalyzeResult, ctx)
    expect(result.outcome).toBe('SUCCESS')
  })
})
