import { createHmac, randomUUID } from 'node:crypto'

import { config } from '../../config.js'
import {
  postgresAdmissionDatabase,
  type AdmissionDatabase,
  type AdmissionSqlClient,
} from './admission.repository.js'
import {
  fingerprintCanonicalRequest,
  type CanonicalRequestFingerprintInput,
  type FingerprintKey,
} from './subjectFingerprint.js'
import { OPERATION_STATES, type OperationState } from './protection.types.js'

export const UNKNOWN_PROVIDER_OUTCOME_FAILURE_CODE = 'PROVIDER_OUTCOME_UNKNOWN'
export const DEFAULT_IDEMPOTENCY_RETENTION_DAYS = 90
export const DEFAULT_MAXIMUM_CLIENT_KEY_CHARACTERS = 128

const HASH_BYTES = 32
const MAX_TEXT_CHARACTERS = 512
const MAX_RESERVED_UNITS_BYTES = 4_096
const MAX_RESERVED_UNIT_NAMES = 32
const MAX_RESERVED_UNIT_NAME_CHARACTERS = 64
const MILLISECONDS_PER_DAY = 86_400_000

export interface IdempotentOperation {
  readonly operationId: string
  readonly workloadKey: string
  readonly principalHash: Buffer
  readonly requestFingerprint: Buffer
  readonly clientKeyHash: Buffer | null
  readonly state: OperationState
  readonly reservedUnits: Readonly<Record<string, number>>
  readonly providerToken: string
  readonly providerReference: string | null
  readonly resultReference: string | null
  readonly requestId: string
  readonly failureCode: string | null
  readonly reconciliationRequired: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly expiresAt: Date
}

export interface ReserveIdempotentOperationInput {
  readonly workloadKey: string
  /** Current 32-byte server HMAC for the authenticated principal. */
  readonly principalHash: Uint8Array
  /** Prior-key hashes permit reuse while the server HMAC key is rotating. */
  readonly previousPrincipalHashes?: readonly Uint8Array[]
  readonly canonicalRequest: CanonicalRequestFingerprintInput
  readonly clientKey?: string | null
  readonly reservedUnits?: Readonly<Record<string, number>>
  readonly requestId: string
  readonly now?: Date
  readonly expiresAt?: Date
}

export interface IdempotencyReservation {
  readonly disposition: 'created' | 'reused'
  readonly operation: IdempotentOperation
}

export interface IdempotencyServiceOptions {
  readonly activeKey: FingerprintKey
  readonly previousKeys?: readonly FingerprintKey[]
  readonly maximumClientKeyCharacters?: number
  readonly retentionDays?: number
}

export interface OperationTransitionInput {
  readonly operationId: string
  readonly now?: Date
  readonly providerReference?: string | null
}

export interface SuccessfulOperationTransitionInput extends OperationTransitionInput {
  readonly resultReference: string
}

export interface FailedOperationTransitionInput extends OperationTransitionInput {
  readonly failureCode: string
}

interface StoredReservationInput {
  readonly operation: Omit<IdempotentOperation, 'reconciliationRequired'>
  readonly principalHashCandidates: readonly Buffer[]
  readonly requestFingerprintCandidates: readonly Buffer[]
  readonly clientKeyHashCandidates: readonly Buffer[]
}

interface StoredTransitionInput {
  readonly operationId: string
  readonly expectedStates: readonly OperationState[]
  readonly nextState: OperationState
  readonly providerReference: string | null
  readonly resultReference: string | null
  readonly failureCode: string | null
  readonly now: Date
  readonly requireNoSideEffect: boolean
}

export interface IdempotencyStore {
  reserve(input: StoredReservationInput): Promise<IdempotencyReservation>
  get(operationId: string): Promise<IdempotentOperation | null>
  transition(input: StoredTransitionInput): Promise<IdempotentOperation>
  reserveInTransaction?(
    client: AdmissionSqlClient,
    input: StoredReservationInput,
  ): Promise<IdempotencyReservation>
  transitionInTransaction?(
    client: AdmissionSqlClient,
    input: StoredTransitionInput,
  ): Promise<IdempotentOperation>
}

