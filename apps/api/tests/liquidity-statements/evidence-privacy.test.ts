import { describe, expect, it } from 'vitest'
import {
  classifyAccountIdentifier,
  opaqueAccountOccurrenceId,
} from '../../src/modules/liquidity-statements/csv/account-identity.js'
import {
  minimizeStatementRecord,
  sanitizeStatementFilename,
} from '../../src/modules/liquidity-statements/statement-evidence.js'

describe('statement identifier and evidence minimization contract', () => {
  it('accepts only full text identifiers as reliable fingerprint inputs', () => {
    expect(classifyAccountIdentifier('0012-3400', 'TEXT')).toEqual({
      quality: 'FULL_RELIABLE',
      normalized: '00123400',
      displayMask: '••••3400',
    })
    expect(classifyAccountIdentifier('•••• 3400', 'TEXT')).toMatchObject({
      quality: 'MASKED',
      normalized: null,
      displayMask: '••••3400',
    })
    expect(classifyAccountIdentifier('1234567890123456', 'NUMBER')).toMatchObject({
      quality: 'UNRELIABLE_NUMERIC',
      normalized: null,
    })
    expect(classifyAccountIdentifier('', 'TEXT')).toEqual({
      quality: 'ABSENT',
      normalized: null,
      displayMask: null,
    })
  })

  it('uses opaque occurrence identifiers that reveal no account material', () => {
    const first = opaqueAccountOccurrenceId()
    const second = opaqueAccountOccurrenceId()
    expect(first).not.toBe(second)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(first).not.toContain('3400')
  })

  it('masks known account cells and omits unknown metadata values', () => {
    const minimized = minimizeStatementRecord({
      ordinal: 1,
      role: 'METADATA',
      cells: [
        { column: 0, header: 'Account Number', lexical: '0012-3400' },
        { column: 1, header: 'Unmapped Note', lexical: 'private free-form text' },
        { column: 2, header: 'Market Value', lexical: '1250.00' },
      ],
    }, {
      accountColumns: new Set([0]),
      approvedEvidenceColumns: new Set([2]),
    })
    expect(minimized.cells).toEqual([
      { column: 0, header: 'Account Number', lexical: '••••3400' },
      { column: 2, header: 'Market Value', lexical: '1250.00' },
    ])
    expect(JSON.stringify(minimized)).not.toContain('0012-3400')
    expect(JSON.stringify(minimized)).not.toContain('private free-form text')
  })

  it('applies the same masking to mapping and legacy response projections', () => {
    for (const projection of ['MAPPING_PREVIEW', 'LEGACY_RESPONSE'] as const) {
      const minimized = minimizeStatementRecord({
        ordinal: 4,
        role: 'METADATA',
        cells: [{ column: 0, header: 'Title', lexical: 'Positions for account 0012-3400' }],
      }, {
        accountColumns: new Set([0]),
        approvedEvidenceColumns: new Set(),
        projection,
      })
      expect(minimized.cells[0]?.lexical).toBe('Positions for account ••••3400')
    }
  })

  it('sanitizes source filenames without retaining account numbers or paths', () => {
    expect(sanitizeStatementFilename('C:\\Users\\owner\\Statements\\Account 00123400.xlsx', 'XLSX'))
      .toBe('statement.xlsx')
    expect(sanitizeStatementFilename('../../private.csv', 'CSV')).toBe('statement.csv')
  })
})
