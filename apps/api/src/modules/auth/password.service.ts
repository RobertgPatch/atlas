import { createHash, timingSafeEqual } from 'node:crypto'
import { argon2id, hash, needsRehash, verify, type HashOptions } from 'argon2'
import { config } from '../../config.js'
import { cloudWatchAbuseObservability } from '../abuse-protection/abuseObservability.js'

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

export interface PasswordHashLease {
  release(): void
}

export class PasswordHashSemaphore {
  readonly #limit: number
  #active = 0
  #rejected = 0

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('PASSWORD_HASH_CONCURRENCY_MUST_BE_POSITIVE')
    }
    this.#limit = limit
  }

  tryAcquire(): PasswordHashLease | null {
    if (this.#active >= this.#limit) {
      this.#rejected += 1
      cloudWatchAbuseObservability.record({
        decision: 'failed',
        policyKey: 'auth.password_hash',
        routeClass: 'AUTH_ATTEMPT',
        scopeKind: 'global',
        reasonCode: 'AUTH_HASH_SATURATED',
        environment: config.nodeEnv,
      })
      return null
    }
    this.#active += 1
    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        this.#active = Math.max(0, this.#active - 1)
      },
    }
  }

  stats(): { readonly active: number; readonly limit: number; readonly rejected: number } {
    return { active: this.#active, limit: this.#limit, rejected: this.#rejected }
  }
}

export const passwordHashSemaphore = new PasswordHashSemaphore(
  config.abuseProtection.exactRates.globalHashConcurrency,
)

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