export class IdempotencyInputError extends Error {
  readonly code = 'INVALID_IDEMPOTENCY_INPUT'

  constructor(message: string) {
    super(message)
    this.name = 'IdempotencyInputError'
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_CONFLICT'

  constructor(
    readonly operationId: string,
    readonly operationState: OperationState,
  ) {
    super('The idempotency key is already bound to a different canonical request.')
    this.name = 'IdempotencyConflictError'
  }
}

export class IdempotencyOperationNotFoundError extends Error {
  readonly code = 'IDEMPOTENT_OPERATION_NOT_FOUND'

  constructor(readonly operationId: string) {
    super(`Idempotent operation ${operationId} does not exist.`)
    this.name = 'IdempotencyOperationNotFoundError'
  }
}

export class IdempotencyStateTransitionError extends Error {
  readonly code = 'INVALID_IDEMPOTENCY_STATE_TRANSITION'

  constructor(
    readonly operationId: string,
    readonly currentState: OperationState,
    readonly requestedState: OperationState,
  ) {
    super(`Operation ${operationId} cannot transition from ${currentState} to ${requestedState}.`)
    this.name = 'IdempotencyStateTransitionError'
  }
}

export class IdempotencyStoreUnavailableError extends Error {
  readonly code = 'IDEMPOTENCY_STORE_UNAVAILABLE'

  constructor(readonly cause: unknown) {
    super('The durable idempotency store is unavailable.')
    this.name = 'IdempotencyStoreUnavailableError'
  }
}

const isExpectedError = (error: unknown): boolean =>
  error instanceof IdempotencyConflictError
  || error instanceof IdempotencyOperationNotFoundError
  || error instanceof IdempotencyStateTransitionError
  || error instanceof IdempotencyStoreUnavailableError

const characterLength = (value: string): number => Array.from(value).length

const boundedText = (value: string, name: string, maximum = MAX_TEXT_CHARACTERS): string => {
  const normalized = value.trim()
  if (!normalized || characterLength(normalized) > maximum) {
    throw new IdempotencyInputError(`${name} must contain between 1 and ${maximum} characters.`)
  }
  return normalized
}

const validDate = (value: Date, name: string): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new IdempotencyInputError(`${name} must be a finite date.`)
  }
  return new Date(value)
}

const hashBuffer = (value: Uint8Array, name: string): Buffer => {
  const hash = Buffer.from(value)
  if (hash.byteLength !== HASH_BYTES) {
    throw new IdempotencyInputError(`${name} must be a 32-byte server HMAC.`)
  }
  return hash
}

const keyBuffer = (key: FingerprintKey): Buffer => {
  const value = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key)
  if (value.byteLength < HASH_BYTES) {
    throw new IdempotencyInputError('Idempotency HMAC keys must contain at least 32 bytes.')
  }
  return value
}

const keyedDigest = (key: FingerprintKey, domain: string, value: string): Buffer =>
  createHmac('sha256', keyBuffer(key))
    .update(`atlas-abuse-protection:v1\n${domain}\n`, 'utf8')
    .update(value, 'utf8')
    .digest()

const uniqueHashes = (values: readonly Buffer[]): Buffer[] => {
  const seen = new Set<string>()
  const result: Buffer[] = []
  for (const value of values) {
    const key = value.toString('hex')
    if (!seen.has(key)) {
      seen.add(key)
      result.push(Buffer.from(value))
    }
  }
  return result
}

const includesHash = (values: readonly Buffer[], candidate: Uint8Array): boolean =>
  values.some((value) => value.equals(candidate))

const normalizeReservedUnits = (
  input: Readonly<Record<string, number>> | undefined,
): Readonly<Record<string, number>> => {
  const entries = Object.entries(input ?? {}).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length > MAX_RESERVED_UNIT_NAMES) {
    throw new IdempotencyInputError(`reservedUnits supports at most ${MAX_RESERVED_UNIT_NAMES} names.`)
  }

  const result: Record<string, number> = {}
  for (const [name, value] of entries) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || name.length > MAX_RESERVED_UNIT_NAME_CHARACTERS) {
      throw new IdempotencyInputError(`Invalid reserved unit name: ${name}.`)
    }
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new IdempotencyInputError(`Reserved unit ${name} must be a positive safe integer.`)
    }
    result[name] = value
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_RESERVED_UNITS_BYTES) {
    throw new IdempotencyInputError('reservedUnits exceeds the 4096-byte persistence limit.')
  }
  return Object.freeze(result)
}

