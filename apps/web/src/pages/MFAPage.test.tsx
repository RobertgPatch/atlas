import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authClient, type SessionResponse } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { sessionStore } from '../auth/sessionStore'
import { MFAPage } from './MFAPage'

vi.mock('../auth/authClient', () => ({
  authClient: {
    verifyMfa: vi.fn(),
  },
}))

vi.mock('../auth/sessionStore', () => ({
  sessionStore: {
    setAuthenticated: vi.fn(),
  },
}))

const session: SessionResponse = {
  user: { id: 'user-1', email: 'advisor@example.com', role: 'User', status: 'Active' },
  role: 'User',
  session: {
    issuedAt: '2026-08-25T12:00:00.000Z',
    idleTimeoutSeconds: 1_800,
    absoluteTimeoutSeconds: 28_800,
  },
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-location">{location.pathname}</output>
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/mfa']}>
    <Routes>
      <Route path="/" element={<div>Login route</div>} />
      <Route path="/dashboard" element={<div>Dashboard route</div>} />
      <Route path="/mfa" element={<MFAPage />} />
    </Routes>
    <LocationProbe />
  </MemoryRouter>,
)

const submitCode = () => {
  const inputs = screen.getAllByRole('textbox')
  fireEvent.change(inputs[0]!, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
}

describe('MFAPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authFlowStore.clear()
  })

  it('redirects to login when the challenge token is missing', async () => {
    renderPage()

    expect(await screen.findByText('Login route')).toBeInTheDocument()
    expect(screen.getByTestId('current-location')).toHaveTextContent('/')
  })

  it('verifies TOTP and routes to Dashboard', async () => {
    authFlowStore.setChallenge({ status: 'MFA_REQUIRED', challengeId: 'challenge-token' })
    vi.mocked(authClient.verifyMfa).mockResolvedValue(session)
    renderPage()

    submitCode()

    await waitFor(() => {
      expect(screen.getByTestId('current-location')).toHaveTextContent('/dashboard')
    })
    expect(authClient.verifyMfa).toHaveBeenCalledWith('challenge-token', '123456')
    expect(sessionStore.setAuthenticated).toHaveBeenCalledWith(session)
    expect(authFlowStore.getChallenge()).toBeNull()
  })

  it('keeps the flow available after an invalid code', async () => {
    const challenge = { status: 'MFA_REQUIRED' as const, challengeId: 'challenge-token' }
    authFlowStore.setChallenge(challenge)
    vi.mocked(authClient.verifyMfa).mockRejectedValue({ error: 'SIGN_IN_FAILED' })
    renderPage()

    submitCode()

    expect(await screen.findByText('Invalid verification code. Please try again.')).toBeInTheDocument()
    expect(authFlowStore.getChallenge()).toEqual(challenge)
    expect(sessionStore.setAuthenticated).not.toHaveBeenCalled()
  })
})
