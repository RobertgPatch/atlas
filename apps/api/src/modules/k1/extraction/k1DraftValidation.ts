import type {
  K1ExtractedValueKind,
  K1ExtractionDraftIssue,
} from '../k1.types.js'

export interface K1NormalizationResult {
  value: unknown
  issue?: Omit<K1ExtractionDraftIssue, 'canonicalPath' | 'occurrenceId'>
}

const invalid = (message: string): K1NormalizationResult => ({
  value: null,
  issue: { code: 'INVALID_EXTRACTED_VALUE', severity: 'HIGH', message },
})

const blank = (): K1NormalizationResult => ({
  value: null,
  issue: {
    code: 'BLANK_EXTRACTED_FIELD',
    severity: 'MEDIUM',
    message: 'The provider returned a field without a value.',
  },
})

export const normalizeMoney = (raw: unknown): string | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw.toFixed(2)
  if (typeof raw !== 'string') return null
  let value = raw.trim()
  if (!value) return null
  // Printed K-1 currency cells can place the dollar sign before the accounting
  // parentheses (for example, "$ ( 190,773)"). The parentheses still carry
  // the sign even though they do not wrap the entire source string.
  const negative = /\([^)]*\)/.test(value) || /-$/.test(value)
  value = value.replace(/[()$,%\s,]/g, '').replace(/-$/, '')
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  const signed = negative ? -Math.abs(amount) : amount
  return signed.toFixed(2)
}

const normalizeDate = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : null
  if (!parts) return null
  const normalized = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null
}

const normalizePercentage = (raw: unknown): string | null => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const value = String(raw).trim().replace(/\s*%$/, '').trim()
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100) return null
  return number.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