const validOperationState = (value: unknown): OperationState => {
  if (!(OPERATION_STATES as readonly unknown[]).includes(value)) {
    throw new Error('INVALID_STORED_OPERATION_STATE')
  }
  return value as OperationState
}

const withReconciliationMarker = (
  operation: Omit<IdempotentOperation, 'reconciliationRequired'>,
): IdempotentOperation => ({
  ...operation,
  reconciliationRequired:
    (operation.state === 'queued' || operation.state === 'running')
    && operation.failureCode === UNKNOWN_PROVIDER_OUTCOME_FAILURE_CODE,
})

const cloneOperation = (operation: IdempotentOperation): IdempotentOperation => ({
  ...operation,
  principalHash: Buffer.from(operation.principalHash),
  requestFingerprint: Buffer.from(operation.requestFingerprint),
  clientKeyHash: operation.clientKeyHash ? Buffer.from(operation.clientKeyHash) : null,
  reservedUnits: Object.freeze({ ...operation.reservedUnits }),
  createdAt: new Date(operation.createdAt),
  updatedAt: new Date(operation.updatedAt),
  expiresAt: new Date(operation.expiresAt),
})

interface IdempotentOperationRow extends Record<string, unknown> {
  operation_id: string
  workload_key: string
  principal_hash: Buffer
  request_fingerprint: Buffer
  client_key_hash: Buffer | null
  state: string
  reserved_units: Record<string, number>
  provider_token: string | null
  provider_reference: string | null
  result_reference: string | null
  request_id: string
  failure_code: string | null
  created_at: Date | string
  updated_at: Date | string
  expires_at: Date | string
}

const rowToOperation = (row: IdempotentOperationRow): IdempotentOperation => {
  if (!row.provider_token) throw new Error('IDEMPOTENT_OPERATION_PROVIDER_TOKEN_MISSING')
  return withReconciliationMarker({
    operationId: row.operation_id,
    workloadKey: row.workload_key,
    principalHash: hashBuffer(row.principal_hash, 'stored principal hash'),
    requestFingerprint: hashBuffer(row.request_fingerprint, 'stored request fingerprint'),
    clientKeyHash: row.client_key_hash
      ? hashBuffer(row.client_key_hash, 'stored client key hash')
      : null,
    state: validOperationState(row.state),
    reservedUnits: normalizeReservedUnits(row.reserved_units),
    providerToken: row.provider_token,
    providerReference: row.provider_reference,
    resultReference: row.result_reference,
    requestId: row.request_id,
    failureCode: row.failure_code,
    createdAt: validDate(new Date(row.created_at), 'stored createdAt'),
    updatedAt: validDate(new Date(row.updated_at), 'stored updatedAt'),
    expiresAt: validDate(new Date(row.expires_at), 'stored expiresAt'),
  })
}

const selectByClientKey = async (
  client: AdmissionSqlClient,
  input: StoredReservationInput,
): Promise<IdempotentOperation | null> => {
  if (input.clientKeyHashCandidates.length === 0) return null
  const result = await client.query<IdempotentOperationRow>(
    `select *
       from idempotent_operations
      where workload_key = $1
        and principal_hash = any($2::bytea[])
        and client_key_hash = any($3::bytea[])
      order by created_at, operation_id
      limit 1
      for update`,
    [input.operation.workloadKey, input.principalHashCandidates, input.clientKeyHashCandidates],
  )
  return result.rows[0] ? rowToOperation(result.rows[0]) : null
}

