import assert from 'node:assert/strict'

import type {
  AdmissionAllowed,
  AdmissionDecision,
  CostUnitReservation,
  RouteProtectionPolicy,
  ScopeDimension,
} from '../../src/modules/abuse-protection/protection.types.js'
import {
  fingerprintCanonicalRequest,
  fingerprintSubject,
  fingerprintSubjectAliases,
  type CanonicalRequestFingerprintInput,
  type FingerprintKeyring,
} from '../../src/modules/abuse-protection/subjectFingerprint.js'

const DEFAULT_TEST_TIME = '2026-01-15T12:00:00.000Z'
const DEFAULT_TEST_OPERATION_ID = '00000000-0000-4000-8000-000000000001'

export interface ControllableClock {
  now(): Date
  nowMs(): number
  set(value: Date | string | number): Date
  advanceMs(milliseconds: number): Date
  advanceSeconds(seconds: number): Date
  reset(): Date
}

const finiteTimestamp = (value: Date | string | number): number => {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(timestamp)) throw new Error('INVALID_TEST_CLOCK_TIME')
  return timestamp
}

export const createControllableClock = (
  initial: Date | string | number = DEFAULT_TEST_TIME,
): ControllableClock => {
  const initialTimestamp = finiteTimestamp(initial)
  let currentTimestamp = initialTimestamp

  const current = (): Date => new Date(currentTimestamp)
  return {
    now: current,
    nowMs: () => currentTimestamp,
    set(value) {
      currentTimestamp = finiteTimestamp(value)
      return current()
    },
    advanceMs(milliseconds) {
      if (!Number.isFinite(milliseconds)) throw new Error('INVALID_TEST_CLOCK_ADVANCE')
      currentTimestamp += milliseconds
      return current()
    },
    advanceSeconds(seconds) {
      if (!Number.isFinite(seconds)) throw new Error('INVALID_TEST_CLOCK_ADVANCE')
      currentTimestamp += seconds * 1_000
      return current()
    },
    reset() {
      currentTimestamp = initialTimestamp
      return current()
    },
  }
}

/** Fixed test-only key. Production code must always use configured secret key material. */
export const TEST_FINGERPRINT_KEY = Buffer.from(
  'atlas-abuse-protection-test-fingerprint-key-v1',
  'utf8',
)

export const deterministicSubjectFingerprint = (
  scope: ScopeDimension,
  value: string,
): Buffer => fingerprintSubject(TEST_FINGERPRINT_KEY, { scope, value })

export const deterministicRequestFingerprint = (
  input: CanonicalRequestFingerprintInput,
): Buffer => fingerprintCanonicalRequest(TEST_FINGERPRINT_KEY, input)

export const TEST_FINGERPRINT_KEYRING: FingerprintKeyring = {
  active: { id: 'test-v2', key: TEST_FINGERPRINT_KEY },
  retained: [{
    id: 'test-v1',
    key: Buffer.from('atlas-abuse-protection-retained-test-key-v1', 'utf8'),
    retireAfter: new Date('2099-01-01T00:00:00.000Z'),
  }],
}

export const createSubjectFixture = (values: Partial<Record<ScopeDimension, string>> = {}) => {
  const defaults: Record<ScopeDimension, string> = {
    source_prefix: '198.51.100.0/24',
    account: 'owner@example.test',
    user: '00000000-0000-4000-8000-000000000001',
    session: '00000000-0000-4000-8000-000000000002',
    tenant: 'family-office',
    entity: '00000000-0000-4000-8000-000000000003',
    provider: 'stub-provider',
    operation: '00000000-0000-4000-8000-000000000004',
    global: 'test:auth:v1',
  }
  const resolved = { ...defaults, ...values }
  return Object.fromEntries(Object.entries(resolved).map(([scope, value]) => [
    scope,
    fingerprintSubjectAliases(TEST_FINGERPRINT_KEYRING, {
      scope: scope as ScopeDimension,
      value,
    }),
  ])) as Record<ScopeDimension, ReturnType<typeof fingerprintSubjectAliases>>
}

