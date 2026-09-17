import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalBdaCredentialProvider, localBdaCredentials } from '../src/infra/aws/localBdaCredentials.js'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
const session = (key: string, expiration: Date) => JSON.stringify({
  Version: 1, AccessKeyId: key, SecretAccessKey: 'test-secret', SessionToken: 'test-token', Expiration: expiration,
})

describe('local BDA renewable AWS session', () => {
  it('shares concurrent requests and refreshes before the original session expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-16T00:00:00Z'))
    const exporter = vi.fn()
      .mockResolvedValueOnce(session('first', new Date('2026-09-16T00:15:00Z')))
      .mockResolvedValueOnce(session('second', new Date('2026-09-16T00:29:30Z')))
    const provider = createLocalBdaCredentialProvider('approved-profile', exporter)
    const values = await Promise.all([provider(), provider()])
    expect(values.map(value => value.accessKeyId)).toEqual(['first', 'first'])
    expect(exporter).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-09-16T00:14:30Z'))
    expect((await provider()).accessKeyId).toBe('second')
    expect(exporter).toHaveBeenCalledTimes(2)
  })

  it('sanitizes failed refreshes and can recover after the login is refreshed', async () => {
    const exporter = vi.fn().mockRejectedValueOnce(new Error('sensitive CLI output'))
      .mockResolvedValueOnce(session('recovered', new Date(Date.now() + 900_000)))
    const provider = createLocalBdaCredentialProvider('approved-profile', exporter)
    await expect(provider()).rejects.toMatchObject({ code: 'LOCAL_BDA_CREDENTIALS_UNAVAILABLE',
      message: 'Refresh the approved AWS login and retry.' })
    expect((await provider()).accessKeyId).toBe('recovered')
  })

  it('never activates the CLI credential provider in production', () => {
    vi.stubEnv('ATLAS_RUNTIME', 'production')
    vi.stubEnv('ATLAS_LOCAL_BDA_ENABLED', 'true')
    vi.stubEnv('ATLAS_LOCAL_BDA_AWS_PROFILE', 'approved-profile')
    expect(localBdaCredentials()).toBeUndefined()
  })
})