const selectByFingerprint = async (
  client: AdmissionSqlClient,
  input: StoredReservationInput,
): Promise<IdempotentOperation | null> => {
  const result = await client.query<IdempotentOperationRow>(
    `select *
       from idempotent_operations
      where workload_key = $1
        and principal_hash = any($2::bytea[])
        and request_fingerprint = any($3::bytea[])
      order by created_at, operation_id
      limit 1
      for update`,
    [
      input.operation.workloadKey,
      input.principalHashCandidates,
      input.requestFingerprintCandidates,
    ],
  )
  return result.rows[0] ? rowToOperation(result.rows[0]) : null
}

const resolveExisting = async (
  client: AdmissionSqlClient,
  input: StoredReservationInput,
): Promise<IdempotencyReservation | null> => {
  const byClientKey = await selectByClientKey(client, input)
  if (byClientKey) {
    if (!includesHash(input.requestFingerprintCandidates, byClientKey.requestFingerprint)) {
      throw new IdempotencyConflictError(byClientKey.operationId, byClientKey.state)
    }
    return { disposition: 'reused', operation: byClientKey }
  }

  const byFingerprint = await selectByFingerprint(client, input)
  return byFingerprint ? { disposition: 'reused', operation: byFingerprint } : null
}

const insertOperation = async (
  client: AdmissionSqlClient,
  input: StoredReservationInput,
): Promise<IdempotentOperation | null> => {
  const operation = input.operation
  const result = await client.query<IdempotentOperationRow>(
    `insert into idempotent_operations (
       operation_id, workload_key, principal_hash, request_fingerprint,
       client_key_hash, state, reserved_units, provider_token, request_id,
       created_at, updated_at, expires_at
     ) values ($1, $2, $3, $4, $5, 'reserved', $6::jsonb, $7, $8, $9, $9, $10)
     on conflict do nothing
     returning *`,
    [
      operation.operationId,
      operation.workloadKey,
      operation.principalHash,
      operation.requestFingerprint,
      operation.clientKeyHash,
      JSON.stringify(operation.reservedUnits),
      operation.providerToken,
      operation.requestId,
      operation.createdAt,
      operation.expiresAt,
    ],
  )
  return result.rows[0] ? rowToOperation(result.rows[0]) : null
}

const reserveWithinTransaction = async (
  client: AdmissionSqlClient,
  input: StoredReservationInput,
): Promise<IdempotencyReservation> => {
  const existing = await resolveExisting(client, input)
  if (existing) return existing

  const inserted = await insertOperation(client, input)
  if (inserted) return { disposition: 'created', operation: inserted }

  const concurrent = await resolveExisting(client, input)
  if (concurrent) return concurrent
  throw new Error('IDEMPOTENCY_UNIQUE_CONFLICT_COULD_NOT_BE_RESOLVED')
}

const transitionWithinTransaction = async (
  client: AdmissionSqlClient,
  input: StoredTransitionInput,
): Promise<IdempotentOperation> => {
  const result = await client.query<IdempotentOperationRow>(
    `update idempotent_operations
        set state = $3,
            provider_reference = coalesce($4, provider_reference),
            result_reference = $5,
            failure_code = $6,
            updated_at = $7
      where operation_id = $1
        and state = any($2::text[])
        and ($8::boolean = false or (provider_reference is null and result_reference is null))
      returning *`,
    [
      input.operationId,
      input.expectedStates,
      input.nextState,
      input.providerReference,
      input.resultReference,
      input.failureCode,
      input.now,
      input.requireNoSideEffect,
    ],
  )
  if (result.rows[0]) return rowToOperation(result.rows[0])

  const existing = await client.query<IdempotentOperationRow>(
    'select * from idempotent_operations where operation_id = $1 for update',
    [input.operationId],
  )
  const row = existing.rows[0]
  if (!row) throw new IdempotencyOperationNotFoundError(input.operationId)
  const operation = rowToOperation(row)
  throw new IdempotencyStateTransitionError(
    operation.operationId,
    operation.state,
    input.nextState,
  )
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly database: AdmissionDatabase = postgresAdmissionDatabase) {}

  async reserveInTransaction(
    client: AdmissionSqlClient,
    input: StoredReservationInput,
  ): Promise<IdempotencyReservation> {
    try {
      return await reserveWithinTransaction(client, input)
    } catch (error) {
      if (isExpectedError(error)) throw error
      throw new IdempotencyStoreUnavailableError(error)
    }
  }

  async reserve(input: StoredReservationInput): Promise<IdempotencyReservation> {
    try {
      return await this.database.transaction((client) => reserveWithinTransaction(client, input))
    } catch (error) {
      if (isExpectedError(error)) throw error
      throw new IdempotencyStoreUnavailableError(error)
    }
  }

  async get(operationId: string): Promise<IdempotentOperation | null> {
    try {
      return await this.database.transaction(async (client) => {
        const result = await client.query<IdempotentOperationRow>(
          'select * from idempotent_operations where operation_id = $1',
          [operationId],
        )
        return result.rows[0] ? rowToOperation(result.rows[0]) : null
      })
    } catch (error) {
      if (isExpectedError(error)) throw error
      throw new IdempotencyStoreUnavailableError(error)
    }
  }

  async transitionInTransaction(
    client: AdmissionSqlClient,
    input: StoredTransitionInput,
  ): Promise<IdempotentOperation> {
    try {
      return await transitionWithinTransaction(client, input)
    } catch (error) {
      if (isExpectedError(error)) throw error
      throw new IdempotencyStoreUnavailableError(error)
    }
  }

  async transition(input: StoredTransitionInput): Promise<IdempotentOperation> {
    try {
      return await this.database.transaction((client) => transitionWithinTransaction(client, input))
    } catch (error) {
      if (isExpectedError(error)) throw error
      throw new IdempotencyStoreUnavailableError(error)
    }
  }
}

