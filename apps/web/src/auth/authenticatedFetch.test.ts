import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionResponse } from './authClient'
import { authenticatedFetch } from './authenticatedFetch'
import { sessionStore } from './sessionStore'

const session: SessionResponse = {
  user: {
    id: 'user-1',
    email: 'advisor@example.com',
    role: 'User',
    status: 'Active',
  },
  role: 'User',
  session: {
    issuedAt: '2026-08-22T12:00:00.000Z',
    idleTimeoutSeconds: 1_800,
    absoluteTimeoutSeconds: 28_800,
  },
}

describe('authenticatedFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:05:00.000Z'))
    sessionStore.setAuthenticated(session)
  })

  afterEach(() => {
    sessionStore.setUnauthenticated()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('ends the client session when an API response is unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))

    await authenticatedFetch('/v1/partnership-tracker/aggregation')

    expect(sessionStore.getSnapshot().status).toBe('unauthenticated')
    expect(sessionStore.getSnapshot().idleExpiresAt).toBeNull()
  })

  it('slides the local idle deadline after an authenticated API response', async () => {
    const previousDeadline = sessionStore.getSnapshot().idleExpiresAt
    vi.setSystemTime(new Date('2026-08-22T12:10:00.000Z'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))

    await authenticatedFetch('/v1/dashboard')

    expect(sessionStore.getSnapshot().idleExpiresAt).toBeGreaterThan(previousDeadline!)
    expect(sessionStore.getSnapshot().idleExpiresAt).toBe(
      new Date('2026-08-22T12:40:00.000Z').getTime(),
    )
  })

  it('does not treat a forbidden response as an expired login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))

    await authenticatedFetch('/v1/entities')

    expect(sessionStore.getSnapshot().status).toBe('authenticated')
  })
})
