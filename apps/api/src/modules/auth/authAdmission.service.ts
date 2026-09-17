import {
  admissionService,
  type AuthenticationAdmissionInput,
  type AuthenticationAdmissionResult,
  type AuthenticationRateReservation,
  type AuthAdmissionReasonCode,
} from '../abuse-protection/admission.service.js'
import { cloudWatchAbuseObservability } from '../abuse-protection/abuseObservability.js'
import {
  fingerprintSubjectAliases,
  stableGlobalSubject,
  validateFingerprintKeyring,
  type FingerprintKeyring,
} from '../abuse-protection/subjectFingerprint.js'

export interface AuthAdmissionWindow {
  readonly requests: number
  readonly seconds: number
}

export interface AuthAdmissionLimits {
  readonly global: AuthAdmissionWindow
  readonly globalDaily: AuthAdmissionWindow
  readonly source: AuthAdmissionWindow
  readonly account: AuthAdmissionWindow
}

export interface AuthAdmissionInput {
  readonly sourcePrefix: string
  readonly accountIdentifier?: string
}

export type AuthAdmissionResult = AuthenticationAdmissionResult

export interface AuthAdmissionStore {
  reserve(input: AuthenticationAdmissionInput): Promise<AuthenticationAdmissionResult>
}

export interface AuthCostAdmissionOptions {
  readonly fingerprintKeyring: FingerprintKeyring
  readonly environment: string
  readonly limits: AuthAdmissionLimits
  readonly admissionStore?: AuthAdmissionStore
  readonly now?: () => Date
}

interface MemoryWindow {
  readonly count: number
  readonly expiresAt: number
}

export interface InMemoryAuthAdmissionStore extends AuthAdmissionStore {
  stats(): { readonly subjectRows: number }
}

const positiveWindow = (window: AuthAdmissionWindow, name: string): AuthAdmissionWindow => {
  if (!Number.isSafeInteger(window.requests) || window.requests <= 0) {
    throw new Error(`${name}.requests must be a positive safe integer.`)
  }
  if (!Number.isSafeInteger(window.seconds) || window.seconds <= 0) {
    throw new Error(`${name}.seconds must be a positive safe integer.`)
  }
  return window
}

const fixedWindow = (at: number, seconds: number): { start: number; end: number } => {
  const milliseconds = seconds * 1_000
  const start = Math.floor(at / milliseconds) * milliseconds
  return { start, end: start + milliseconds }
}

const rejectionReason = (
  rate: AuthenticationRateReservation,
): Exclude<AuthAdmissionReasonCode, 'AUTH_STORE_UNAVAILABLE'> => {
  if (rate.scope === 'source_prefix') return 'AUTH_SOURCE_RATE'
  if (rate.scope === 'account') return 'AUTH_ACCOUNT_RATE'
  return 'AUTH_GLOBAL_RATE'
}

const recordAuthAdmission = (
  environment: string,
  result: AuthAdmissionResult,
): void => {
  const reasonCode = result.allowed ? 'AUTH_RATE_ALLOWED' : result.reasonCode
  const scopeKind = reasonCode === 'AUTH_SOURCE_RATE'
    ? 'source_prefix' as const
    : reasonCode === 'AUTH_ACCOUNT_RATE'
      ? 'account' as const
      : 'global' as const
  cloudWatchAbuseObservability.record({
    decision: result.allowed
      ? 'allowed'
      : result.reasonCode === 'AUTH_STORE_UNAVAILABLE'
        ? 'failed'
        : 'throttled',
    policyKey: 'auth.durable',
    routeClass: 'AUTH_ATTEMPT',
    scopeKind,
    reasonCode,
    environment,
  })
}

export const createInMemoryAuthAdmissionStore = (
  options: { readonly now?: () => Date } = {},
): InMemoryAuthAdmissionStore => {
  const now = options.now ?? (() => new Date())
  const windows = new Map<string, MemoryWindow>()

  return {
    async reserve(input) {
      const at = now().getTime()
      for (const [key, value] of windows) {
        if (value.expiresAt <= at) windows.delete(key)
      }

      const staged: Array<{
        readonly activeKey: string
        readonly aliasKeys: readonly string[]
        readonly next: MemoryWindow
      }> = []

      for (const rate of input.rates) {
        const boundary = fixedWindow(at, rate.windowSeconds)
        const aliasKeys = rate.subjectHashes.map((hash) => [
          rate.policyKey,
          rate.scope,
          Buffer.from(hash).toString('hex'),
          boundary.start,
          rate.windowSeconds,
        ].join(':'))
        const activeKey = aliasKeys[0]
        if (!activeKey) throw new Error('AUTH_ADMISSION_SUBJECT_REQUIRED')
        const consumed = aliasKeys.reduce((sum, key) => sum + (windows.get(key)?.count ?? 0), 0)
        if (consumed + 1 > rate.requests) {
          return {
            allowed: false,
            reasonCode: rejectionReason(rate),
            retryAfterSeconds: Math.max(1, Math.ceil((boundary.end - at) / 1_000)),
          }
        }
        staged.push({
          activeKey,
          aliasKeys,
          next: { count: consumed + 1, expiresAt: boundary.end },
        })
      }

      for (const reservation of staged) {
        for (const key of reservation.aliasKeys) windows.delete(key)
        windows.set(reservation.activeKey, reservation.next)
      }
      return {
        allowed: true,
        reservedScopes: input.rates.map((rate) => rate.scope),
      }
    },
    stats: () => ({ subjectRows: windows.size }),
  }
}

