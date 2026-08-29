import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authClient,
  type MfaChallengeResponse,
  type MfaEnrollmentResponse,
  type SessionResponse,
} from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { sessionStore } from '../auth/sessionStore'
import { LoginPage } from './LoginPage'

vi.mock('../auth/authClient', () => ({ authClient: { login: vi.fn() } }))
vi.mock('../auth/sessionStore', () => ({ sessionStore: { setAuthenticated: vi.fn() } }))
vi.mock('../auth/authFlowStore', () => ({
  authFlowStore: {
    setChallenge: vi.fn(),
    setEnrollment: vi.fn(),
    clear: vi.fn(),
  },
}))

const session: SessionResponse = {
  user: { id: 'user-1', email: 'advisor@example.com', role: 'User', status: 'Active' },
  role: 'User',
  session: {
    issuedAt: '2026-08-12T12:00:00.000Z',
    idleTimeoutSeconds: 1_800,
    absoluteTimeoutSeconds: 28_800,
  },
}

const enrollment: MfaEnrollmentResponse = {
  status: 'MFA_ENROLL_REQUIRED',
  enrollmentToken: 'enrollment-token',
  otpAuthUrl: 'otpauth://totp/Jackson:advisor@example.com',
  qrCodeDataUrl: 'data:image/png;base64,abc',
  manualEntryKey: 'MANUALKEY',
}

const challenge: MfaChallengeResponse = {
  status: 'MFA_REQUIRED',
  challengeId: 'challenge-token',
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-location">{location.pathname}</output>
}

const renderLogin = () => render(
  <MemoryRouter>
    <LoginPage />
    <LocationProbe />
  </MemoryRouter>,
)

const signIn = async () => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'advisor@example.com')
  await user.type(screen.getByLabelText('Password'), 'Password123!')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage current flow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders only the current login design', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByText('The record of truth for your family office.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
  })

  it('authenticates a direct session and always opens Dashboard', async () => {
    vi.mocked(authClient.login).mockResolvedValue(session)
    renderLogin()
    await signIn()

    await waitFor(() => expect(authClient.login).toHaveBeenCalledWith('advisor@example.com', 'Password123!'))
    expect(sessionStore.setAuthenticated).toHaveBeenCalledWith(session)
    expect(screen.getByTestId('current-location')).toHaveTextContent('/dashboard')
  })

  it('stores enrollment state and opens MFA setup without authenticating', async () => {
    vi.mocked(authClient.login).mockResolvedValue(enrollment)
    renderLogin()
    await signIn()

    await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent('/mfa/setup'))
    expect(authFlowStore.setEnrollment).toHaveBeenCalledWith(enrollment)
    expect(sessionStore.setAuthenticated).not.toHaveBeenCalled()
  })

  it('stores challenge state and opens MFA verification without authenticating', async () => {
    vi.mocked(authClient.login).mockResolvedValue(challenge)
    renderLogin()
    await signIn()

    await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent('/mfa'))
    expect(authFlowStore.setChallenge).toHaveBeenCalledWith(challenge)
    expect(sessionStore.setAuthenticated).not.toHaveBeenCalled()
  })

  it('validates required credentials before calling the API', () => {
    renderLogin()
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your email and password.')
    expect(authClient.login).not.toHaveBeenCalled()
  })
})
