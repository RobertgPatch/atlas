import { describe, expect, it } from 'vitest'

import {
  buildAbuseProtectionConfig,
  validateProductionSessionSettings,
} from '../src/config.js'

const everyNumberIsFiniteAndPositive = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (Array.isArray(value)) return value.every(everyNumberIsFiniteAndPositive)
  if (value && typeof value === 'object') {
    return Object.values(value).every(everyNumberIsFiniteAndPositive)
  }
  return true
}

describe('abuse-protection configuration', () => {
  it('uses finite conservative defaults and keeps paid workloads disabled locally', () => {
    const protection = buildAbuseProtectionConfig({}, 'development')

    expect(everyNumberIsFiniteAndPositive(protection)).toBe(true)
    expect(protection.localRates.authSource).toEqual({ requests: 20, seconds: 300 })
    expect(protection.exactRates.knownAccount).toEqual({ requests: 5, seconds: 900 })
    expect(protection.quotas.paidExtraction).toMatchObject({
      globalDocumentsPerDay: 100,
      globalInFlight: 5,
      globalBacklog: 100,
      retriesPerDocumentPerDay: 2,
      lifetimeRetriesPerDocument: 5,
    })
    expect(protection.quotas.monthlyCost).toMatchObject({
      maximumCents: 2_500,
      k1BdaProviderCalls: 1,
      plaidRefreshes: 2,
    })
    expect(Object.values(protection.killSwitches)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
  })

  it('rejects invalid integers and non-canonical booleans instead of falling back', () => {
    expect(() =>
      buildAbuseProtectionConfig(
        { ABUSE_K1_GLOBAL_DOCUMENTS_PER_DAY: 'Infinity' },
        'development',
      ),
    ).toThrow(/ABUSE_K1_GLOBAL_DOCUMENTS_PER_DAY/)

    expect(() =>
      buildAbuseProtectionConfig(
        { ABUSE_K1_EXTRACTION_GLOBAL_BACKLOG: '0' },
        'development',
      ),
    ).toThrow(/ABUSE_K1_EXTRACTION_GLOBAL_BACKLOG/)

    expect(() =>
      buildAbuseProtectionConfig({ K1_EXTRACTION_ENABLED: 'yes' }, 'development'),
    ).toThrow(/K1_EXTRACTION_ENABLED/)

    expect(() =>
      buildAbuseProtectionConfig(
        { ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS: '2501' },
        'development',
      ),
    ).toThrow(/ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS/)
  })

  it('requires explicit HMAC material and paid-work ceilings in production', () => {
    expect(() => buildAbuseProtectionConfig({}, 'production')).toThrow(
      /ABUSE_HMAC_ACTIVE_KEY/,
    )

    expect(() =>
      buildAbuseProtectionConfig(
        {
          ABUSE_HMAC_ACTIVE_KEY: 'production-test-hmac-key-material-0001',
          ABUSE_HMAC_KEY_ID: 'production-test-v1',
        },
        'production',
      ),
    ).toThrow(/ABUSE_WORKBOOK_USER_PER_DAY/)
  })

  it('rejects inconsistent user/global, retry, delay, and timeout ceilings', () => {
    expect(() =>
      buildAbuseProtectionConfig(
        {
          ABUSE_K1_USER_FILES_PER_DAY: '11',
          ABUSE_K1_GLOBAL_FILES_PER_DAY: '10',
        },
        'development',
      ),
    ).toThrow(/ABUSE_K1_USER_FILES_PER_DAY/)

    expect(() =>
      buildAbuseProtectionConfig(
        {
          ABUSE_K1_RETRIES_PER_DOCUMENT_PER_DAY: '6',
          ABUSE_K1_LIFETIME_RETRIES_PER_DOCUMENT: '5',
        },
        'development',
      ),
    ).toThrow(/ABUSE_K1_RETRIES_PER_DOCUMENT_PER_DAY/)

    expect(() =>
      buildAbuseProtectionConfig(
        {
          ABUSE_RETRY_BASE_DELAY_MS: '2001',
          ABUSE_RETRY_MAX_DELAY_MS: '2000',
        },
        'development',
      ),
    ).toThrow(/ABUSE_RETRY_BASE_DELAY_MS/)

    expect(() =>
      buildAbuseProtectionConfig(
        {
          ABUSE_HEADERS_TIMEOUT_MS: '30001',
          ABUSE_REQUEST_TIMEOUT_MS: '30000',
        },
        'development',
      ),
    ).toThrow(/ABUSE_HEADERS_TIMEOUT_MS/)
  })

  it('validates HMAC key strength, uniqueness, and bounded rotation history', () => {
    expect(() =>
      buildAbuseProtectionConfig({ ABUSE_HMAC_ACTIVE_KEY: 'too-short' }, 'test'),
    ).toThrow(/ABUSE_HMAC_ACTIVE_KEY/)

    const key = 'shared-test-hmac-key-material-0000001'
    expect(() =>
      buildAbuseProtectionConfig(
        { ABUSE_HMAC_ACTIVE_KEY: key, ABUSE_HMAC_PREVIOUS_KEYS: key },
        'test',
      ),
    ).toThrow(/rotation keys must be unique/)

    expect(() =>
      buildAbuseProtectionConfig(
        {
          ABUSE_HMAC_PREVIOUS_KEYS: [1, 2, 3, 4, 5]
            .map((index) => `previous-test-hmac-key-material-${index.toString().padStart(4, '0')}`)
            .join(','),
        },
        'test',
      ),
    ).toThrow(/at most four/)
  })

  it('rejects unsafe or unbounded production session settings', () => {
    const safe = {
      sessionSecret: 'production-session-secret-material-0001',
      sessionCookieSecure: true,
      sessionCookieName: 'atlas_session',
      sessionCookieSameSite: 'lax',
      sessionIdleTimeoutSeconds: 1_800,
      sessionActivityWriteIntervalSeconds: 60,
      sessionAbsoluteTimeoutSeconds: 28_800,
    }

    expect(() => validateProductionSessionSettings(safe)).not.toThrow()
    expect(() => validateProductionSessionSettings({
      ...safe,
      sessionCookieSecure: false,
    })).toThrow(/SESSION_COOKIE_SECURE/)
    expect(() => validateProductionSessionSettings({
      ...safe,
      sessionCookieSameSite: 'invalid',
    })).toThrow(/SESSION_COOKIE_SAMESITE/)
    expect(() => validateProductionSessionSettings({
      ...safe,
      sessionActivityWriteIntervalSeconds: 1_801,
    })).toThrow(/SESSION_ACTIVITY_WRITE_INTERVAL_SECONDS/)
    expect(() => validateProductionSessionSettings({
      ...safe,
      sessionAbsoluteTimeoutSeconds: 1_799,
    })).toThrow(/idle\/absolute/)
  })
})
