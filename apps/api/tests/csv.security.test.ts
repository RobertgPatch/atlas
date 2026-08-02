import { describe, expect, it } from 'vitest'
import { escapeCsvCell } from '../src/infra/export/csv.js'

describe('CSV export security', () => {
  it.each([
    '=HYPERLINK("https://attacker.invalid")',
    '+cmd|\'/C calc\'!A0',
    '-2+3+cmd|\'/C calc\'!A0',
    '@SUM(1+1)',
    '  =1+1',
    '\t=1+1',
  ])('neutralizes spreadsheet formula input %s', (value) => {
    expect(escapeCsvCell(value)).toMatch(/^"?'/)
  })

  it('preserves numeric values, including negative amounts', () => {
    expect(escapeCsvCell(-1250.5)).toBe('-1250.5')
  })
})
