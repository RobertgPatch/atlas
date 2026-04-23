import { describe, expect, it } from 'vitest'
import { mapAzureCustomAnalyzeResult } from '../src/modules/k1/extraction/mapAzureCustomAnalyzeResult.js'

describe('mapAzureCustomAnalyzeResult', () => {
  it('maps the custom Azure model field names into the canonical K-1 fields', () => {
    const result = mapAzureCustomAnalyzeResult(
      {
        documents: [
          {
            docType: 'k1-template-model:k1-template-model',
            fields: {
              partner_ein_number: { type: 'string', valueString: '35-2657320', confidence: 0.99 },
              partnership_name: {
                type: 'string',
                valueString: 'IRON TRIANGLE FUND LP',
                confidence: 0.98,
              },
              partnership_address: {
                type: 'string',
                valueString: '1 RIVER ROAD, 1ST FLOOR COS COB, CT 06807',
                confidence: 0.97,
              },
              partner_entity_type: { type: 'string', valueString: 'TRUST', confidence: 0.96 },
              partner_general_or_llc_managed_mbr: {
                type: 'selectionMark',
                valueSelectionMark: 'unselected',
                confidence: 0.95,
              },
              partner_beginning_capital: {
                type: 'string',
                valueString: '4,903,568',
                confidence: 0.94,
              },
              partner_capital_curr_year_loss: {
                type: 'string',
                valueString: '(409,811)',
                confidence: 0.94,
              },
              partner_capital_withdrawal_and_distributions: {
                type: 'string',
                valueString: '4,493,757',
                confidence: 0.94,
              },
              partner_share_distribution: {
                type: 'string',
                valueString: '4,493,757',
                confidence: 0.94,
              },
              partnership_foreign_taxes_paid_or_accruedd: {
                type: 'string',
                valueString: '196',
                confidence: 0.94,
              },
              partnership_other_income: {
                type: 'string',
                valueString: '(409,615)',
                confidence: 0.94,
              },
              'Profit Loss Capital': {
                type: 'object',
                valueObject: {
                  Profit: {
                    type: 'object',
                    valueObject: {
                      Beginning: { type: 'string', valueString: '3.032900' },
                      COLUMN2: { type: 'string', valueString: '0.000000' },
                    },
                  },
                  Loss: {
                    type: 'object',
                    valueObject: {
                      Beginning: { type: 'string', valueString: '3.032900' },
                      COLUMN2: { type: 'string', valueString: '0.000000' },
                    },
                  },
                  Capital: {
                    type: 'object',
                    valueObject: {
                      Beginning: { type: 'string', valueString: '3.032900' },
                      COLUMN2: { type: 'string', valueString: '0.000000' },
                    },
                  },
                },
              },
              liabilities: {
                type: 'object',
                valueObject: {
                  Nonrecourse: {
                    type: 'object',
                    valueObject: {
                      Beginning: { type: 'string', valueString: '498,211' },
                      Ending: { type: 'string', valueString: '0' },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      { k1DocumentId: 'custom-test' },
    )

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return

    const byName = new Map(result.fieldValues.map((field) => [field.fieldName, field]))
    expect(byName.has('partner_name')).toBe(false)
    expect(byName.has('partner_tin')).toBe(false)
    expect(byName.has('partner_address')).toBe(false)
    expect(byName.get('partnership_ein')?.rawValue).toBe('35-2657320')
    expect(byName.get('partnership_name')?.rawValue).toBe('IRON TRIANGLE FUND LP')
    expect(byName.get('partner_entity_type')?.rawValue).toBe('TRUST')
    expect(byName.get('is_general_partner')?.rawValue).toBe('false')
    expect(byName.get('profit_share_beginning')?.rawValue).toBe('3.032900')
    expect(byName.get('profit_share_ending')?.rawValue).toBe('0.000000')
    expect(byName.get('capital_beginning')?.rawValue).toBe('4903568.00')
    expect(byName.get('capital_current_year_net_income')?.rawValue).toBe('-409811.00')
    expect(byName.get('box_11_other_income')?.rawValue).toBe('-409615.00')
    expect(byName.get('box_19_distributions')?.rawValue).toBe('4493757.00')
    expect(byName.get('box_21_foreign_taxes')?.rawValue).toBe('196.00')
    expect(result.nextStatus).toBe('READY_FOR_APPROVAL')
  })

  it('defaults missing ending percentages and unmapped values to zero or empty string', () => {
    const result = mapAzureCustomAnalyzeResult(
      {
        documents: [
          {
            docType: 'k1-template-model:k1-template-model',
            fields: {
              partner_ein_number: { type: 'string', valueString: '35-2657320', confidence: 0.99 },
              partnership_name: {
                type: 'string',
                valueString: 'IRON TRIANGLE FUND LP',
                confidence: 0.98,
              },
              'Profit Loss Capital': {
                type: 'object',
                valueObject: {
                  Profit: {
                    type: 'object',
                    valueObject: {
                      Beginning: { type: 'string', valueString: '3.032900' },
                    },
                  },
                  Loss: {
                    type: 'object',
                    valueObject: {
                      Beginning: { type: 'string', valueString: '3.032900' },
                    },
                  },
                  Capital: {
                    type: 'object',
                    valueObject: {
                      Beginning: { type: 'string', valueString: '3.032900' },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      { k1DocumentId: 'custom-defaults' },
    )

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return

    const byName = new Map(result.fieldValues.map((field) => [field.fieldName, field.rawValue]))
    expect(byName.has('partner_address')).toBe(false)
    expect(byName.get('profit_share_ending')).toBe('0.000000')
    expect(byName.get('loss_share_ending')).toBe('0.000000')
    expect(byName.get('capital_share_ending')).toBe('0.000000')
    expect(byName.get('partnership_address')).toBe('')
    expect(byName.get('box_19_distributions')).toBe('0.00')
    expect(result.nextStatus).toBe('READY_FOR_APPROVAL')
  })

  it('returns a schema mismatch failure when the custom model fields are absent', () => {
    const result = mapAzureCustomAnalyzeResult(
      { documents: [{ docType: 'k1-template-model:k1-template-model' }] },
      { k1DocumentId: 'custom-empty' },
    )

    expect(result).toEqual({
      outcome: 'FAILURE',
      errorCode: 'PARSE_SCHEMA_MISMATCH',
      errorMessage: 'Azure custom model response contained no document fields.',
    })
  })
})