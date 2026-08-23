import { describe, expect, it } from 'vitest'
import type { K1FieldValue } from '../../../../../packages/types/src/review-finalization'
import { getK1FieldDisplay, groupK1ReviewFields } from './k1FieldDisplay'

const field = (overrides: Partial<K1FieldValue>): K1FieldValue => ({
  id: 'field-1',
  fieldName: 'official.box_19_entries',
  label: 'official.box_19_entries',
  section: 'core',
  required: false,
  rawValue: null,
  normalizedValue: null,
  reviewerCorrectedValue: null,
  confidenceScore: 0.98,
  confidenceBand: 'high',
  sourceLocation: { page: 1 },
  reviewStatus: 'PENDING',
  isModified: false,
  linkedIssueIds: [],
  updatedAt: '2026-08-18T00:00:00Z',
  canonicalPath: 'official.box_19_entries',
  valueKind: 'CODE_ROW',
  normalizedValueJson: { code: 'A', description: 'Distributions', amount: '4493757.00' },
  ...overrides,
})

describe('getK1FieldDisplay', () => {
  it('turns a coded canonical path into the printed K-1 part, line, and code', () => {
    expect(getK1FieldDisplay(field({}))).toEqual({
      title: 'Part III · Line 19 · Code A',
      detail: 'Distributions',
      sourceKey: 'official.box_19_entries',
    })
  })

  it('uses official Item labels instead of underscored storage keys', () => {
    expect(getK1FieldDisplay(field({
      fieldName: 'official.part_ii_j_profit_beginning_pct',
      canonicalPath: 'official.part_ii_j_profit_beginning_pct',
      valueKind: 'PERCENTAGE',
      normalizedValueJson: '3.0329',
    }))).toMatchObject({
      title: 'Part II · Item J',
      detail: 'Profit percentage, beginning',
    })
  })

  it('groups and sorts review fields in printed Part I, Part II, Part III order', () => {
    const fields = [
      field({ id: 'line-19', canonicalPath: 'official.box_19_entries' }),
      field({ id: 'partner-tin', canonicalPath: 'match.partner_tin', fieldName: 'match.partner_tin' }),
      field({ id: 'line-1', canonicalPath: 'calculation.box_1_ordinary_income_loss', fieldName: 'calculation.box_1_ordinary_income_loss' }),
      field({ id: 'partnership-ein', canonicalPath: 'official.part_i_a_partnership_ein', fieldName: 'official.part_i_a_partnership_ein' }),
      field({ id: 'final', canonicalPath: 'official.k1_status_final', fieldName: 'official.k1_status_final' }),
      field({ id: 'section-l', canonicalPath: 'calculation.section_l_ending_capital', fieldName: 'calculation.section_l_ending_capital' }),
    ]

    const groups = groupK1ReviewFields(fields)
    expect(groups.map((group) => group.id)).toEqual(['partI', 'partII', 'partIII'])
    expect(groups[0].fields.map((candidate) => candidate.id)).toEqual(['final', 'partnership-ein'])
    expect(groups[1].fields.map((candidate) => candidate.id)).toEqual(['section-l'])
    expect(groups[2].fields.map((candidate) => candidate.id)).toEqual(['line-1', 'line-19'])
  })

  it('shows matching evidence only in destination linking, not as duplicate K-1 rows', () => {
    const groups = groupK1ReviewFields([
      field({ id: 'match-ein', canonicalPath: 'match.partnership_ein', fieldName: 'match.partnership_ein' }),
      field({ id: 'printed-ein', canonicalPath: 'official.part_i_a_partnership_ein', fieldName: 'official.part_i_a_partnership_ein' }),
    ])

    expect(groups.flatMap((group) => group.fields).map((candidate) => candidate.id)).toEqual(['printed-ein'])
  })

  it('shows coded Line 19 once and omits rejected extraction artifacts', () => {
    const groups = groupK1ReviewFields([
      field({
        id: 'generic-19',
        canonicalPath: 'calculation.box_19_distributions',
        fieldName: 'calculation.box_19_distributions',
        valueKind: 'MONEY',
        normalizedValueJson: '245063.00',
      }),
      field({ id: 'coded-19a' }),
      field({
        id: 'borrowed-20',
        canonicalPath: 'official.box_20_entries',
        fieldName: 'official.box_20_entries',
        normalizedValueJson: { code: 'A', description: 'Distributions', amount: '245063.00' },
        reviewStatus: 'REJECTED',
      }),
    ])

    expect(groups.flatMap((group) => group.fields).map((candidate) => candidate.id)).toEqual(['coded-19a'])
  })

  it('sorts Item J as Profit, Loss, Capital with beginning before ending', () => {
    const itemJ = [
      'capital_ending', 'loss_beginning', 'profit_ending',
      'capital_beginning', 'profit_beginning', 'loss_ending',
    ].map((suffix) => field({
      id: suffix,
      canonicalPath: `official.part_ii_j_${suffix}_pct`,
      fieldName: `official.part_ii_j_${suffix}_pct`,
      valueKind: 'PERCENTAGE',
    }))

    const partII = groupK1ReviewFields(itemJ).find((group) => group.id === 'partII')
    expect(partII?.fields.map((candidate) => candidate.id)).toEqual([
      'profit_beginning', 'profit_ending',
      'loss_beginning', 'loss_ending',
      'capital_beginning', 'capital_ending',
    ])
  })
})
