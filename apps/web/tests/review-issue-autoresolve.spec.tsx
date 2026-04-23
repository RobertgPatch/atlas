/**
 * T041 — After corrections, issues linked to corrected fields are removed from
 *         the issues list (session refetch reflects fewer OPEN issues).
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildSession, MOCK_K1_ID, renderWorkspace } from './helpers/workspaceTestUtils'
import type { K1Issue } from '../../../../packages/types/src/review-finalization'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function buildIssue(overrides: Partial<K1Issue> = {}): K1Issue {
  return {
    id: 'issue-1',
    k1FieldValueId: 'fv-core-1',
    issueType: 'DATA_DISCREPANCY',
    severity: 'HIGH',
    status: 'OPEN',
    message: 'Linked field issue',
    resolvedAt: null,
    resolvedByUserId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('K1ReviewWorkspace — issue count after correction (T041)', () => {
  it('issues list shrinks after correction auto-resolves linked issue', async () => {
    const user = userEvent.setup()
    const linkedIssue = buildIssue({ id: 'issue-linked', k1FieldValueId: 'fv-core-1' })
    const unlinkedIssue = buildIssue({
      id: 'issue-unlinked',
      k1FieldValueId: null,
      message: 'Unlinked issue',
    })

    // Initial session: 2 open issues.
    const sessionWithIssues = buildSession({
      issues: [linkedIssue, unlinkedIssue],
    })

    // Session after correction: only the unlinked issue remains OPEN.
    const sessionAfterCorrection = buildSession({
      version: 1,
      issues: [
        { ...linkedIssue, status: 'RESOLVED', resolvedAt: '2024-01-01T01:00:00.000Z' },
        { ...unlinkedIssue, status: 'OPEN' },
      ],
    })

    let correctionDone = false
    server.use(
      http.get('*/v1/k1-documents/*/review-session', () => {
        const s = correctionDone ? sessionAfterCorrection : sessionWithIssues
        return HttpResponse.json(s, { headers: { ETag: String(s.version) } })
      }),
      http.put('*/v1/k1-documents/*/corrections', () => {
        correctionDone = true
        return HttpResponse.json(
          { version: 1, status: 'NEEDS_REVIEW', resolvedIssueIds: ['issue-linked'], approvalRevoked: false },
          { headers: { ETag: '1' } },
        )
      }),
      http.head('*/v1/k1-documents/*/pdf', () => HttpResponse.text('', { status: 200 })),
    )

    renderWorkspace(MOCK_K1_ID)

    // Wait for initial session load with 2 OPEN issues.
    await waitFor(() => {
      expect(screen.getByText('Linked field issue')).toBeInTheDocument()
      expect(screen.getByText('Unlinked issue')).toBeInTheDocument()
    })
    const openBadgesBefore = screen.getAllByText('OPEN')
    expect(openBadgesBefore.length).toBe(2)

    // Edit a field and save using userEvent to trigger React's onChange.
    const input = screen.getByTestId('field-input-box_1_ordinary_income')
    await user.type(input, 'X')

    await waitFor(() => {
      expect(screen.getByTestId('save-corrections')).not.toBeDisabled()
    })
    await user.click(screen.getByTestId('save-corrections'))

    // After session refetch, linked issue shows RESOLVED; unlinked shows OPEN.
    await waitFor(() => {
      const openBadgesAfter = screen.getAllByText('OPEN')
      expect(openBadgesAfter.length).toBe(1)
      expect(screen.getByText('RESOLVED')).toBeInTheDocument()
    })
  })
})