const operationKey = (workloadKey: string, principalHash: Uint8Array, fingerprint: Uint8Array): string =>
  `${workloadKey}:${Buffer.from(principalHash).toString('hex')}:${Buffer.from(fingerprint).toString('hex')}`

const clientKey = (workloadKey: string, principalHash: Uint8Array, hash: Uint8Array): string =>
  `${workloadKey}:${Buffer.from(principalHash).toString('hex')}:${Buffer.from(hash).toString('hex')}`

/** Deterministic process-local seam for unit tests; never an exact multi-task production store. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly operations = new Map<string, IdempotentOperation>()
  private readonly fingerprints = new Map<string, string>()
  private readonly clientKeys = new Map<string, string>()

  async reserve(input: StoredReservationInput): Promise<IdempotencyReservation> {
    for (const principalHash of input.principalHashCandidates) {
      for (const candidate of input.clientKeyHashCandidates) {
        const operationId = this.clientKeys.get(clientKey(input.operation.workloadKey, principalHash, candidate))
        if (!operationId) continue
        const operation = this.operations.get(operationId)!
        if (!includesHash(input.requestFingerprintCandidates, operation.requestFingerprint)) {
          throw new IdempotencyConflictError(operation.operationId, operation.state)
        }
        return { disposition: 'reused', operation: cloneOperation(operation) }
      }
    }

    for (const principalHash of input.principalHashCandidates) {
      for (const fingerprint of input.requestFingerprintCandidates) {
        const operationId = this.fingerprints.get(
          operationKey(input.operation.workloadKey, principalHash, fingerprint),
        )
        if (operationId) {
          return { disposition: 'reused', operation: cloneOperation(this.operations.get(operationId)!) }
        }
      }
    }

    const operation = withReconciliationMarker(input.operation)
    this.operations.set(operation.operationId, operation)
    this.fingerprints.set(
      operationKey(operation.workloadKey, operation.principalHash, operation.requestFingerprint),
      operation.operationId,
    )
    if (operation.clientKeyHash) {
      this.clientKeys.set(
        clientKey(operation.workloadKey, operation.principalHash, operation.clientKeyHash),
        operation.operationId,
      )
    }
    return { disposition: 'created', operation: cloneOperation(operation) }
  }

  async get(operationId: string): Promise<IdempotentOperation | null> {
    const operation = this.operations.get(operationId)
    return operation ? cloneOperation(operation) : null
  }

  async transition(input: StoredTransitionInput): Promise<IdempotentOperation> {
    const current = this.operations.get(input.operationId)
    if (!current) throw new IdempotencyOperationNotFoundError(input.operationId)
    if (
      !input.expectedStates.includes(current.state)
      || (input.requireNoSideEffect && (current.providerReference || current.resultReference))
    ) {
      throw new IdempotencyStateTransitionError(current.operationId, current.state, input.nextState)
    }
    const operation = withReconciliationMarker({
      ...current,
      state: input.nextState,
      providerReference: input.providerReference ?? current.providerReference,
      resultReference: input.resultReference,
      failureCode: input.failureCode,
      updatedAt: new Date(input.now),
    })
    this.operations.set(operation.operationId, operation)
    return cloneOperation(operation)
  }
}

export class IdempotencyService {
  private readonly activeKey: FingerprintKey
  private readonly previousKeys: readonly FingerprintKey[]
  private readonly maximumClientKeyCharacters: number
  private readonly retentionDays: number

  constructor(
    private readonly store: IdempotencyStore,
    options: IdempotencyServiceOptions,
  ) {
    keyBuffer(options.activeKey)
    for (const key of options.previousKeys ?? []) keyBuffer(key)
    this.activeKey = options.activeKey
    this.previousKeys = [...(options.previousKeys ?? [])]
    this.maximumClientKeyCharacters = options.maximumClientKeyCharacters
      ?? DEFAULT_MAXIMUM_CLIENT_KEY_CHARACTERS
    this.retentionDays = options.retentionDays ?? DEFAULT_IDEMPOTENCY_RETENTION_DAYS
    if (!Number.isInteger(this.maximumClientKeyCharacters) || this.maximumClientKeyCharacters <= 0) {
      throw new IdempotencyInputError('maximumClientKeyCharacters must be a positive integer.')
    }
    if (!Number.isInteger(this.retentionDays) || this.retentionDays <= 0 || this.retentionDays > 365) {
      throw new IdempotencyInputError('retentionDays must be an integer between 1 and 365.')
    }
  }

  private prepareReservation(input: ReserveIdempotentOperationInput): StoredReservationInput {
    const now = validDate(input.now ?? new Date(), 'now')
    const expiresAt = validDate(
      input.expiresAt ?? new Date(now.getTime() + this.retentionDays * MILLISECONDS_PER_DAY),
      'expiresAt',
    )
    if (expiresAt.getTime() <= now.getTime()) {
      throw new IdempotencyInputError('expiresAt must be later than the reservation time.')
    }
    const workloadKey = boundedText(input.workloadKey, 'workloadKey', 128)
    const requestId = boundedText(input.requestId, 'requestId', 128)
    const principalHash = hashBuffer(input.principalHash, 'principalHash')
    const principalHashCandidates = uniqueHashes([
      principalHash,
      ...(input.previousPrincipalHashes ?? []).map((hash, index) =>
        hashBuffer(hash, `previousPrincipalHashes[${index}]`)),
    ])
    const fingerprintKeys = [this.activeKey, ...this.previousKeys]
    const requestFingerprintCandidates = uniqueHashes(fingerprintKeys.map((key) =>
      fingerprintCanonicalRequest(key, input.canonicalRequest)))

    let normalizedClientKey: string | null = null
    if (input.clientKey !== undefined && input.clientKey !== null) {
      if (
        input.clientKey.length === 0
        || characterLength(input.clientKey) > this.maximumClientKeyCharacters
        || Buffer.byteLength(input.clientKey, 'utf8') > this.maximumClientKeyCharacters * 4
      ) {
        throw new IdempotencyInputError(
          `clientKey must contain between 1 and ${this.maximumClientKeyCharacters} characters.`,
        )
      }
      normalizedClientKey = input.clientKey
    }
    const clientKeyHashCandidates = normalizedClientKey === null
      ? []
      : uniqueHashes(fingerprintKeys.map((key) => keyedDigest(key, 'client-idempotency-key', normalizedClientKey!)))

    const operationId = randomUUID()
    const operation = {
      operationId,
      workloadKey,
      principalHash,
      requestFingerprint: requestFingerprintCandidates[0]!,
      clientKeyHash: clientKeyHashCandidates[0] ?? null,
      state: 'reserved' as const,
      reservedUnits: normalizeReservedUnits(input.reservedUnits),
      providerToken: `atlas-v1-${keyedDigest(this.activeKey, 'provider-token', operationId).toString('base64url')}`,
      providerReference: null,
      resultReference: null,
      requestId,
      failureCode: null,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    }
    return {
      operation,
      principalHashCandidates,
      requestFingerprintCandidates,
      clientKeyHashCandidates,
    }
  }

  async reserve(input: ReserveIdempotentOperationInput): Promise<IdempotencyReservation> {
    return this.store.reserve(this.prepareReservation(input))
  }

  /** Used by the atomic admission service so quota, lease, and operation commit together. */
  async reserveInTransaction(
    client: AdmissionSqlClient,
    input: ReserveIdempotentOperationInput,
  ): Promise<IdempotencyReservation> {
    if (!this.store.reserveInTransaction) {
      throw new IdempotencyInputError('The configured idempotency store has no transaction seam.')
    }
    return this.store.reserveInTransaction(client, this.prepareReservation(input))
  }

  async get(operationId: string): Promise<IdempotentOperation | null> {
    return this.store.get(boundedText(operationId, 'operationId', 128))
  }

  private transition(
    input: OperationTransitionInput,
    expectedStates: readonly OperationState[],
    nextState: OperationState,
    resultReference: string | null,
    failureCode: string | null,
    requireNoSideEffect = false,
  ): Promise<IdempotentOperation> {
    return this.store.transition({
      operationId: boundedText(input.operationId, 'operationId', 128),
      expectedStates,
      nextState,
      providerReference: input.providerReference === undefined || input.providerReference === null
        ? null
        : boundedText(input.providerReference, 'providerReference'),
      resultReference,
      failureCode,
      now: validDate(input.now ?? new Date(), 'transition time'),
      requireNoSideEffect,
    })
  }

  markQueued(input: OperationTransitionInput): Promise<IdempotentOperation> {
    return this.transition(input, ['reserved'], 'queued', null, null)
  }

  markRunning(input: OperationTransitionInput): Promise<IdempotentOperation> {
    return this.transition(input, ['queued'], 'running', null, null)
  }

  markSucceeded(input: SuccessfulOperationTransitionInput): Promise<IdempotentOperation> {
    return this.transition(
      input,
      ['running'],
      'succeeded',
      boundedText(input.resultReference, 'resultReference'),
      null,
    )
  }

  markFailed(input: FailedOperationTransitionInput): Promise<IdempotentOperation> {
    const failureCode = boundedText(input.failureCode, 'failureCode', 128)
    if (!/^[A-Z0-9][A-Z0-9_.:-]*$/.test(failureCode)) {
      throw new IdempotencyInputError('failureCode must be a bounded machine-readable code.')
    }
    if (failureCode === UNKNOWN_PROVIDER_OUTCOME_FAILURE_CODE) {
      throw new IdempotencyInputError('Use markProviderOutcomeUnknown for an unknown provider outcome.')
    }
    return this.transition(input, ['running'], 'failed', null, failureCode)
  }

  markCancelled(input: OperationTransitionInput): Promise<IdempotentOperation> {
    return this.transition(input, ['queued'], 'cancelled', null, null)
  }

  markExpired(input: OperationTransitionInput): Promise<IdempotentOperation> {
    return this.transition(input, ['reserved'], 'expired', null, null, true)
  }

  markProviderOutcomeUnknown(input: OperationTransitionInput): Promise<IdempotentOperation> {
    return this.transition(
      input,
      ['queued', 'running'],
      'running',
      null,
      UNKNOWN_PROVIDER_OUTCOME_FAILURE_CODE,
    )
  }
}

export const idempotencyService = new IdempotencyService(
  new PostgresIdempotencyStore(),
  {
    activeKey: config.abuseProtection.hmac.activeKey,
    previousKeys: config.abuseProtection.hmac.previousKeys,
    maximumClientKeyCharacters:
      config.abuseProtection.payloadLimits.maximumIdempotencyKeyCharacters,
    retentionDays: config.abuseProtection.retention.idempotencyDays,
  },
)
