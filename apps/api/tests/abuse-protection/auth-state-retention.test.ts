import { afterEach, describe, expect, it, vi } from 'vitest'

import { auditRepository } from '../../src/modules/audit/audit.repository.js'
import { LockoutService } from '../../src/modules/auth/lockout.service.js'
import { TEST_FINGERPRINT_KEYRING } from '../helpers/abuseProtectionTestHelpers.js'

describe('bounded fingerprinted authentication state', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses a fixed cooldown, suppresses repeats, and recovers without escalation', async () => {
    let at = new Date('2026-08-29T12:00:00.000Z')
    const service = new LockoutService({
      keyring: TEST_FINGERPRINT_KEYRING,
      threshold: 3,
      cooldownMinutes: 1,
      maximumSubjects: 4,
      now: () => at,
    })

    await expect(service.recordFailure('Owner@Example.test', 'PASSWORD')).resolves.toBeNull()
    await expect(service.recordFailure('owner@example.test', 'PASSWORD')).resolves.toBeNull()
    const cooldown = await service.recordFailure('owner@example.test', 'PASSWORD')
    expect(cooldown?.toISOString()).toBe('2026-08-29T12:01:00.000Z')
    await expect(service.recordFailure('owner@example.test', 'PASSWORD')).resolves.toEqual(cooldown)
    expect(service.stats().subjectRows).toBe(1)

    at = new Date('2026-08-29T12:01:01.000Z')
    await expect(service.getLockout('owner@example.test', 'PASSWORD')).resolves.toBeNull()
    await expect(service.recordFailure('owner@example.test', 'PASSWORD')).resolves.toBeNull()
    await service.clear('owner@example.test', 'PASSWORD')
    await expect(service.getLockout('owner@example.test', 'PASSWORD')).resolves.toBeNull()
  })

  it('bounds attacker-selected subject state and audits explicit recovery without raw identity', async () => {
    const service = new LockoutService({
      keyring: TEST_FINGERPRINT_KEYRING,
      threshold: 2,
      cooldownMinutes: 5,
      maximumSubjects: 2,
      now: () => new Date('2026-08-29T12:00:00.000Z'),
    })
    await service.recordFailure('first@example.test', 'PASSWORD')
    await service.recordFailure('second@example.test', 'PASSWORD')
    await service.recordFailure('third@example.test', 'PASSWORD')
    expect(service.stats().subjectRows).toBeLessThanOrEqual(2)

    const audit = vi.spyOn(auditRepository, 'record').mockResolvedValue()
    await service.recover({
      identifier: 'owner@example.test',
      type: 'PASSWORD',
      userId: '00000000-0000-4000-8000-000000000001',
      actorUserId: '00000000-0000-4000-8000-000000000002',
    })
    expect(audit).toHaveBeenCalledWith({
      actorUserId: '00000000-0000-4000-8000-000000000002',
      eventName: 'auth.protection.recovered',
      objectType: 'user',
      objectId: '00000000-0000-4000-8000-000000000001',
      after: { attemptType: 'PASSWORD' },
    })
    expect(JSON.stringify(audit.mock.calls)).not.toContain('owner@example.test')
  })
})
