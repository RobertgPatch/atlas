import { describe, expect, it } from 'vitest'

import { classifyK1Document } from '../src/modules/k1/extraction/k1DocumentClassification.js'
import type { K1ExtractionDraft } from '../src/modules/k1/k1.types.js'

const draft = (overrides: Partial<K1ExtractionDraft> = {}): K1ExtractionDraft => ({
  schemaVersion: 'k1-form-1065-v1',
  form: { family: 'SCHEDULE_K1_FORM_1065', revisionYear: 2025, customOutputStatus: 'MATCH' },
  values: [],
  evidence: [],
  validationIssues: [],
  ...overrides,
})

describe('K-1 document classification', () => {
  it.each([2000, 2012, 2021, 2023, 2024, 2025])(
    'accepts a grounded %i K-1 without inventing issues',
    (revisionYear) => {
      expect(classifyK1Document({
        draft: draft({
          form: { family: 'SCHEDULE_K1_FORM_1065', revisionYear, customOutputStatus: 'MATCH' },
        }),
        pageCount: 2,
      })).toMatchObject({
        revisionSupported: true,
        multipleK1Package: false,
        reviewRequired: false,
        blocksApply: false,
        issues: [],
      })
    },
  )

  it.each([1999, 2026])('blocks an out-of-range %i K-1 revision', (revisionYear) => {
    const result = classifyK1Document({
      draft: draft({
        form: { family: 'SCHEDULE_K1_FORM_1065', revisionYear, customOutputStatus: 'MATCH' },
      }),
      pageCount: 2,
    })

    expect(result).toMatchObject({ revisionSupported: false, blocksApply: true })
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'UNSUPPORTED_K1_REVISION',
      details: {
        revisionYear,
        supported: { minimum: 2000, maximum: 2025 },
      },
    }))
  })

  it('blocks a matched K-1 when its revision year cannot be established', () => {
    const result = classifyK1Document({
      draft: draft({
        form: { family: 'SCHEDULE_K1_FORM_1065', revisionYear: null, customOutputStatus: 'MATCH' },
      }),
      pageCount: 2,
    })

    expect(result).toMatchObject({ revisionSupported: false, blocksApply: true })
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'UNSUPPORTED_K1_REVISION',
      message: 'The Schedule K-1 revision year could not be established.',
    }))
  })

  it('blocks fallback and unrelated forms even when the reported year is in range', () => {
    const result = classifyK1Document({
      draft: draft({ form: { family: 'UNKNOWN', revisionYear: 2022, customOutputStatus: 'FALLBACK' } }),
      pageCount: 1,
      fallbackClassification: 'OTHER_TAX_FORM',
    })
    expect(result.blocksApply).toBe(true)
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'UNRELATED_TAX_FORM',
    ]))
  })

  it('detects a multiple-K-1 package and impossible page evidence', () => {
    const result = classifyK1Document({
      draft: draft({
        values: ['12-3456789', '98-7654321'].map((value, index) => ({
          occurrenceId: `00000000-0000-4000-8000-00000000000${index}`,
          canonicalPath: 'official.part_i_a_partnership_ein',
          kind: 'STRING', rawValue: value, normalizedValue: value, confidence: 1,
          sourceLocations: [], destination: { kind: 'OFFICIAL', key: 'part_i_a_partnership_ein' },
          mappingRuleVersion: 'k1-form-1065-v1',
        })),
        evidence: [{ id: 'missing-page', page: 3, kind: 'TEXT', sourceRef: null }],
      }),
      pageCount: 2,
    })
    expect(result.multipleK1Package).toBe(true)
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'MULTIPLE_K1_PACKAGE', 'MISSING_DOCUMENT_PAGES',
    ]))
  })

  it('retains segment-level multiple-K-1 detection after only one page is selected', () => {
    const result = classifyK1Document({
      draft: draft({
        validationIssues: [{
          code: 'MULTIPLE_K1_PACKAGE',
          severity: 'HIGH',
          message: 'The PDF appears to contain more than one Schedule K-1 (Form 1065).',
        }],
      }),
      pageCount: 10,
    })

    expect(result.multipleK1Package).toBe(true)
    expect(result.blocksApply).toBe(true)
    expect(result.issues.filter((issue) => issue.code === 'MULTIPLE_K1_PACKAGE')).toHaveLength(1)
  })
})
