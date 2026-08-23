import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionResponse } from './authClient'
import { authClient } from './authClient'
import { SessionExpiryDialog } from './SessionExpiryDialog'
import { sessionStore } from './sessionStore'

vi.mock('./authClient', () => ({
  authClient: {
    extendSession: vi.fn(),
    logout: vi.fn(),
  },
}))

const session = (idleTimeoutSeconds: number): SessionResponse => ({
  user: {
    id: 'user-1',
    email: 'advisor@example.com',
    role: 'User',
    status: 'Active',
  },
  role: 'User',
  session: {
    issuedAt: '2026-08-22T12:00:00.000Z',
    idleTimeoutSeconds,
    absoluteTimeoutSeconds: 28_800,
  },
})

describe('SessionExpiryDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'))
    vi.mocked(authClient.logout).mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await act(async () => {
      sessionStore.setUnauthenticated()
      await vi.runOnlyPendingTimersAsync()
    })
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('shows a countdown during the final two minutes', async () => {
    sessionStore.setAuthenticated(session(120))

    await act(async () => {
      render(<SessionExpiryDialog />)
      await Promise.resolve()
    })

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your session is about to expire' })).toBeInTheDocument()
    expect(screen.getByText('2:00')).toBeInTheDocument()
  })

  it('starts a new idle period when the user stays signed in', async () => {
    sessionStore.setAuthenticated(session(120))
    const extended = session(1_800)
    vi.mocked(authClient.extendSession).mockResolvedValue(extended)
    render(<SessionExpiryDialog />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }))
    })

    expect(authClient.extendSession).toHaveBeenCalledTimes(1)
    expect(sessionStore.getSnapshot().status).toBe('authenticated')
    expect(sessionStore.getSnapshot().idleExpiresAt).toBe(
      new Date('2026-08-22T12:30:00.000Z').getTime(),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('ends the local session when the countdown reaches zero', async () => {
    sessionStore.setAuthenticated(session(2))
    render(<SessionExpiryDialog />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(sessionStore.getSnapshot().status).toBe('unauthenticated')
    expect(authClient.logout).toHaveBeenCalledTimes(1)
  })
})
