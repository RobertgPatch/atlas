/**
 * T040 — StaleVersionBanner appears when the API returns 409 STALE_K1_VERSION
 *         on a corrections save attempt.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildSession, MOCK_K1_ID, renderWorkspace } from './helpers/workspaceTestUtils'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('K1ReviewWorkspace — stale version banner (T040)', () => {
  it('shows stale-banner when save returns 409 STALE_K1_VERSION', async () => {
    const user = userEvent.setup()
    const session = buildSession({ version: 0 })
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json(session, { headers: { ETag: '0' } }),
      ),
      http.put('*/v1/k1-documents/*/corrections', () =>
        HttpResponse.json(
          { error: 'STALE_K1_VERSION', currentVersion: 1 },
          { status: 409 },
        ),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )

    renderWorkspace(MOCK_K1_ID)

    // Wait for session to load.
    await waitFor(() => {
      expect(screen.getByText('Box 1: Ordinary Income')).toBeInTheDocument()
    })

    // Edit a field value using userEvent to trigger React's onChange.
    const input = screen.getByTestId('field-input-box_1_ordinary_income')
    await user.type(input, 'X')

    // Click Save.
    await waitFor(() => {
      expect(screen.getByTestId('save-corrections')).not.toBeDisabled()
    })
    await user.click(screen.getByTestId('save-corrections'))

    // Stale banner should appear.
    await waitFor(() => {
      expect(screen.getByTestId('stale-banner')).toBeInTheDocument()
    })
    expect(screen.getByText(/Another reviewer made changes/)).toBeInTheDocument()
  })

  it('stale-banner includes a Reload button', async () => {
    const user = userEvent.setup()
    const session = buildSession({ version: 0 })
    const updatedSession = buildSession({ version: 1 })
    let callCount = 0
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () => {
        callCount++
        const s = callCount === 1 ? session : updatedSession
        return HttpResponse.json(s, { headers: { ETag: String(s.version) } })
      }),
      http.put('*/v1/k1-documents/*/corrections', () =>
        HttpResponse.json({ error: 'STALE_K1_VERSION', currentVersion: 1 }, { status: 409 }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )

    renderWorkspace(MOCK_K1_ID)
    await waitFor(() => screen.getByText('Box 1: Ordinary Income'))

    const input = screen.getByTestId('field-input-box_1_ordinary_income')
    await user.type(input, 'X')

    await waitFor(() => {
      expect(screen.getByTestId('save-corrections')).not.toBeDisabled()
    })
    await user.click(screen.getByTestId('save-corrections'))

    await waitFor(() => screen.getByTestId('stale-banner'))
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })
})
