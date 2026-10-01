import { describe, expect, it } from 'vitest'
import { validateProductionIdentitySettings, resolveProcessRole, requireProcessRole, validateProductionProcessSettings } from '../src/config.js'

const valid = {
  adminEmail: 'tpatch@jspllc.com',
  adminDisplayName: 'Tony Patch',
  adminPassword: 'temporary Tony passphrase',
  superAdminEmail: 'rpatch@jspllc.com',
  superAdminDisplayName: 'Robert Patch',
  superAdminPassword: 'distinct Robert passphrase',
}

describe('production identity contract', () => {
  it('does not require human credentials in a worker and prevents using that role to start the API', () => {
    const noHumanSecrets = { ...valid, adminPassword: '', superAdminPassword: '',
      persistenceSecretKey: 'p'.repeat(32), sessionSecret: '', sessionCookieSecure: true, sessionCookieName: 'atlas_session',
      sessionCookieSameSite: 'lax', sessionIdleTimeoutSeconds: 1800,
      sessionActivityWriteIntervalSeconds: 60, sessionAbsoluteTimeoutSeconds: 28800,
      mfaLoginEnabled: true }
    expect(() => validateProductionProcessSettings(noHumanSecrets, 'k1-worker')).not.toThrow()
    expect(() => validateProductionProcessSettings(noHumanSecrets, 'api')).toThrow(/SESSION_SECRET/)
    expect(resolveProcessRole()).toBe('api')
    expect(() => resolveProcessRole('anything')).toThrow(/ATLAS_PROCESS_ROLE/)
    expect(() => requireProcessRole('k1-worker', 'api')).toThrow(/ATLAS_PROCESS_ROLE=api/)
    expect(() => requireProcessRole('api', 'k1-worker')).toThrow(/ATLAS_PROCESS_ROLE=k1-worker/)
  })
  it('accepts only the canonical Tony and Robert identities with distinct bootstrap secrets', () => {
    expect(() => validateProductionIdentitySettings(valid)).not.toThrow()
    expect(() => validateProductionIdentitySettings({ ...valid, adminEmail: 'admin@atlas.com' })).toThrow(/Tony Patch/)
    expect(() => validateProductionIdentitySettings({ ...valid, superAdminEmail: valid.adminEmail })).toThrow(/distinct email/)
    expect(() => validateProductionIdentitySettings({ ...valid, superAdminPassword: valid.adminPassword })).toThrow(/must not share/)
  })

  it('rejects bootstrap secrets shorter than the production minimum', () => {
    expect(() => validateProductionIdentitySettings({ ...valid, adminPassword: 'short-password' })).toThrow(/15 through 128/)
  })
})
