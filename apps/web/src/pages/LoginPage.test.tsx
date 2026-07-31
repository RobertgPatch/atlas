import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { authClient } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { LoginPage } from './LoginPage'

vi.mock('../auth/authClient', () => ({
  authClient: {
    login: vi.fn(),
  },
}))

const submitCredentials = () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/mfa" element={<p>MFA challenge route</p>} />
        <Route path="/mfa/setup" element={<p>MFA enrollment route</p>} />
      </Routes>
    </MemoryRouter>,
  )

  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: 'admin@example.com' },
  })
  const passwordInput = container.querySelector<HTMLInputElement>('input[type="password"]')
  expect(passwordInput).not.toBeNull()
  fireEvent.change(passwordInput!, { target: { value: 'correct-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage MFA routing', () => {
  beforeEach(() => {
    authFlowStore.clear()
    vi.mocked(authClient.login).mockReset()
  })

  it('stores an enrolled-user challenge and routes to MFA verification', async () => {
    vi.mocked(authClient.login).mockResolvedValue({
      challengeId: '00000000-0000-4000-8000-000000000001',
      status: 'MFA_REQUIRED',
    })

    submitCredentials()

    expect(await screen.findByText('MFA challenge route')).toBeInTheDocument()
    expect(authFlowStore.getChallenge()).toMatchObject({
      status: 'MFA_REQUIRED',
    })
  })

  it('stores first-use enrollment material and routes to MFA setup', async () => {
    vi.mocked(authClient.login).mockResolvedValue({
      enrollmentToken: '00000000-0000-4000-8000-000000000002',
      status: 'MFA_ENROLL_REQUIRED',
      otpAuthUrl: 'otpauth://totp/Jackson:admin@example.com',
      qrCodeDataUrl: 'data:image/png;base64,example',
      manualEntryKey: 'EXAMPLEKEY',
    })

    submitCredentials()

    expect(await screen.findByText('MFA enrollment route')).toBeInTheDocument()
    expect(authFlowStore.getEnrollment()).toMatchObject({
      status: 'MFA_ENROLL_REQUIRED',
    })
  })
})
