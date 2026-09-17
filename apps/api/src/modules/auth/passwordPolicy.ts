import { config } from '../../config.js'

export const PASSWORD_POLICY_CODES = [
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_COMMON',
  'PASSWORD_CONTEXT_SPECIFIC',
  'PASSWORD_CONTROL_CHARACTER',
] as const

export type PasswordPolicyCode = (typeof PASSWORD_POLICY_CODES)[number]

export interface PasswordPolicyResult {
  readonly valid: boolean
  readonly normalizedPassword: string
  readonly code?: PasswordPolicyCode
}

const commonPasswords = new Set([
  '123456789012345',
  '1234567890123456',
  'adminadminadmin',
  'administrator',
  'changemechangeme',
  'correcthorsebatterystaple',
  'iloveyouiloveyou',
  'letmeinletmeinletmein',
  'passwordpassword',
  'password123456789',
  'qwertyqwertyqwerty',
  'welcome123456789',
])

const compact = (value: string): string => value
  .normalize('NFC')
  .toLocaleLowerCase('en-US')
  .replace(/[^a-z0-9]/g, '')

const contextualPasswords = (email: string, displayName: string): Set<string> => {
  const emailLocal = email.split('@', 1)[0] ?? ''
  const context = [
    'jackson',
    'projectjackson',
    'jspllc',
    emailLocal,
    displayName,
    `${displayName}password`,
    `${emailLocal}password`,
  ].map(compact).filter(Boolean)
  return new Set(context)
}

export const evaluatePassword = (input: {
  readonly password: string
  readonly email: string
  readonly displayName: string
}): PasswordPolicyResult => {
  const normalizedPassword = input.password.normalize('NFC')
  const characterCount = [...normalizedPassword].length
  if (characterCount < config.passwordPolicy.minimumCharacters) {
    return { valid: false, normalizedPassword, code: 'PASSWORD_TOO_SHORT' }
  }
  if (characterCount > config.passwordPolicy.maximumCharacters) {
    return { valid: false, normalizedPassword, code: 'PASSWORD_TOO_LONG' }
  }
  if (/\p{Cc}/u.test(normalizedPassword)) {
    return { valid: false, normalizedPassword, code: 'PASSWORD_CONTROL_CHARACTER' }
  }

  const comparison = normalizedPassword.toLocaleLowerCase('en-US')
  const compactComparison = compact(normalizedPassword)
  if (commonPasswords.has(comparison) || commonPasswords.has(compactComparison)) {
    return { valid: false, normalizedPassword, code: 'PASSWORD_COMMON' }
  }
  if (contextualPasswords(input.email, input.displayName).has(compactComparison)) {
    return { valid: false, normalizedPassword, code: 'PASSWORD_CONTEXT_SPECIFIC' }
  }

  return { valid: true, normalizedPassword }
}

export const passwordPolicySummary = {
  minimumCharacters: config.passwordPolicy.minimumCharacters,
  maximumCharacters: config.passwordPolicy.maximumCharacters,
  acceptsPassphrases: true,
  compositionRequired: false,
} as const
