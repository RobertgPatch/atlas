/**
 * T021 — K1ReviewWorkspace renders correctly across key states:
 *   loading, populated (partnership/entity visible), error.
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

describe('K1ReviewWorkspace — states (T021)', () => {
  it('shows loading indicator while fetching', () => {
    // Never resolve so the component stays in loading state.
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () => new Promise(() => {})),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders partnership and entity names when session loads', async () => {
    const session = buildSession({
      partnership: { id: 'p1', name: 'Test LP', rawName: 'Test LP' },
      entity: { id: 'e1', name: 'Test Trust' },
    })
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json(session, { headers: { ETag: '0' } }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace()
    await waitFor(() => {
      // The subtitle combines partnership · entity · year; match both names together.
      expect(screen.getByText(/Test LP.*Test Trust/)).toBeInTheDocument()
    })
  })

  it('shows error message when session fetch fails', async () => {
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json({ error: 'INTERNAL' }, { status: 500 }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace()
    await waitFor(() => {
      expect(
        screen.getByText('Failed to load review session.'),
      ).toBeInTheDocument()
    })
  })

  it('renders version badge when session is populated', async () => {
    const session = buildSession({ version: 3 })
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json(session, { headers: { ETag: '3' } }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace()
    await waitFor(() => {
      expect(screen.getByTestId('review-version')).toHaveTextContent('v3')
    })
  })

  it('renders field rows for each section when loaded', async () => {
    const session = buildSession()
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () =>
        HttpResponse.json(session, { headers: { ETag: '0' } }),
      ),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )
    renderWorkspace(MOCK_K1_ID)
    await waitFor(() => {
      // SECTION_TITLE.entityMapping is 'Entity Mapping'
      expect(screen.getByText('Entity Mapping')).toBeInTheDocument()
      expect(screen.getByText('Box 1: Ordinary Income')).toBeInTheDocument()
    })
  })
})
