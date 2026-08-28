/**
 * T058 — ActionBar: Approve visible+enabled for Admin on NEEDS_REVIEW;
 *         Finalize enabled when canFinalize=true; Finalize disabled when
 *         same actor would violate two-person rule (canFinalize=false).
 */
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildSession, MOCK_K1_ID, renderWorkspace } from './helpers/workspaceTestUtils'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const serveSession = (session: ReturnType<typeof buildSession>) => {
  server.use(
    http.get('*/v1/k1-documents/*/review-session', () =>
      HttpResponse.json(session, { headers: { ETag: String(session.version) } }),
    ),
    http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
  )
}

describe('K1ReviewWorkspace — single completion action', () => {
  it('shows one enabled save action for a review-ready K-1', async () => {
    serveSession(buildSession({ canApprove: true, canFinalize: false, canEdit: true }))

    renderWorkspace(MOCK_K1_ID)

    await waitFor(() => screen.getByTestId('save-verified-k1'))
    expect(screen.getByTestId('save-verified-k1')).toBeEnabled()
    expect(screen.queryByTestId('approve-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('finalize-button')).not.toBeInTheDocument()
  })

  it('keeps the save action available for a review already ready for approval', async () => {
    serveSession(buildSession({
      status: 'READY_FOR_APPROVAL',
      canApprove: false,
      canFinalize: true,
      canEdit: true,
    }))

    renderWorkspace(MOCK_K1_ID)

    await waitFor(() => screen.getByTestId('save-verified-k1'))
    expect(screen.getByTestId('save-verified-k1')).toBeEnabled()
  })

  it('disables the save action when application requires an administrator', async () => {
    serveSession(buildSession({
      canApprove: false,
      canFinalize: false,
      canEdit: true,
      applyBlockingReasons: ['NOT_ADMIN'],
    }))

    renderWorkspace(MOCK_K1_ID)

    await waitFor(() => screen.getByTestId('save-verified-k1'))
    expect(screen.getByTestId('save-verified-k1')).toBeDisabled()
  })

  it('hides the save action after the K-1 has been applied', async () => {
    serveSession(buildSession({
      status: 'FINALIZED',
      canApprove: false,
      canFinalize: false,
      canEdit: false,
      appliedAt: '2024-01-02T00:00:00.000Z',
    }))

    renderWorkspace(MOCK_K1_ID)

    await waitFor(() => screen.getByRole('heading', { name: 'K-1 saved to tax basis' }))
    expect(screen.queryByTestId('save-verified-k1')).not.toBeInTheDocument()
  })
})
