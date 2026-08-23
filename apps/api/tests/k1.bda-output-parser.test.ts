import { describe, expect, it } from 'vitest'

import { mapBdaResult } from '../src/modules/k1/extraction/mapBdaResult.js'

const standardOutput = {
  document: {
    elements: [
      {
        id: 'ein-evidence',
        reading_order: 2,
        page_indices: [0],
        locations: [
          {
            page_index: 0,
            bounding_box: { left: 0.1, top: 0.2, width: 0.3, height: 0.04 },
          },
        ],
        representation: { text: '12-3456789' },
      },
      {
        id: 'row-evidence',
        reading_order: 38,
        page_indices: [1, 2],
        locations: [
          {
            page_index: 1,
            bounding_box: { left: 0.2, top: 0.4, width: 0.5, height: 0.08 },
          },
          {
            page_index: 2,
            bounding_box: { left: 0.15, top: 0.1, width: 0.6, height: 0.08 },
          },
        ],
        representation: { text: '13 W Other deduction (1,200)' },
      },
    ],
  },
}

const result = (status: string, fields: unknown[]) => ({
  semanticModality: 'DOCUMENT',
  outputSegments: [
    {
      customOutputStatus: status,
      standardOutput,
      customOutput: {
        matched_blueprint: {
          name: 'schedule-k1-1065',
          version: '1',
          confidence: 0.97,
        },
        inference_result: { extracted_fields: fields },
      },
    },
  ],
})

