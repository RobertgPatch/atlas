import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authClient, type SessionResponse } from '../auth/authClient'
import { sessionStore } from '../auth/sessionStore'
import { LoginPage } from './LoginPage'

vi.mock('../auth/authClient', () => ({
  authClient: {
    login: vi.fn(),
  },
}))

vi.mock('../auth/sessionStore', () => ({
  sessionStore: {
    setAuthenticated: vi.fn(),
  },
}))

const session: SessionResponse = {
  user: {
    id: 'user-1',
    email: 'advisor@example.com',
    role: 'User',
    status: 'Active',
  },
  role: 'User',
  session: {
    issuedAt: '2026-08-12T12:00:00.000Z',
    idleTimeoutSeconds: 1_800,
    absoluteTimeoutSeconds: 28_800,
  },
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-location">{location.pathname}</output>
}

const renderLogin = (magicPatternDesigns: boolean) =>
  render(
    <MemoryRouter>
      <LoginPage magicPatternDesigns={magicPatternDesigns} />
      <LocationProbe />
    </MemoryRouter>,
  )

describe('LoginPage design flag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the legacy design when magicPatternDesigns is false', () => {
    renderLogin(false)

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.queryByText('The record of truth for your family office.')).toBeNull()
  })

  it('renders the Magic Patterns design when magicPatternDesigns is true', () => {
    renderLogin(true)

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByText('The record of truth for your family office.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
  })

  it('keeps the existing authentication and session flow in the Magic Patterns design', async () => {
    vi.mocked(authClient.login).mockResolvedValue(session)
    const user = userEvent.setup()
    renderLogin(true)

    await user.type(screen.getByLabelText('Email'), 'advisor@example.com')
    await user.type(screen.getByLabelText('Password'), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(authClient.login).toHaveBeenCalledWith('advisor@example.com', 'Password123!')
    })
    expect(sessionStore.setAuthenticated).toHaveBeenCalledWith(session)
    expect(screen.getByTestId('current-location').textContent).toBe('/dashboard')
  })

  it('preserves the existing liquidity landing page when the flag is off', async () => {
    vi.mocked(authClient.login).mockResolvedValue(session)
    const user = userEvent.setup()
    renderLogin(false)

    await user.type(screen.getByPlaceholderText('you@example.com'), 'advisor@example.com')
    await user.type(document.querySelector('input[type="password"]')!, 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByTestId('current-location').textContent).toBe('/liquidity')
    })
  })

  it('uses the existing required-credentials validation before calling the API', () => {
    renderLogin(true)

    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)

    expect(screen.getByRole('alert').textContent).toContain('Please enter your email and password.')
    expect(authClient.login).not.toHaveBeenCalled()
  })
})