export const fingerprintHex = (fingerprint: Uint8Array): string =>
  Buffer.from(fingerprint).toString('hex')

export interface TestAdmissionRequest {
  readonly policy: Pick<RouteProtectionPolicy, 'policyKey'>
  readonly requestId: string
  readonly reservations?: readonly CostUnitReservation[]
  readonly operationId?: string
}

export type AdmissionDecisionFactory = (
  request: TestAdmissionRequest,
  callIndex: number,
) => AdmissionDecision | Promise<AdmissionDecision>

export interface AdmissionStoreCall {
  readonly request: TestAdmissionRequest
  readonly calledAt: Date
}

/**
 * Structural seam for service tests. It deliberately does not import the SQL
 * repository so admission behavior can be tested before persistence exists.
 */
export interface InMemoryAdmissionStoreFixture {
  readonly calls: readonly AdmissionStoreCall[]
  admit(request: TestAdmissionRequest): Promise<AdmissionDecision>
  enqueueDecision(...decisions: readonly AdmissionDecision[]): void
  setDefaultDecision(decision: AdmissionDecision | AdmissionDecisionFactory): void
  setFailure(error: unknown | null): void
  reset(): void
}

const allowedDecision = (request: TestAdmissionRequest): AdmissionAllowed => ({
  decision: 'allowed',
  policyKey: request.policy.policyKey,
  requestId: request.requestId,
  operationId: request.operationId ?? DEFAULT_TEST_OPERATION_ID,
  reservations: request.reservations ?? [],
  fencingToken: 1n,
})

export const createInMemoryAdmissionStoreFixture = (options: {
  readonly clock?: Pick<ControllableClock, 'now'>
  readonly defaultDecision?: AdmissionDecision | AdmissionDecisionFactory
} = {}): InMemoryAdmissionStoreFixture => {
  const clock = options.clock ?? createControllableClock()
  const calls: AdmissionStoreCall[] = []
  const queued: AdmissionDecision[] = []
  let failure: unknown | null = null
  let defaultDecision: AdmissionDecision | AdmissionDecisionFactory =
    options.defaultDecision ?? allowedDecision

  return {
    get calls() {
      return calls
    },
    async admit(request) {
      calls.push({ request, calledAt: clock.now() })
      if (failure !== null) throw failure
      const next = queued.shift()
      if (next) return next
      return typeof defaultDecision === 'function'
        ? defaultDecision(request, calls.length - 1)
        : defaultDecision
    },
    enqueueDecision(...decisions) {
      queued.push(...decisions)
    },
    setDefaultDecision(decision) {
      defaultDecision = decision
    },
    setFailure(error) {
      failure = error
    },
    reset() {
      calls.length = 0
      queued.length = 0
      failure = null
      defaultDecision = options.defaultDecision ?? allowedDecision
    },
  }
}

export const SIDE_EFFECT_KINDS = [
  'passwordHashes',
  'mfaCalculations',
  'sessionCreations',
  'auditWrites',
  'uploadSlots',
  'objectWrites',
  'queueMessages',
  'providerCalls',
  'exports',
  'backfills',
  'databaseWrites',
  'heavyAggregations',
] as const

export type SideEffectKind = (typeof SIDE_EFFECT_KINDS)[number]
export type SideEffectSnapshot = Readonly<Record<SideEffectKind, number>>

export interface SideEffectTracker {
  increment(kind: SideEffectKind, count?: number): void
  count(kind: SideEffectKind): number
  snapshot(): SideEffectSnapshot
  reset(): void
}

const emptySideEffects = (): Record<SideEffectKind, number> => ({
  passwordHashes: 0,
  mfaCalculations: 0,
  sessionCreations: 0,
  auditWrites: 0,
  uploadSlots: 0,
  objectWrites: 0,
  queueMessages: 0,
  providerCalls: 0,
  exports: 0,
  backfills: 0,
  databaseWrites: 0,
  heavyAggregations: 0,
})

