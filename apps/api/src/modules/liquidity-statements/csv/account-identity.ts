import { randomUUID } from 'node:crypto'
import { config } from '../../../config.js'
import { fingerprintSubjectAliases } from '../../abuse-protection/subjectFingerprint.js'
import type { IdentifierQuality } from '../liquidity-statement.types.js'

const normalizeAccountIdentifier = (value: string) =>
  value.normalize('NFKC').replace(/[\s-]+/gu, '').toLocaleUpperCase('en-US')

export interface ClassifiedAccountIdentifier {
  quality: IdentifierQuality
  normalized: string | null
  displayMask: string | null
}

const displayMask = (value: string) => value ? `••••${value.slice(-4)}` : null

/** Numeric spreadsheet cells are never reliable identifiers because leading
 * zeroes and, for larger values, decimal precision may already be lost. */
export function classifyAccountIdentifier(value: string, sourceType: 'TEXT' | 'NUMBER'): ClassifiedAccountIdentifier {
  if (typeof value !== 'string') return { quality: 'ABSENT', normalized: null, displayMask: null }
  const trimmed = value.trim()
  if (!trimmed) return { quality: 'ABSENT', normalized: null, displayMask: null }
  const compact = normalizeAccountIdentifier(trimmed)
  if (sourceType === 'NUMBER') return { quality: 'UNRELIABLE_NUMERIC', normalized: null, displayMask: displayMask(compact) }
  if (/[•*xX]/u.test(compact)) {
    const suffix = compact.match(/([A-Z0-9]{1,4})$/u)?.[1] ?? ''
    return { quality: 'MASKED', normalized: null, displayMask: displayMask(suffix) }
  }
  return { quality: 'FULL_RELIABLE', normalized: compact, displayMask: displayMask(compact) }
}

export const opaqueAccountOccurrenceId = (): string => randomUUID()

/** Versioned keyed fingerprints let approved uploads match without retaining account numbers. */
export function accountIdentifierFingerprints(value: string): string[] {
  const classified = classifyAccountIdentifier(value, 'TEXT')
  if (classified.quality !== 'FULL_RELIABLE' || !classified.normalized) return []
  const normalized = classified.normalized
  return fingerprintSubjectAliases(config.abuseProtection.hmac.keyring, {
    scope: 'account',
    value: `liquidity-account:${normalized}`,
  }).map(({ keyVersion, digest }) => `${keyVersion}:${digest.toString('hex')}`)
}