const normalizeBoolean = (raw: unknown): boolean | null => {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : null
  if (typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase()
  if (['x', 'yes', 'true', 'checked', '1'].includes(value)) return true
  if (['no', 'false', 'unchecked', '0'].includes(value)) return false
  return null
}

const normalizeIdentifier = (canonicalPath: string, raw: unknown): string | null => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length !== 9) return null
  return canonicalPath.endsWith('partnership_ein')
    ? `${digits.slice(0, 2)}-${digits.slice(2)}`
    : `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

const isMaskedTaxIdentifier = (raw: unknown): boolean => {
  if (typeof raw !== 'string') return false
  return /[*x•]/i.test(raw) && /\d{4}\D*$/.test(raw)
}

const isBlankMoneyPlaceholder = (raw: unknown): boolean => {
  if (typeof raw !== 'string' || !raw.trim()) return false
  return raw.replace(/[$(),\s\-–—]/g, '').length === 0
}

const normalizeChoice = (canonicalPath: string, raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const value = raw.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (canonicalPath.endsWith('part_ii_h1_partner_residency')) {
    if (value.includes('DOMESTIC')) return 'DOMESTIC'
    if (value.includes('FOREIGN')) return 'FOREIGN'
    return null
  }
  if (canonicalPath.endsWith('part_ii_m_built_in_gain_loss')) {
    return value === 'YES' || value === 'NO' ? value : null
  }
  if (canonicalPath.endsWith('part_ii_g_partner_classification')) {
    if (value.includes('GENERAL') || value.includes('MANAGER')) return 'GENERAL_PARTNER_OR_LLC_MEMBER_MANAGER'
    if (value.includes('LIMITED') || value.includes('OTHER_LLC')) return 'LIMITED_PARTNER_OR_OTHER_LLC_MEMBER'
    return null
  }
  return raw.trim()
}

export const isK1StatementReference = (raw: unknown): boolean => {
  const candidate = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>).amount ?? (raw as Record<string, unknown>).value
    : raw
  if (typeof candidate !== 'string') return false
  const value = candidate.trim()
  return /^(?:see\s+)?(?:stmt|statement|attached|attachment)(?:\s+\d+)?\.?$/i.test(value)
    || /(?:amount|value)\s*:\s*(?:see\s+)?(?:stmt|statement|attached|attachment)\b/i.test(value)
}

const codeRowDisplayName = (canonicalPath: string, code: string): {
  label: string
  line: string | null
} => {
  const line = /^official\.box_(\d+[a-z]?)_entries$/i.exec(canonicalPath)?.[1] ?? null
  return {
    label: line ? `Part III, Line ${line}${code ? `, code ${code}` : ''}` : canonicalPath,
    line,
  }
}

const normalizeCodeRow = (canonicalPath: string, raw: unknown): K1NormalizationResult => {
  let candidate = raw
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw)
    } catch {
      const compact = /^\{\s*code\s*:\s*(.*?),\s*description\s*:\s*(.*?),\s*amount\s*:\s*(.*?)\s*\}$/i.exec(raw.trim())
      if (!compact) return invalid('Expected a coded K-1 row.')
      candidate = { code: compact[1], description: compact[2], amount: compact[3] }
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return invalid('Expected a coded K-1 row.')
  const record = candidate as Record<string, unknown>
  const code = typeof record.code === 'string' ? record.code.trim().toUpperCase() : ''
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const amountRaw = record.amount ?? record.value
  const amountIsBlank = amountRaw === null
    || amountRaw === undefined
    || (typeof amountRaw === 'string' && !amountRaw.trim())
  if (isK1StatementReference(amountRaw)) {
    return { value: { code, description: description || 'See statement', amount: null } }
  }
  if (amountIsBlank) {
    if (!code && !description) return blank()
    return { value: { code, description, amount: null } }
  }
  const amount = normalizeMoney(amountRaw)
  if (!code && !description && amount === null) return blank()
  if (amount === null) {
    const display = codeRowDisplayName(canonicalPath, code)
    return {
      value: { code, description, amount: null },
      issue: {
        code: 'INVALID_EXTRACTED_VALUE',
        severity: 'HIGH',
        message: `${display.label}: the extracted amount "${String(amountRaw)}" is not valid money.`,
        details: {
          line: display.line,
          code: code || null,
          description: description || null,
          rawAmount: String(amountRaw),
        },
      },
    }
  }
  return { value: { code, description, amount } }
}

export const normalizeK1ExtractedValue = (
  canonicalPath: string,
  kind: K1ExtractedValueKind,
  raw: unknown,
): K1NormalizationResult => {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) return blank()
  if (kind === 'CODE_ROW') return normalizeCodeRow(canonicalPath, raw)

  // Masked TINs and empty printed currency cells are absence signals, not bad
  // data. Keep the raw evidence but do not force a reviewer to "correct" it.
  if ((canonicalPath === 'match.partner_tin' || canonicalPath === 'match.partnership_ein')
    && isMaskedTaxIdentifier(raw)) return { value: null }
  if ((kind === 'MONEY' || (kind === 'NUMBER' && canonicalPath.startsWith('calculation.')))
    && isBlankMoneyPlaceholder(raw)) return { value: null }

  let value: unknown
  if (kind === 'MONEY' || (kind === 'NUMBER' && canonicalPath.startsWith('calculation.'))) {
    value = normalizeMoney(raw)
  } else if (kind === 'DATE') {
    value = normalizeDate(raw)
  } else if (kind === 'PERCENTAGE') {
    value = normalizePercentage(raw)
  } else if (kind === 'BOOLEAN') {
    value = normalizeBoolean(raw)
  } else if (canonicalPath === 'match.partner_tin' || canonicalPath === 'match.partnership_ein') {
    value = normalizeIdentifier(canonicalPath, raw)
  } else if (canonicalPath.includes('partner_residency') || canonicalPath.includes('partner_classification')
    || canonicalPath.includes('built_in_gain_loss')) {
    value = normalizeChoice(canonicalPath, raw)
  } else if (kind === 'NUMBER') {
    const numeric = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''))
    value = Number.isFinite(numeric) ? numeric : null
  } else {
    value = typeof raw === 'string' ? raw.trim() : String(raw)
  }

  return value === null ? invalid(`The value is invalid for ${kind.toLowerCase()}.`) : { value }
}

export const validateK1DraftRelationships = (
  values: Array<{ canonicalPath: string; normalizedValue: unknown; occurrenceId: string }>,
): K1ExtractionDraftIssue[] => {
  const truthyPaths = new Set(values.filter((entry) => entry.normalizedValue === true).map((entry) => entry.canonicalPath))
  const issues: K1ExtractionDraftIssue[] = []
  if (truthyPaths.has('official.k1_status_final') && truthyPaths.has('official.k1_status_amended')) {
    issues.push({
      code: 'MUTUALLY_EXCLUSIVE_FIELDS',
      severity: 'HIGH',
      message: 'A K-1 cannot be both final and amended.',
      details: { paths: ['official.k1_status_final', 'official.k1_status_amended'] },
    })
  }
  const dates = new Map(values.map((entry) => [entry.canonicalPath, entry.normalizedValue]))
  const beginning = dates.get('official.tax_period_beginning')
  const ending = dates.get('official.tax_period_ending')
  if (typeof beginning === 'string' && typeof ending === 'string' && beginning > ending) {
    issues.push({
      code: 'INVALID_TAX_PERIOD',
      severity: 'HIGH',
      message: 'The tax period ending date is before the beginning date.',
    })
  }
  return issues
}
