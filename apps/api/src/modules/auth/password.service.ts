import { createHash, timingSafeEqual } from 'node:crypto'
import { argon2id, hash, needsRehash, verify, type HashOptions } from 'argon2'
import { config } from '../../config.js'

const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i

const argon2Options = (): HashOptions => ({
  type: argon2id,
  memoryCost: config.passwordHash.memoryCostKiB,
  timeCost: config.passwordHash.timeCost,
  parallelism: config.passwordHash.parallelism,
  hashLength: 32,
})

export interface PasswordVerification {
  valid: boolean
  needsUpgrade: boolean
}

export const passwordService = {
  isLegacyHash(passwordHash: string): boolean {
    return LEGACY_SHA256_PATTERN.test(passwordHash)
  },

  async hash(password: string): Promise<string> {
    return hash(password, argon2Options())
  },

  async verify(passwordHash: string, password: string): Promise<PasswordVerification> {
    if (this.isLegacyHash(passwordHash)) {
      const actual = Buffer.from(passwordHash, 'hex')
      const candidate = createHash('sha256').update(password).digest()
      const valid = actual.length === candidate.length && timingSafeEqual(actual, candidate)
      return {
        valid,
        needsUpgrade: valid,
      }
    }

    if (!passwordHash.startsWith('$argon2id$')) {
      return { valid: false, needsUpgrade: false }
    }

    try {
      const valid = await verify(passwordHash, password)
      return {
        valid,
        needsUpgrade: valid && needsRehash(passwordHash, argon2Options()),
      }
    } catch {
      return { valid: false, needsUpgrade: false }
    }
  },
}