const durableAdmissionStore: AuthAdmissionStore = {
  reserve: (input) => admissionService.admitAuthentication(input),
}

export class AuthCostAdmissionService {
  readonly #keyring: FingerprintKeyring
  readonly #environment: string
  readonly #limits: AuthAdmissionLimits
  readonly #store: AuthAdmissionStore
  readonly #now: () => Date
  #globalExhaustedUntil = 0

  constructor(options: AuthCostAdmissionOptions) {
    this.#keyring = validateFingerprintKeyring(options.fingerprintKeyring)
    this.#environment = options.environment
    this.#limits = {
      global: positiveWindow(options.limits.global, 'limits.global'),
      globalDaily: positiveWindow(options.limits.globalDaily, 'limits.globalDaily'),
      source: positiveWindow(options.limits.source, 'limits.source'),
      account: positiveWindow(options.limits.account, 'limits.account'),
    }
    this.#store = options.admissionStore ?? durableAdmissionStore
    this.#now = options.now ?? (() => new Date())
  }

  async admit(input: AuthAdmissionInput): Promise<AuthAdmissionResult> {
    const now = this.#now()
    const at = now.getTime()
    if (!Number.isFinite(at)) throw new Error('AUTH_ADMISSION_INVALID_TIME')
    if (this.#globalExhaustedUntil > at) {
      const result = {
        allowed: false,
        reasonCode: 'AUTH_GLOBAL_RATE',
        retryAfterSeconds: Math.max(1, Math.ceil((this.#globalExhaustedUntil - at) / 1_000)),
      } as const
      recordAuthAdmission(this.#environment, result)
      return result
    }

    const globalAliases = fingerprintSubjectAliases(this.#keyring, {
      scope: 'global',
      value: stableGlobalSubject(this.#environment, 'auth'),
    }).map((alias) => alias.digest)
    const sourceAliases = fingerprintSubjectAliases(this.#keyring, {
      scope: 'source_prefix',
      value: input.sourcePrefix,
    }).map((alias) => alias.digest)
    const rates: AuthenticationRateReservation[] = [
      {
        policyKey: 'auth.00.global',
        scope: 'global',
        subjectHashes: globalAliases,
        requests: this.#limits.global.requests,
        windowSeconds: this.#limits.global.seconds,
      },
      {
        policyKey: 'auth.01.global_daily',
        scope: 'global',
        subjectHashes: globalAliases,
        requests: this.#limits.globalDaily.requests,
        windowSeconds: this.#limits.globalDaily.seconds,
      },
      {
        policyKey: 'auth.02.source',
        scope: 'source_prefix',
        subjectHashes: sourceAliases,
        requests: this.#limits.source.requests,
        windowSeconds: this.#limits.source.seconds,
      },
    ]
    const accountIdentifier = input.accountIdentifier?.trim().toLowerCase()
    if (accountIdentifier) {
      rates.push({
        policyKey: 'auth.03.account',
        scope: 'account',
        subjectHashes: fingerprintSubjectAliases(this.#keyring, {
          scope: 'account',
          value: accountIdentifier,
        }).map((alias) => alias.digest),
        requests: this.#limits.account.requests,
        windowSeconds: this.#limits.account.seconds,
      })
    }

    try {
      const result = await this.#store.reserve({ rates, now })
      if (!result.allowed && result.reasonCode === 'AUTH_GLOBAL_RATE') {
        this.#globalExhaustedUntil = at + result.retryAfterSeconds * 1_000
      }
      recordAuthAdmission(this.#environment, result)
      return result
    } catch {
      const result = {
        allowed: false,
        reasonCode: 'AUTH_STORE_UNAVAILABLE',
        retryAfterSeconds: 30,
      } as const
      recordAuthAdmission(this.#environment, result)
      return result
    }
  }
}
