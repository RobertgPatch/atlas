import { fingerprintSubject } from '../abuse-protection/subjectFingerprint.js'

interface AccountWindow {
  count: number
  expiresAt: number
}

export interface AuthAdmissionLease {
  readonly allowed: true
  release(): void
}

export interface AuthAdmissionRejection {
  readonly allowed: false
  readonly retryAfterSeconds: number
  readonly reasonCode: 'KNOWN_ACCOUNT_RATE' | 'GLOBAL_PASSWORD_CONCURRENCY'
}

export interface AuthCostAdmissionOptions {
  readonly fingerprintKey: string | Buffer | Uint8Array
  readonly accountRequests: number
  readonly accountWindowSeconds: number
  readonly passwordConcurrency: number
  readonly maximumAccounts: number
  readonly now?: () => number
}

export class AuthCostAdmissionService {
  readonly #options: AuthCostAdmissionOptions
  readonly #accounts = new Map<string, AccountWindow>()
  readonly #now: () => number
  #activePasswordHashes = 0

  constructor(options: AuthCostAdmissionOptions) {
    this.#options = options
    this.#now = options.now ?? Date.now
  }

  #prune(at: number): void {
    for (const [key, window] of this.#accounts) {
      if (window.expiresAt <= at) this.#accounts.delete(key)
    }
    while (this.#accounts.size >= this.#options.maximumAccounts) {
      const oldest = this.#accounts.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.#accounts.delete(oldest)
    }
  }

  #reserveAccount(identifier: string): AuthAdmissionRejection | null {
    const at = this.#now()
    this.#prune(at)
    const key = fingerprintSubject(this.#options.fingerprintKey, {
      scope: 'account',
      value: identifier.trim().toLowerCase(),
    }).toString('base64url')
    const existing = this.#accounts.get(key)
    if (existing && existing.expiresAt > at) {
      if (existing.count >= this.#options.accountRequests) {
        return {
          allowed: false,
          reasonCode: 'KNOWN_ACCOUNT_RATE',
          retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - at) / 1_000)),
        }
      }
      existing.count += 1
      this.#accounts.delete(key)
      this.#accounts.set(key, existing)
      return null
    }
    this.#accounts.set(key, {
      count: 1,
      expiresAt: at + this.#options.accountWindowSeconds * 1_000,
    })
    return null
  }

  acquireMfa(identifier: string): AuthAdmissionLease | AuthAdmissionRejection {
    const rejected = this.#reserveAccount(identifier)
    if (rejected) return rejected
    return { allowed: true, release() {} }
  }

  acquirePassword(identifier: string): AuthAdmissionLease | AuthAdmissionRejection {
    const rejected = this.#reserveAccount(identifier)
    if (rejected) return rejected
    if (this.#activePasswordHashes >= this.#options.passwordConcurrency) {
      return {
        allowed: false,
        reasonCode: 'GLOBAL_PASSWORD_CONCURRENCY',
        retryAfterSeconds: 1,
      }
    }
    this.#activePasswordHashes += 1
    let released = false
    return {
      allowed: true,
      release: () => {
        if (released) return
        released = true
        this.#activePasswordHashes = Math.max(0, this.#activePasswordHashes - 1)
      },
    }
  }
}
