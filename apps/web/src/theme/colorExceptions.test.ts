import { describe, expect, it } from 'vitest'
import type { ColorFinding } from '../../scripts/check-color-system.mjs'
import { validateExceptionRegistry } from '../../scripts/check-color-system.mjs'

const finding = (overrides: Partial<ColorFinding> = {}): ColorFinding => ({
  path: 'src/chart.tsx',
  line: 4,
  column: 18,
  rule: 'raw-gold',
  message: 'raw gold',
  match: '#C9A96E',
  ...overrides,
})

const validException = {
  id: 'chart-series-highlight',
  path: 'src/chart.tsx',
  match: '#C9A96E',
  category: 'visualization',
  rationale: 'A labeled comparison series requires a distinct hue.',
  review: '2026-08 color-system review',
}

describe('color exception registry contract', () => {
  it('accepts exact active semantic, visualization, or decorative entries', () => {
    expect(validateExceptionRegistry([validException], [finding()])).toEqual([])
  })

  it('requires every contract field and a valid category', () => {
    const diagnostics = validateExceptionRegistry([{
      id: '', path: '', match: '', category: 'interaction', rationale: '', review: '',
    }], [])

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('id is required'),
      expect.stringContaining('path is required'),
      expect.stringContaining('match is required'),
      expect.stringContaining('category must be semantic, visualization, or decorative'),
      expect.stringContaining('rationale is required'),
      expect.stringContaining('review is required'),
    ]))
  })

  it('rejects duplicate, globbed, stale, and interaction exceptions', () => {
    const interactionFinding = finding({
      rule: 'competing-action-color',
      match: 'bg-blue-600',
    })
    const interactionException = {
      ...validException,
      id: 'interaction-override',
      match: 'bg-blue-600',
      category: 'semantic',
    }
    const diagnostics = validateExceptionRegistry([
      validException,
      validException,
      { ...validException, id: 'globbed', path: 'src/**/*.tsx' },
      { ...validException, id: 'stale', match: '#FFFFFF' },
      interactionException,
    ], [finding(), interactionFinding])

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicate id'),
      expect.stringContaining('duplicate exception'),
      expect.stringContaining('cannot contain a glob'),
      expect.stringContaining('stale exception'),
      expect.stringContaining('interaction findings cannot be excepted'),
    ]))
  })
})
