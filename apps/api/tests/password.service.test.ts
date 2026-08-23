import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config.js'
import { passwordService } from '../src/modules/auth/password.service.js'

describe('passwordService', () => {
  it('creates uniquely salted Argon2id hashes and verifies them', async () => {
    const first = await passwordService.hash('correct horse battery staple')
    const second = await passwordService.hash('correct horse battery staple')

    expect(first).toMatch(/^\$argon2id\$v=19\$/)
    expect(second).toMatch(/^\$argon2id\$v=19\$/)
    expect(first).not.toBe(second)
    expect(first).toContain(`m=${config.passwordHash.memoryCostKiB}`)
    expect(first).toContain(`t=${config.passwordHash.timeCost}`)
    expect(first).toContain(`p=${config.passwordHash.parallelism}`)
    await expect(passwordService.verify(first, 'correct horse battery staple')).resolves.toEqual({
      valid: true,
      needsUpgrade: false,
    })
    await expect(passwordService.verify(first, 'incorrect password')).resolves.toEqual({
      valid: false,
      needsUpgrade: false,
    })
  })

  it('recognizes a valid legacy SHA-256 hash as requiring an upgrade', async () => {
    const legacy = createHash('sha256').update('Password123!').digest('hex')

    await expect(passwordService.verify(legacy, 'Password123!')).resolves.toEqual({
      valid: true,
      needsUpgrade: true,
    })
    await expect(passwordService.verify(legacy, 'not-the-password')).resolves.toEqual({
      valid: false,
      needsUpgrade: false,
    })
  })

  it('rejects unsupported or malformed password records', async () => {
    await expect(passwordService.verify('not-a-password-hash', 'Password123!')).resolves.toEqual({
      valid: false,
      needsUpgrade: false,
    })
  })
})
