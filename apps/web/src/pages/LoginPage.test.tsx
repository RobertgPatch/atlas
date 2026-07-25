import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  setAuthenticated: vi.fn(),
}))

vi.mock('../auth/authClient', () => ({ authClient: { login: auth.login } }))
vi.mock('../auth/sessionStore', () => ({ sessionStore: { setAuthenticated: auth.setAuthenticated } }))

describe('LoginPage default destination', () => {
  beforeEach(() => {
    auth.login.mockReset().mockResolvedValue({ user: { id: 'u-1', email: 'admin@jackson.test', role: 'Admin' } })
    auth.setAuthenticated.mockReset()
  })

  it('lands a successful login on the Investment Tracker', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/private-investment-tracker" element={<h1>Investment Tracker destination</h1>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByPlaceholderText('you@example.com'), 'admin@jackson.test')
    await user.type(screen.getByPlaceholderText('••••••••'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Investment Tracker destination' })).toBeInTheDocument()
    expect(auth.login).toHaveBeenCalledWith('admin@jackson.test', 'secret')
    expect(auth.setAuthenticated).toHaveBeenCalled()
  })
})
