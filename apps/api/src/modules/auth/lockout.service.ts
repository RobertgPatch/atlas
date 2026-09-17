import type { PoolClient } from 'pg'

import { config } from '../../config.js'
import { pool, withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import {
  fingerprintSubjectAliases,
  type FingerprintKeyring,
  type VersionedSubjectFingerprint,
} from '../abuse-protection/subjectFingerprint.js'

export type AuthAttemptType = 'PASSWORD' | 'MFA'

export interface AuthProtectionSubject {
  readonly identifier: string
  readonly userId?: string
}

export interface LockoutServiceOptions {
  readonly keyring: FingerprintKeyring
  readonly threshold: number
  readonly cooldownMinutes: number
  readonly maximumSubjects: number
  readonly now?: () => Date
}

interface MemoryAuthState {
  failures: number
  cooldownUntil: Date | null
  updatedAt: Date
}

const normalizedIdentifier = (value: string): string => value.trim().toLowerCase()

const aliasesFor = (
  keyring: FingerprintKeyring,
  identifier: string,
): readonly VersionedSubjectFingerprint[] => fingerprintSubjectAliases(keyring, {
  scope: 'account',
  value: normalizedIdentifier(identifier),
})

export class LockoutService {
  readonly #options: LockoutServiceOptions
  readonly #memory = new Map<string, MemoryAuthState>()
  readonly #now: () => Date

  constructor(options: LockoutServiceOptions) {
    if (!Number.isSafeInteger(options.threshold) || options.threshold <= 0) {
      throw new Error('AUTH_LOCKOUT_THRESHOLD_MUST_BE_POSITIVE')
    }
    if (!Number.isSafeInteger(options.cooldownMinutes) || options.cooldownMinutes <= 0) {
      throw new Error('AUTH_LOCKOUT_COOLDOWN_MUST_BE_POSITIVE')
    }
    if (!Number.isSafeInteger(options.maximumSubjects) || options.maximumSubjects <= 0) {
      throw new Error('AUTH_LOCKOUT_MAXIMUM_SUBJECTS_MUST_BE_POSITIVE')
    }
    this.#options = options
    this.#now = options.now ?? (() => new Date())
  }

  #memoryKeys(aliases: readonly VersionedSubjectFingerprint[], type: AuthAttemptType): string[] {
    return aliases.map((alias) => `${type}:${alias.digest.toString('hex')}`)
  }

  #pruneMemory(at: Date): void {
    const retentionMs = Math.max(1, this.#options.cooldownMinutes) * 60_000
    for (const [key, value] of this.#memory) {
      if (value.updatedAt.getTime() + retentionMs <= at.getTime()) this.#memory.delete(key)
    }
    while (this.#memory.size >= this.#options.maximumSubjects) {
      const oldest = this.#memory.keys().next().value as string | undefined
      if (!oldest) break
      this.#memory.delete(oldest)
    }
  }

  #readMemory(
    aliases: readonly VersionedSubjectFingerprint[],
    type: AuthAttemptType,
  ): MemoryAuthState | undefined {
    for (const key of this.#memoryKeys(aliases, type)) {
      const state = this.#memory.get(key)
      if (state) return state
    }
    return undefined
  }

  #writeMemory(
    aliases: readonly VersionedSubjectFingerprint[],
    type: AuthAttemptType,
    state: MemoryAuthState,
  ): void {
    const keys = this.#memoryKeys(aliases, type)
    for (const key of keys) this.#memory.delete(key)
    this.#memory.set(keys[0]!, state)
  }

  async #databaseLockout(
    client: PoolClient,
    subject: AuthProtectionSubject,
    type: AuthAttemptType,
    aliases: readonly VersionedSubjectFingerprint[],
  ): Promise<Date | null> {
    const result = await client.query<{ cooldown_until: Date | null; lockout_until: Date | null }>(
      `select cooldown_until, lockout_until
         from auth_attempts
        where attempt_type = $1
          and (
            subject_hash = any($2::bytea[])
            or (
              subject_hash is null
              and lower(coalesce(legacy_user_identifier, user_identifier)) = $3
            )
          )
          and coalesce(cooldown_until, lockout_until) > now()
        order by attempted_at desc
        limit 1`,
      [type, aliases.map((alias) => alias.digest), normalizedIdentifier(subject.identifier)],
    )
    return result.rows[0]?.cooldown_until ?? result.rows[0]?.lockout_until ?? null
  }

  async getLockout(
    identifier: string,
    type: AuthAttemptType,
    userId?: string,
  ): Promise<Date | null> {
    const subject = { identifier, ...(userId ? { userId } : {}) }
    const aliases = aliasesFor(this.#options.keyring, identifier)
    if (pool) {
      return withTransaction((client) => this.#databaseLockout(client, subject, type, aliases))
    }
    const at = this.#now()
    this.#pruneMemory(at)
    const cooldown = this.#readMemory(aliases, type)?.cooldownUntil
    return cooldown && cooldown > at ? new Date(cooldown) : null
  }

  async recordFailure(
    identifier: string,
    type: AuthAttemptType,
    userId?: string,
  ): Promise<Date | null> {
    const subject = { identifier, ...(userId ? { userId } : {}) }
    const aliases = aliasesFor(this.#options.keyring, identifier)
    const active = aliases[0]!
    const at = this.#now()

    if (!pool) {
      this.#pruneMemory(at)
      const existing = this.#readMemory(aliases, type)
      if (existing?.cooldownUntil && existing.cooldownUntil > at) {
        return new Date(existing.cooldownUntil)
      }
      const failures = Math.min(this.#options.threshold, (existing?.failures ?? 0) + 1)
      const cooldownUntil = failures >= this.#options.threshold
        ? new Date(at.getTime() + this.#options.cooldownMinutes * 60_000)
        : null
      this.#writeMemory(aliases, type, { failures, cooldownUntil, updatedAt: at })
      return cooldownUntil
    }

    return withTransaction(async (client) => {
      const locked = await this.#databaseLockout(client, subject, type, aliases)
      if (locked) return locked

      const recent = await client.query<{ success: boolean; outcome_class: string | null }>(
        `select success, outcome_class
           from auth_attempts
          where attempt_type = $1
            and (
              subject_hash = any($2::bytea[])
              or (
                subject_hash is null
                and lower(coalesce(legacy_user_identifier, user_identifier)) = $3
              )
            )
            and attempted_at >= now() - ($4::integer * interval '1 minute')
          order by attempted_at desc
          limit $5`,
        [
          type,
          aliases.map((alias) => alias.digest),
          normalizedIdentifier(identifier),
          this.#options.cooldownMinutes,
          Math.max(1, this.#options.threshold - 1),
        ],
      )
      let failures = 1
      for (const row of recent.rows) {
        if (row.success || row.outcome_class === 'recovered') break
        failures += 1
      }
      const cooldownUntil = failures >= this.#options.threshold
        ? new Date(at.getTime() + this.#options.cooldownMinutes * 60_000)
        : null
      await client.query(
        `insert into auth_attempts (
           user_identifier,
           attempt_type,
           attempted_at,
           success,
           lockout_until,
           subject_hash,
           subject_key_version,
           user_id,
           outcome_class,
           cooldown_until
         ) values (null, $1, $2, false, $3, $4, $5, $6, $7, $3)`,
        [
          type,
          at,
          cooldownUntil,
          active.digest,
          active.keyVersion,
          userId ?? null,
          cooldownUntil ? 'temporary_lockout' : 'credential_failure',
        ],
      )
      return cooldownUntil
    })
  }

  async clear(identifier: string, type: AuthAttemptType, userId?: string): Promise<void> {
    const aliases = aliasesFor(this.#options.keyring, identifier)
    const active = aliases[0]!
    const at = this.#now()
    if (!pool) {
      this.#writeMemory(aliases, type, { failures: 0, cooldownUntil: null, updatedAt: at })
      return
    }
    await withTransaction(async (client) => {
      await client.query(
        `insert into auth_attempts (
           user_identifier,
           attempt_type,
           attempted_at,
           success,
           subject_hash,
           subject_key_version,
           user_id,
           outcome_class,
           cooldown_until
         ) values (null, $1, $2, true, $3, $4, $5, 'recovered', null)`,
        [type, at, active.digest, active.keyVersion, userId ?? null],
      )
    })
  }

  async recover(input: {
    readonly identifier: string
    readonly type: AuthAttemptType
    readonly userId: string
    readonly actorUserId: string
  }): Promise<void> {
    await this.clear(input.identifier, input.type, input.userId)
    await auditRepository.record({
      actorUserId: input.actorUserId,
      eventName: 'auth.protection.recovered',
      objectType: 'user',
      objectId: input.userId,
      after: { attemptType: input.type },
    })
  }

  stats(): { readonly subjectRows: number } {
    return { subjectRows: this.#memory.size }
  }
}

export const lockoutService = new LockoutService({
  keyring: config.abuseProtection.hmac.keyring,
  threshold: Math.max(config.authLockoutThreshold, 1),
  cooldownMinutes: Math.max(config.authLockoutMinutes, 1),
  maximumSubjects: config.abuseProtection.localRates.partitions.authenticated,
})
