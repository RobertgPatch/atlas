import { config } from '../../config.js'

interface LockoutState {
  failures: number
  lockoutUntil?: Date
}

const lockoutMap = new Map<string, LockoutState>()

const keyOf = (identifier: string, type: 'PASSWORD' | 'MFA') =>
  `${identifier.toLowerCase()}:${type}`

export const lockoutService = {
  getLockout(identifier: string, type: 'PASSWORD' | 'MFA'): Date | null {
    const state = lockoutMap.get(keyOf(identifier, type))
    if (!state?.lockoutUntil) return null
    if (state.lockoutUntil.getTime() <= Date.now()) {
      lockoutMap.delete(keyOf(identifier, type))
      return null
    }
    return state.lockoutUntil
  },

  recordFailure(identifier: string, type: 'PASSWORD' | 'MFA'): Date | null {
    const key = keyOf(identifier, type)
    const existing = lockoutMap.get(key) ?? { failures: 0 }
    existing.failures += 1

    if (existing.failures >= config.authLockoutThreshold) {
      existing.failures = 0
      existing.lockoutUntil = new Date(
        Date.now() + config.authLockoutMinutes * 60 * 1000,
      )
    }

    lockoutMap.set(key, existing)
    return existing.lockoutUntil ?? null
  },

  clear(identifier: string, type: 'PASSWORD' | 'MFA') {
    lockoutMap.delete(keyOf(identifier, type))
  },
}