describe('BDA output parser', () => {
  it('parses MATCH output with standard-output geometry and deterministic identifiers', () => {
    const raw = result('MATCH', [
      {
        canonical_path: 'official.part_i_a_partnership_ein',
        value_kind: 'STRING',
        value: '12-3456789',
        confidence: 0.99,
        evidence_ids: ['ein-evidence'],
      },
    ])

    const first = mapBdaResult(raw)
    const second = mapBdaResult(raw)
    expect(first.form).toMatchObject({
      family: 'SCHEDULE_K1_FORM_1065',
      customOutputStatus: 'MATCH',
    })
    expect(first.values).toHaveLength(1)
    expect(first.values[0]).toMatchObject({
      canonicalPath: 'official.part_i_a_partnership_ein',
      normalizedValue: '12-3456789',
      confidence: 0.99,
      destination: { kind: 'OFFICIAL', key: 'part_i_a_partnership_ein' },
      sourceLocations: [{ page: 1, bbox: [0.1, 0.2, 0.4, 0.24], textRef: 'ein-evidence' }],
    })
    expect(first.values[0].occurrenceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(second.values[0].occurrenceId).toBe(first.values[0].occurrenceId)
    expect(first.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'row-evidence:3:1', page: 3 }),
    ]))
  })

  it.each([
    ['NO_MATCH', 'BDA_NO_MATCH'],
    ['FALLBACK', 'BDA_FALLBACK_OUTPUT'],
    ['A_NEW_PROVIDER_STATUS', 'BDA_UNKNOWN_CUSTOM_OUTPUT_STATUS'],
  ])('retains %s output and creates an explicit issue', (status, issueCode) => {
    const draft = mapBdaResult(result(status, []))
    expect(draft.form.customOutputStatus).toBe(status)
    expect(draft.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: issueCode }),
    ]))
  })

  it('keeps repeated coded rows distinct across continuation pages and normalizes signs', () => {
    const draft = mapBdaResult(result('MATCH', [
      {
        canonical_path: 'official.box_13_entries',
        value_kind: 'CODE_ROW',
        value: [
          { code: 'W', description: 'Other deduction', amount: '(1,200)' },
          { code: 'AE', description: 'Excess business interest', amount: '250-' },
        ],
        confidence: 0.91,
        evidence_ids: ['row-evidence'],
      },
      {
        canonical_path: 'calculation.box_1_ordinary_income_loss',
        value_kind: 'MONEY',
        value: '(409,615)',
        confidence: 0.94,
        page_number: 2,
        bounding_box: [0.4, 0.4, 0.7, 0.5],
      },
    ]))

    const rows = draft.values.filter((value) => value.canonicalPath === 'official.box_13_entries')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.occurrenceId)).size).toBe(2)
    expect(rows[0].normalizedValue).toEqual({
      code: 'W',
      description: 'Other deduction',
      amount: '-1200.00',
    })
    expect(rows[1].normalizedValue).toEqual({
      code: 'AE',
      description: 'Excess business interest',
      amount: '-250.00',
    })
    expect(rows[0].sourceLocations.map((location) => location.page)).toEqual([2, 3])
    expect(draft.values.find((value) => value.kind === 'MONEY')?.normalizedValue).toBe('-409615.00')
  })

  it('keeps SEE STMT coded rows as valid statement references without inventing money', () => {
    const draft = mapBdaResult(result('MATCH', [{
      canonical_path: 'official.box_20_entries',
      value_kind: 'CODE_ROW',
      value: { code: 'A', description: 'Other information', amount: 'SEE STMT' },
    }]))

    expect(draft.values[0]?.normalizedValue).toEqual({
      code: 'A', description: 'Other information', amount: null,
    })
    expect(draft.validationIssues).toEqual([])
  })

  it('accepts coded statement and printed placeholder rows with blank amounts', () => {
    const draft = mapBdaResult(result('MATCH', [
      {
        canonical_path: 'official.box_20_entries',
        value_kind: 'CODE_ROW',
        value: '{code:AG*,description:STMT,amount:}',
      },
      {
        canonical_path: 'official.box_14_entries',
        value_kind: 'CODE_ROW',
        value: { code: '', description: 'Self-employment earnings (loss)', amount: '' },
      },
    ]))

    expect(draft.values.map((value) => value.normalizedValue)).toEqual([
      { code: 'AG*', description: 'STMT', amount: null },
      { code: '', description: 'Self-employment earnings (loss)', amount: null },
    ])
    expect(draft.validationIssues).toEqual([])
  })

  it('removes blank Line 17 taxonomy rows and prevents Line 19 values from bleeding into Line 20', () => {
    const draft = mapBdaResult(result('MATCH', [
      {
        canonical_path: 'official.box_17_entries',
        value_kind: 'CODE_ROW',
        value: [
          { code: 'A', description: 'Post-1986 depreciation adjustment', amount: '' },
          { code: 'B', description: 'Adjusted gain or loss', amount: '' },
          { code: 'C', description: 'Depletion (other than oil & gas)', amount: '' },
          { code: 'D', description: 'Oil, gas, & geothermal - gross income', amount: '' },
          { code: 'E', description: 'Oil, gas, & geothermal - deductions', amount: '' },
          { code: 'F', description: 'Other AMT items', amount: '' },
        ],
      },
      {
        canonical_path: 'calculation.box_19_distributions',
        value_kind: 'MONEY',
        value: '245,063',
      },
      {
        canonical_path: 'official.box_19_entries',
        value_kind: 'CODE_ROW',
        value: { code: 'A', description: 'Cash and marketable securities', amount: '245,063' },
      },
      {
        canonical_path: 'official.box_20_entries',
        value_kind: 'CODE_ROW',
        value: [
          { code: 'A', description: 'Distributions', amount: '245,063' },
          { code: '', description: 'Other information', amount: '13,816' },
          { code: 'Z*', description: 'STMT', amount: '' },
          { code: 'AG*', description: 'STMT', amount: '' },
        ],
      },
    ]))

    expect(draft.values.filter((value) => value.canonicalPath === 'official.box_17_entries'))
      .toHaveLength(1)
    expect(draft.values.find((value) => value.canonicalPath === 'official.box_17_entries')?.normalizedValue)
      .toEqual({ code: '', description: 'Alternative Minimum Tax (AMT)', amount: null })
    expect(draft.values.some((value) => value.canonicalPath === 'calculation.box_19_distributions'))
      .toBe(false)
    expect(draft.values.filter((value) => value.canonicalPath === 'official.box_19_entries')
      .map((value) => value.normalizedValue)).toEqual([
      { code: 'A', description: 'Cash and marketable securities', amount: '245063.00' },
    ])
    expect(draft.values.filter((value) => value.canonicalPath === 'official.box_20_entries')
      .map((value) => value.normalizedValue)).toEqual([
      { code: 'A', description: 'Other information', amount: '13816.00' },
      { code: 'Z*', description: 'STMT', amount: null },
      { code: 'AG*', description: 'STMT', amount: null },
    ])
    expect(draft.validationIssues).toEqual([])
  })

  it('resolves a Line 13 STMT marker from the numeric Federal Statements table', () => {
    const draft = mapBdaResult({
      outputSegments: [{
        customOutputStatus: 'MATCH',
        standardOutput: {
          document: { representation: { text: 'Schedule K-1 (Form 1065) 2025' } },
          elements: [
            {
              id: 'k1-heading',
              reading_order: 0,
              locations: [{ page_index: 1 }],
              type: 'TEXT',
              representation: { text: 'Schedule K-1 (Form 1065)' },
            },
            {
              id: 'line-13-heading',
              reading_order: 5,
              locations: [{ page_index: 3 }],
              type: 'TEXT',
              representation: { text: 'Schedule K-1, Line 13 - Other Deductions' },
            },
            {
              id: 'line-13-table',
              reading_order: 6,
              locations: [{
                page_index: 3,
                bounding_box: { left: 0.05, top: 0.15, width: 0.89, height: 0.08 },
              }],
              type: 'TABLE',
              representation: {
                text: 'Code\tDescription\tAmount\nZZ\tP/T INTEREST EXPENSE\t$ 2,313\nZZ\tSPECIALLY ALLOC DEPRECIATION\t22',
              },
            },
          ],
        },
        customOutput: {
          inference_result: {
            official__box_13_entries: [
              '{code:A,description:Other deductions,amount:891}',
              '{code:ZZ*,description:STMT,amount:}',
            ],
          },
        },
      }],
    })

    const line13 = draft.values.filter((value) => value.canonicalPath === 'official.box_13_entries')
    expect(line13.map((value) => value.normalizedValue)).toEqual([
      { code: 'A', description: 'Other deductions', amount: '891.00' },
      { code: 'ZZ', description: 'P/T INTEREST EXPENSE', amount: '2313.00' },
      { code: 'ZZ', description: 'SPECIALLY ALLOC DEPRECIATION', amount: '22.00' },
    ])
    expect(line13.slice(1).every((value) => value.sourceLocations[0]?.page === 4)).toBe(true)
    expect(draft.values.some((value) => {
      const row = value.normalizedValue as { description?: string }
      return row?.description === 'STMT'
    })).toBe(false)
    expect(draft.validationIssues).toEqual([])
  })

  it('identifies the exact Part III line and code when a coded amount is invalid', () => {
    const draft = mapBdaResult(result('MATCH', [{
      canonical_path: 'official.box_20_entries',
      value_kind: 'CODE_ROW',
      value: { code: 'Z*', description: 'Other information', amount: 'not money' },
    }]))

    expect(draft.validationIssues).toContainEqual(expect.objectContaining({
      code: 'INVALID_EXTRACTED_VALUE',
      message: 'Part III, Line 20, code Z*: the extracted amount "not money" is not valid money.',
      details: expect.objectContaining({ line: '20', code: 'Z*' }),
    }))
  })

  it('coalesces legacy Item J sale and exchange fields into the one printed checkbox', () => {
    const draft = mapBdaResult(result('MATCH', [
      { canonical_path: 'official.part_ii_j_decrease_sale', value_kind: 'BOOLEAN', value: false },
      { canonical_path: 'official.part_ii_j_decrease_exchange', value_kind: 'BOOLEAN', value: true },
    ]))

    expect(draft.values).toHaveLength(1)
    expect(draft.values[0]).toMatchObject({
      canonicalPath: 'official.part_ii_j_decrease_sale',
      normalizedValue: true,
      destination: { kind: 'OFFICIAL', key: 'part_ii_j_decrease_sale' },
    })
    expect(draft.validationIssues).toEqual([])
  })

  it('normalizes dates, percentages, checkboxes, choices, and identifiers', () => {
    const draft = mapBdaResult(result('MATCH', [
      { canonical_path: 'official.tax_period_beginning', value_kind: 'DATE', value: '01/01/2025' },
      { canonical_path: 'official.part_ii_j_profit_ending_pct', value_kind: 'PERCENTAGE', value: '15.2500%' },
      { canonical_path: 'official.k1_status_final', value_kind: 'BOOLEAN', value: 'X' },
      { canonical_path: 'official.part_ii_h1_partner_residency', value_kind: 'STRING', value: 'Domestic' },
      { canonical_path: 'match.partner_tin', value_kind: 'STRING', value: '987 65 4321' },
    ]))
    expect(draft.values.map((value) => value.normalizedValue)).toEqual([
      '2025-01-01',
      '15.25',
      true,
      'DOMESTIC',
      '987-65-4321',
    ])
  })

  it('retains blank, invalid, and unknown provider fields as reviewable evidence and issues', () => {
    const draft = mapBdaResult(result('MATCH', [
      { canonical_path: 'official.box_6b_qualified_dividends', value_kind: 'MONEY', value: ' ' },
      { canonical_path: 'official.tax_period_ending', value_kind: 'DATE', value: '13/40/2025' },
      { canonical_path: 'provider.future_field', value_kind: 'STRING', value: 'future value' },
    ]))
    expect(draft.values).toHaveLength(3)
    expect(draft.form.revisionYear).toBeNull()
    expect(draft.values[0].normalizedValue).toBeNull()
    expect(draft.values[1].normalizedValue).toBeNull()
    expect(draft.values[2].destination).toEqual({ kind: 'EVIDENCE_ONLY', key: null })
    expect(draft.validationIssues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'BLANK_EXTRACTED_FIELD',
      'INVALID_EXTRACTED_VALUE',
      'UNMAPPED_PROVIDER_FIELD',
    ]))
  })

  it('flags mutually exclusive final/amended fields without discarding either value', () => {
    const draft = mapBdaResult(result('MATCH', [
      { canonical_path: 'official.k1_status_final', value_kind: 'BOOLEAN', value: true },
      { canonical_path: 'official.k1_status_amended', value_kind: 'BOOLEAN', value: true },
    ]))
    expect(draft.values).toHaveLength(2)
    expect(draft.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MUTUALLY_EXCLUSIVE_FIELDS' }),
    ]))
  })

  it('maps live flat-schema output while omitting absent form placeholders', () => {
    const draft = mapBdaResult({
      outputSegments: [{
        customOutputStatus: 'MATCH',
        standardOutput,
        customOutput: {
          inference_result: {
            calculation__box_1_ordinary_income_loss: '',
            calculation__capital_contributions: '$',
            official__part_ii_j_profit_ending_pct: '0.125000 %',
            official__part_ii_h1_partner_residency: 'Domestic Partner',
            official__box_11_entries: [
              '{code:ZZ,description:Example line,amount:(1,250)}',
              '',
            ],
          },
        },
      }],
    })

    expect(draft.values).toHaveLength(3)
    expect(draft.values.map((value) => value.normalizedValue)).toEqual([
      '0.125',
      'DOMESTIC',
      { code: 'ZZ', description: 'Example line', amount: '-1250.00' },
    ])
    expect(draft.validationIssues).toEqual([])
  })

  it('uses BDA flat-schema explainability for confidence and checkbox geometry', () => {
    const draft = mapBdaResult({
      outputSegments: [{
        customOutputStatus: 'MATCH',
        customOutput: {
          inference_result: {
            official__k1_status_final: true,
          },
          explainability_info: {
            official__k1_status_final: {
              confidence: 0.93,
              geometry: [{
                page: 1,
                boundingBox: { left: 0.54, top: 0.04, width: 0.06, height: 0.02 },
              }],
            },
          },
        },
      }],
    })

    expect(draft.values[0]).toMatchObject({
      canonicalPath: 'official.k1_status_final',
      normalizedValue: true,
      confidence: 0.93,
      sourceLocations: [{
        page: 1,
        bbox: [0.54, 0.04, 0.6, 0.06],
        textRef: 'official__k1_status_final',
      }],
    })
    expect(draft.validationIssues).toEqual([])
  })

  it('makes a low-confidence K-1 status checkbox an explicit blocking review issue', () => {
    const draft = mapBdaResult({
      outputSegments: [{
        customOutputStatus: 'MATCH',
        customOutput: {
          inference_result: {
            official__k1_status_final: false,
          },
          explainability_info: {
            official__k1_status_final: {
              confidence: 0.2,
              geometry: [{
                page: 1,
                boundingBox: { left: 0.55, top: 0.05, width: 0.04, height: 0.01 },
              }],
            },
          },
        },
      }],
    })

    expect(draft.values[0]).toMatchObject({ normalizedValue: false, confidence: 0.2 })
    expect(draft.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'AMBIGUOUS_CHECKBOX',
        severity: 'HIGH',
        canonicalPath: 'official.k1_status_final',
      }),
    ]))
  })

  it('normalizes explicit CHECKED and UNCHECKED status tokens from the BDA string classifier', () => {
    const draft = mapBdaResult({
      outputSegments: [{
        customOutputStatus: 'MATCH',
        customOutput: {
          inference_result: {
            official__k1_status_final: 'CHECKED',
            official__k1_status_amended: 'UNCHECKED',
          },
        },
      }],
    })

    expect(draft.values.map((value) => value.normalizedValue)).toEqual([true, false])
  })

  it('uses the extracted tax year when BDA omits a separate form revision year', () => {
    const draft = mapBdaResult({
      outputSegments: [{
        customOutputStatus: 'MATCH',
        customOutput: { inference_result: { match__tax_year: 2025 } },
      }],
    })
    expect(draft.form.revisionYear).toBe(2025)
  })

  it('selects the Schedule K-1 Form 1065 page from a later segment and ignores other pages', () => {
    const draft = mapBdaResult({
      outputSegments: [
        {
          customOutputStatus: 'FALLBACK',
          standardOutput: {
            document: {
              elements: [{
                page_indices: [0],
                representation: { text: 'Annual tax package cover letter' },
              }],
            },
          },
          customOutput: {
            inference_result: {
              document_classification: 'OTHER_TAX_FORM',
            },
          },
        },
        {
          customOutputStatus: 'MATCH',
          standardOutput: {
            document: { representation: { text: 'Schedule K-1 package' } },
            pages: [{
              page_index: 1,
              representation: { text: 'Schedule K-1 (Form 1065)' },
            }, {
              page_index: 7,
              representation: {
                text: 'California adjustments reported using amounts from federal Schedule K-1 Form 1065. This supporting worksheet is not a federal Schedule K-1 and contains state-specific instructions and reconciliation details for the taxpayer.',
              },
            }, {
              page_index: 8,
              representation: {
                text: 'Use the amounts from federal Schedule K-1 Form 1065 when completing this California statement. This attachment is supporting information rather than another federal form and continues with state adjustment details.',
              },
            }],
            elements: [
              {
                id: 'attachment',
                page_indices: [4],
                representation: { text: 'Unrelated attachment amount 999' },
              },
            ],
          },
          customOutput: {
            inference_result: {
              extracted_fields: [
                { canonical_path: 'match.tax_year', value_kind: 'NUMBER', value: 2021, page_number: 2 },
                { canonical_path: 'official.part_i_a_partnership_ein', value_kind: 'STRING', value: '12-3456789', page_number: 2 },
                { canonical_path: 'calculation.box_1_ordinary_income_loss', value_kind: 'MONEY', value: '999', page_number: 5 },
              ],
            },
          },
        },
      ],
    })

    expect(draft.form).toMatchObject({
      family: 'SCHEDULE_K1_FORM_1065',
      revisionYear: 2021,
      customOutputStatus: 'MATCH',
    })
    expect(draft.values.map((value) => value.canonicalPath)).toEqual([
      'match.tax_year',
      'official.part_i_a_partnership_ein',
    ])
    expect(draft.values.every((value) => value.sourceLocations.every((location) => location.page === 2))).toBe(true)
    expect(draft.evidence.every((reference) => reference.page === 2)).toBe(true)
    expect(draft.validationIssues.map((issue) => issue.code)).not.toContain('BDA_FALLBACK_OUTPUT')
    expect(draft.validationIssues.map((issue) => issue.code)).not.toContain('MULTIPLE_K1_PACKAGE')
  })

  it('treats masked identifiers and empty printed money cells as absent instead of invalid', () => {
    const draft = mapBdaResult(result('MATCH', [
      { canonical_path: 'match.partner_tin', value_kind: 'STRING', value: '***-**-0233' },
      { canonical_path: 'calculation.section_l_withdrawals_distributions', value_kind: 'MONEY', value: '$ ( )' },
    ]))

    expect(draft.values.map((value) => value.normalizedValue)).toEqual([null, null])
    expect(draft.validationIssues.map((issue) => issue.code)).not.toContain('INVALID_EXTRACTED_VALUE')
  })

  it('preserves accounting-parentheses signs when the dollar sign precedes Section L parentheses', () => {
    const draft = mapBdaResult(result('MATCH', [{
      canonical_path: 'calculation.section_l_withdrawals_distributions',
      value_kind: 'MONEY',
      value: '$ ( 190,773)',
    }]))

    expect(draft.values[0]?.normalizedValue).toBe('-190773.00')
    expect(draft.validationIssues).toEqual([])
  })

  it('blocks a package containing more than one Schedule K-1 Form 1065 page', () => {
    const segment = (pageIndex: number, ein: string) => ({
      customOutputStatus: 'MATCH',
      standardOutput: {
        document: {
          elements: [{
            page_indices: [pageIndex],
            representation: { text: 'SCHEDULE K1 FORM 1065' },
          }],
        },
      },
      customOutput: {
        inference_result: {
          extracted_fields: [{
            canonical_path: 'official.part_i_a_partnership_ein',
            value_kind: 'STRING',
            value: ein,
            page_number: pageIndex + 1,
          }],
        },
      },
    })
    const draft = mapBdaResult({ revisionYear: 2021, outputSegments: [
      segment(1, '12-3456789'),
      segment(7, '98-7654321'),
    ] })

    expect(draft.values).toHaveLength(1)
    expect(draft.values[0]?.normalizedValue).toBe('12-3456789')
    expect(draft.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MULTIPLE_K1_PACKAGE',
        severity: 'HIGH',
        details: { matchingSegments: [0, 1], detectedPages: [2, 8] },
      }),
    ]))
  })
})
