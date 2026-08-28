import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { config } from '../../src/config.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'

describe('bounded authentication state and retention', () => {
  const original = { ...config.abuseProtection.authArtifacts }

  afterEach(() => {
    Object.assign(config.abuseProtection.authArtifacts, original)
    vi.useRealTimers()
  })

  it('expires MFA challenges and enrollment secrets after their finite TTLs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'))
    Object.assign(config.abuseProtection.authArtifacts, {
      challengeTtlSeconds: 2,
      enrollmentTtlSeconds: 3,
    })

    const challenge = authRepository.createMfaChallenge('ttl-user-challenge')
    const enrollment = authRepository.createMfaEnrollment('ttl-user-enrollment', 'secret')
    expect(authRepository.getChallenge(challenge.id)).toBeDefined()
    expect(authRepository.getMfaEnrollment(enrollment.id)).toBeDefined()

    vi.advanceTimersByTime(2_001)
    expect(authRepository.getChallenge(challenge.id)).toBeUndefined()
    expect(authRepository.getMfaEnrollment(enrollment.id)).toBeDefined()

    vi.advanceTimersByTime(1_000)
    expect(authRepository.getMfaEnrollment(enrollment.id)).toBeUndefined()
  })

  it('evicts oldest attacker-controlled MFA records at configured cardinality caps', () => {
    Object.assign(config.abuseProtection.authArtifacts, {
      maximumChallenges: 2,
      maximumEnrollments: 2,
    })

    const firstChallenge = authRepository.createMfaChallenge('bounded-challenge-1')
    authRepository.createMfaChallenge('bounded-challenge-2')
    authRepository.createMfaChallenge('bounded-challenge-3')
    expect(authRepository.getChallenge(firstChallenge.id)).toBeUndefined()

    const firstEnrollment = authRepository.createMfaEnrollment('bounded-enrollment-1', 'secret-1')
    authRepository.createMfaEnrollment('bounded-enrollment-2', 'secret-2')
    authRepository.createMfaEnrollment('bounded-enrollment-3', 'secret-3')
    expect(authRepository.getMfaEnrollment(firstEnrollment.id)).toBeUndefined()
  })

  it('defines an indexed, finite auth-attempt cleanup path', () => {
    const migration = readFileSync(fileURLToPath(new URL(
      '../../src/infra/db/migrations/039_abuse_protection.sql',
      import.meta.url,
    )), 'utf8')

    expect(config.abuseProtection.retention.authAttemptDays).toBeGreaterThan(0)
    expect(config.abuseProtection.retention.cleanupBatchSize).toBeGreaterThan(0)
    expect(migration).toMatch(/auth_attempts_cleanup_idx/i)
    expect(authRepository.cleanupAuthAttempts).toBeTypeOf('function')
  })
})
