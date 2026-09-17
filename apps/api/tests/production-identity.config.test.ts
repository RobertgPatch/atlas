import { describe, expect, it } from 'vitest'
import { validateProductionIdentitySettings } from '../src/config.js'

const valid = {
  adminEmail: 'tpatch@jspllc.com',
  adminDisplayName: 'Tony Patch',
  adminPassword: 'temporary Tony passphrase',
  superAdminEmail: 'rpatch@jspllc.com',
  superAdminDisplayName: 'Robert Patch',
  superAdminPassword: 'distinct Robert passphrase',
}

describe('production identity contract', () => {
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
