import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authClient, type MfaEnrollmentResponse, type SessionResponse } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { sessionStore } from '../auth/sessionStore'
import { MFASetupPage } from './MFASetupPage'

vi.mock('../auth/authClient', () => ({
  authClient: {
    completeMfaEnrollment: vi.fn(),
  },
}))

vi.mock('../auth/sessionStore', () => ({
  sessionStore: {
    setAuthenticated: vi.fn(),
  },
}))

const enrollment: MfaEnrollmentResponse = {
  status: 'MFA_ENROLL_REQUIRED',
  enrollmentToken: 'enrollment-token',
  otpAuthUrl: 'otpauth://totp/Jackson:advisor@example.com',
  qrCodeDataUrl: 'data:image/png;base64,abc',
  manualEntryKey: 'MANUALKEY',
}

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
  <MemoryRouter initialEntries={['/mfa/setup']}>
    <Routes>
      <Route path="/" element={<div>Login route</div>} />
      <Route path="/dashboard" element={<div>Dashboard route</div>} />
      <Route path="/mfa/setup" element={<MFASetupPage />} />
    </Routes>
    <LocationProbe />
  </MemoryRouter>,
)

describe('MFASetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authFlowStore.clear()
  })

  it('redirects to login when the enrollment token is missing', async () => {
    renderPage()

    expect(await screen.findByText('Login route')).toBeInTheDocument()
    expect(screen.getByTestId('current-location')).toHaveTextContent('/')
  })

  it('renders enrollment and routes to Dashboard', async () => {
    authFlowStore.setEnrollment(enrollment)
    vi.mocked(authClient.completeMfaEnrollment).mockResolvedValue(session)
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByAltText('Scan this QR code with your authenticator app')).toHaveAttribute(
      'src',
      enrollment.qrCodeDataUrl,
    )
    expect(screen.getByText(enrollment.manualEntryKey)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Activate MFA' }))

    await waitFor(() => {
      expect(screen.getByTestId('current-location')).toHaveTextContent('/dashboard')
    })
    expect(authClient.completeMfaEnrollment).toHaveBeenCalledWith('enrollment-token', '123456')
    expect(sessionStore.setAuthenticated).toHaveBeenCalledWith(session)
    expect(authFlowStore.getEnrollment()).toBeNull()
  })

  it('keeps the flow available after an invalid code', async () => {
    authFlowStore.setEnrollment(enrollment)
    vi.mocked(authClient.completeMfaEnrollment).mockRejectedValue({ error: 'SIGN_IN_FAILED' })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Verification code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Activate MFA' }))

    expect(await screen.findByText(/verification code was invalid/i)).toBeInTheDocument()
    expect(authFlowStore.getEnrollment()).toEqual(enrollment)
    expect(sessionStore.setAuthenticated).not.toHaveBeenCalled()
  })
})
