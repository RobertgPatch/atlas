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

describe('K1ReviewWorkspace — approve/finalize action bar (T058)', () => {
  it('Approve button is enabled when canApprove=true', async () => {
    const session = buildSession({ canApprove: true, canFinalize: false, canEdit: true })
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json(session, { headers: { ETag: '0' } }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace(MOCK_K1_ID)
    await waitFor(() => screen.getByTestId('approve-button'))
    expect(screen.getByTestId('approve-button')).not.toBeDisabled()
    expect(screen.getByTestId('finalize-button')).toBeDisabled()
  })

  it('Finalize button is enabled when canFinalize=true', async () => {
    const session = buildSession({
      status: 'READY_FOR_APPROVAL',
      canApprove: false,
      canFinalize: true,
      canEdit: true,
    })
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json(session, { headers: { ETag: '1' } }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace(MOCK_K1_ID)
    await waitFor(() => screen.getByTestId('finalize-button'))
    expect(screen.getByTestId('finalize-button')).not.toBeDisabled()
    expect(screen.getByTestId('approve-button')).toBeDisabled()
  })

  it('Finalize disabled when canFinalize=false (same actor two-person block)', async () => {
    const session = buildSession({
      status: 'READY_FOR_APPROVAL',
      canApprove: false,
      canFinalize: false,
      canEdit: false,
    })
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json(session, { headers: { ETag: '1' } }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace(MOCK_K1_ID)
    await waitFor(() => screen.getByTestId('finalize-button'))
    expect(screen.getByTestId('finalize-button')).toBeDisabled()
    expect(screen.getByTestId('approve-button')).toBeDisabled()
  })

  it('both buttons disabled when K-1 is FINALIZED', async () => {
    const session = buildSession({
      status: 'FINALIZED',
      canApprove: false,
      canFinalize: false,
      canEdit: false,
    })
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json(session, { headers: { ETag: '5' } }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace(MOCK_K1_ID)
    await waitFor(() => screen.getByTestId('finalize-button'))
    expect(screen.getByTestId('approve-button')).toBeDisabled()
    expect(screen.getByTestId('finalize-button')).toBeDisabled()
  })
})
