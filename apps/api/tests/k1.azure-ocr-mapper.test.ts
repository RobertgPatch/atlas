import { describe, expect, it } from 'vitest'
import { mapAzureOcrAnalyzeResult } from '../src/modules/k1/extraction/mapAzureOcrAnalyzeResult.js'

describe('mapAzureOcrAnalyzeResult', () => {
  it('maps the supported OCR/layout output into the K-1 review field shape', () => {
    const result = mapAzureOcrAnalyzeResult(
      {
        content: `Schedule K-1
(Form 1065)
A
Partnership's employer identification number
12-3456789
B
Partnership's name, address, city, state, and ZIP code
IRON TRIANGLE FUND LP
1 RIVER ROAD, 1ST FLOOR
COS COB, CT 06807
E
Partner's identifying number
90-1234
F
Partner's name, address, city, state, and ZIP code
SAMPLE PARTNER LLC
Profit
Beginning
Ending
3.032900 %
0.000000 %
Loss
Beginning
Ending
3.032900 %
0.000000 %
Capital
Beginning
Ending
3.032900 %
0.000000 %
1 Ordinary business income (loss)
(409,615)
19 Distributions
4,493,757
21 Foreign taxes paid or accrued
196`,
      },
      { k1DocumentId: 'k1_test_123' },
    )

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return

    expect(result.nextStatus).toBe('NEEDS_REVIEW')

    const byName = new Map(result.fieldValues.map((field) => [field.fieldName, field]))
    expect(byName.get('partnership_ein')?.rawValue).toBe('12-3456789')
    expect(byName.get('partnership_name')?.rawValue).toBe('IRON TRIANGLE FUND LP')
    expect(byName.get('partner_tin')?.rawValue).toBe('90-1234')
    expect(byName.get('partner_name')?.rawValue).toBe('SAMPLE PARTNER LLC')
    expect(byName.get('profit_share_ending')?.rawValue).toBe('0.000000')
    expect(byName.get('loss_share_ending')?.rawValue).toBe('0.000000')
    expect(byName.get('capital_share_ending')?.rawValue).toBe('0.000000')
    expect(byName.get('box_1_ordinary_income')?.rawValue).toBe('-409615.00')
    expect(byName.get('box_19_distributions')?.rawValue).toBe('4493757.00')
    expect(byName.get('box_21_foreign_taxes')?.rawValue).toBe('196.00')
    expect(result.issues.some((issue) => issue.issueType === 'OCR_FALLBACK')).toBe(true)
  })

  it('returns a schema mismatch failure when OCR content is empty', () => {
    const result = mapAzureOcrAnalyzeResult({ content: '   ' }, { k1DocumentId: 'k1_test_456' })

    expect(result).toEqual({
      outcome: 'FAILURE',
      errorCode: 'PARSE_SCHEMA_MISMATCH',
      errorMessage: 'Azure OCR response contained no text content.',
    })
  })
})