export const createSideEffectTracker = (): SideEffectTracker => {
  let counters = emptySideEffects()
  return {
    increment(kind, count = 1) {
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new Error('INVALID_TEST_SIDE_EFFECT_COUNT')
      }
      counters[kind] += count
    },
    count: (kind) => counters[kind],
    snapshot: () => Object.freeze({ ...counters }),
    reset() {
      counters = emptySideEffects()
    },
  }
}

export interface ProviderSpyCall<TInput> {
  readonly input: TInput
  readonly calledAt: Date
}

export type ProviderSpyImplementation<TInput, TResult> = (
  input: TInput,
  callIndex: number,
) => TResult | Promise<TResult>

export interface ProviderSpy<TInput, TResult> {
  readonly calls: readonly ProviderSpyCall<TInput>[]
  invoke(input: TInput): Promise<TResult>
  setImplementation(implementation: ProviderSpyImplementation<TInput, TResult>): void
  failNext(error: unknown): void
  reset(): void
}

export const createProviderSpy = <TInput, TResult>(options: {
  readonly implementation: ProviderSpyImplementation<TInput, TResult>
  readonly clock?: Pick<ControllableClock, 'now'>
  readonly sideEffects?: SideEffectTracker
}): ProviderSpy<TInput, TResult> => {
  const clock = options.clock ?? createControllableClock()
  const calls: ProviderSpyCall<TInput>[] = []
  const failures: unknown[] = []
  const originalImplementation = options.implementation
  let implementation = originalImplementation

  return {
    get calls() {
      return calls
    },
    async invoke(input) {
      calls.push({ input, calledAt: clock.now() })
      options.sideEffects?.increment('providerCalls')
      if (failures.length > 0) throw failures.shift()
      return implementation(input, calls.length - 1)
    },
    setImplementation(next) {
      implementation = next
    },
    failNext(error) {
      failures.push(error)
    },
    reset() {
      calls.length = 0
      failures.length = 0
      implementation = originalImplementation
    },
  }
}

export const assertZeroSideEffects = (
  actual: SideEffectTracker | SideEffectSnapshot,
  message = 'Rejected or deduplicated work must create zero downstream side effects.',
): void => {
  const snapshot = 'snapshot' in actual ? actual.snapshot() : actual
  const nonZero = SIDE_EFFECT_KINDS.filter((kind) => snapshot[kind] !== 0)
    .map((kind) => `${kind}=${snapshot[kind]}`)
  assert.deepEqual(nonZero, [], `${message} Observed: ${nonZero.join(', ')}`)
}

export const createSharedAdmissionProcessFixtures = (
  processCount: number,
  options: Parameters<typeof createInMemoryAdmissionStoreFixture>[0] = {},
): readonly InMemoryAdmissionStoreFixture[] => {
  if (!Number.isSafeInteger(processCount) || processCount < 1 || processCount > 16) {
    throw new Error('INVALID_TEST_PROCESS_COUNT')
  }
  const shared = createInMemoryAdmissionStoreFixture(options)
  return Array.from({ length: processCount }, () => ({
    get calls() {
      return shared.calls
    },
    admit: (request) => shared.admit(request),
    enqueueDecision: (...decisions) => shared.enqueueDecision(...decisions),
    setDefaultDecision: (decision) => shared.setDefaultDecision(decision),
    setFailure: (error) => shared.setFailure(error),
    reset: () => shared.reset(),
  }))
}

export const assertRedacted = (
  artifact: unknown,
  prohibitedValues: readonly string[],
): void => {
  const serialized = typeof artifact === 'string' ? artifact : JSON.stringify(artifact)
  for (const value of prohibitedValues) {
    if (!value) continue
    assert.equal(
      serialized.includes(value),
      false,
      `Restricted test value was present in artifact: ${value}`,
    )
  }
}
