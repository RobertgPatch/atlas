import { config } from '../../../config.js'
import { fingerprintSubjectAliases } from '../../abuse-protection/subjectFingerprint.js'

const normalizeAccountIdentifier = (value: string) =>
  value.normalize('NFKC').replace(/[\s-]+/gu, '').toLocaleUpperCase('en-US')

/** Versioned keyed fingerprints let approved uploads match without retaining account numbers. */
export function accountIdentifierFingerprints(value: string): string[] {
  const normalized = normalizeAccountIdentifier(value)
  if (!normalized) return []
  return fingerprintSubjectAliases(config.abuseProtection.hmac.keyring, {
    scope: 'account',
    value: `liquidity-account:${normalized}`,
  }).map(({ keyVersion, digest }) => `${keyVersion}:${digest.toString('hex')}`)
}
