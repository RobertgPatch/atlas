import { describe, expect, it } from 'vitest'

import { reconciliationGuidanceFor } from './reconciliationGuidance'

describe('Section L reconciliation guidance', () => {
  it('points to beginning capital when the reported ending was already imported', () => {
    const guidance = reconciliationGuidanceFor({
      key: 'section-l-ending',
      status: 'INCOMPLETE',
      actual: '1932344.00',
      expected: null,
      difference: null,
      tolerance: '1.00',
      message: 'Section L ending capital was imported, but beginning capital is missing.',
    })

    expect(guidance).toMatchObject({
      title: 'Section L beginning capital is missing',
      actionLabel: 'Enter beginning capital',
      fieldKey: 'section_l_beginning_capital',
    })
    expect(guidance.description).toContain('$1,932,344')
  })

  it('still points to ending capital when the reported ending itself is missing', () => {
    const guidance = reconciliationGuidanceFor({
      key: 'section-l-ending',
      status: 'INCOMPLETE',
      actual: null,
      expected: '1932344.00',
      difference: null,
      tolerance: '1.00',
      message: 'Section L ending capital is missing.',
    })

    expect(guidance).toMatchObject({
      title: 'Section L ending capital is missing',
      actionLabel: 'Enter ending capital',
      fieldKey: 'section_l_ending_capital',
    })
  })

  it('does not instruct the user to overwrite a reported Section L value with a calculated value', () => {
    const guidance = reconciliationGuidanceFor({
      key: 'section-l-net-income',
      status: 'FAIL',
      actual: '-56844.00',
      expected: '-55347.00',
      difference: '-1497.00',
      tolerance: '1.00',
      message: 'Section L net income differs from calculated K-1 activity.',
    })

    expect(guidance.description).toContain('K-1 reports -$56,844')
    expect(guidance.description).toContain('Do not replace the reported Section L value')
    expect(guidance.description).toContain('Box 13')
    expect(guidance.fieldKey).toBeUndefined()
  })

  it('explains the book-tax difference as a calculation diagnostic, not a replacement K-1 value', () => {
    const guidance = reconciliationGuidanceFor({
      key: 'book-tax-unexplained',
      status: 'FAIL',
      actual: '-192270.00',
      expected: '0.00',
      difference: '-192270.00',
      tolerance: '1.00',
      message: 'Book-tax unexplained variance exceeds $1.',
    })

    expect(guidance.description).toContain('does not mean the K-1 capital value is wrong')
    expect(guidance.description).toContain('coded deduction')
    expect(guidance).toMatchObject({
      actionLabel: 'Review basis inputs',
      fieldKey: 'opening_outside_basis',
    })
  })
})
