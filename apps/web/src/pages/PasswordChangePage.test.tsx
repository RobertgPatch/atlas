import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authClient } from '../auth/authClient'
import { authFlowStore } from '../auth/authFlowStore'
import { PasswordChangePage } from './PasswordChangePage'

vi.mock('../auth/authClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../auth/authClient')>()
  return { authClient: { ...original.authClient, changePassword: vi.fn() } }
})

describe('PasswordChangePage', () => {
  beforeEach(() => {
    vi.mocked(authClient.changePassword).mockReset().mockResolvedValue({ status: 'PASSWORD_CHANGED' })
    authFlowStore.setPasswordChange({
      status: 'PASSWORD_CHANGE_REQUIRED',
      changeToken: 'opaque-change-token',
      expiresAt: '2026-08-30T12:10:00.000Z',
      policy: {
        minimumCharacters: 15,
        maximumCharacters: 128,
        acceptsPassphrases: true,
        compositionRequired: false,
      },
    })
  })

  it('requires matching long values and completes the one-time change', async () => {
    render(
      <MemoryRouter initialEntries={['/password/change']}>
        <Routes><Route path="/password/change" element={<PasswordChangePage />} /></Routes>
      </MemoryRouter>,
    )

    const submit = screen.getByRole('button', { name: 'Set password' })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'maple river lantern orchard' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'maple river lantern orchard' } })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    await waitFor(() => expect(authClient.changePassword).toHaveBeenCalledWith(
      'opaque-change-token',
      'maple river lantern orchard',
    ))
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument()
  })
})
