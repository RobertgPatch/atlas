import { describe, expect, it } from 'vitest'
import { config } from '../src/config.js'
import { evaluatePassword, passwordPolicySummary } from '../src/modules/auth/passwordPolicy.js'

const evaluate = (password: string) => evaluatePassword({
  password,
  email: 'tpatch@jspllc.com',
  displayName: 'Tony Patch',
})

describe('password policy', () => {
  it('enforces a modern minimum stronger than the requested ten characters', () => {
    expect(passwordPolicySummary.minimumCharacters).toBe(15)
    expect(evaluate('short pass').code).toBe('PASSWORD_TOO_SHORT')
    expect(evaluate('a'.repeat(config.passwordPolicy.maximumCharacters + 1)).code).toBe('PASSWORD_TOO_LONG')
  })

  it('accepts long passphrases without arbitrary composition rules', () => {
    expect(evaluate('maple river lantern orchard').valid).toBe(true)
    expect(evaluate('all lowercase but uniquely long').valid).toBe(true)
    expect(passwordPolicySummary.compositionRequired).toBe(false)
  })

  it('normalizes unicode and blocks common or account-specific passwords', () => {
    expect(evaluate('password123456789').code).toBe('PASSWORD_COMMON')
    expect(evaluate('Tony Patch Password').code).toBe('PASSWORD_CONTEXT_SPECIFIC')
    const result = evaluate('Cafe\u0301 lantern river stone')
    expect(result.valid).toBe(true)
    expect(result.normalizedPassword).toBe('Caf\u00e9 lantern river stone')
  })
})
