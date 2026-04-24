import React from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { K1ReviewWorkspace } from '../../src/pages/K1ReviewWorkspace'
import type { K1ReviewSession } from '../../../../packages/types/src/review-finalization'

export const MOCK_K1_ID = 'k1-test-001'

/** Build a minimal valid K1ReviewSession fixture. Merge in overrides. */
export function buildSession(overrides: Partial<K1ReviewSession> = {}): K1ReviewSession {
  const base: K1ReviewSession = {
    k1DocumentId: MOCK_K1_ID,
    version: 0,
    status: 'NEEDS_REVIEW',
    partnership: { id: 'p1', name: 'Acme Partners LP', rawName: 'Acme Partners LP' },
    entity: { id: 'e1', name: 'Family Trust LLC' },
    taxYear: 2024,
    uploadedAt: '2024-01-01T00:00:00.000Z',
    approvedByUserId: null,
    finalizedByUserId: null,
    fields: {
      entityMapping: [
        {
          id: 'fv-entity-1',
          fieldName: 'partner_name',
          label: 'Partner Name',
          section: 'entityMapping',
          required: true,
          rawValue: 'Family Trust LLC',
          normalizedValue: 'Family Trust LLC',
          reviewerCorrectedValue: null,
          confidenceScore: 0.9,
          confidenceBand: 'high',
          sourceLocation: { page: 1, bbox: [10, 10, 200, 40] },
          reviewStatus: 'PENDING',
          isModified: false,
          linkedIssueIds: [],
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      partnershipMapping: [
        {
          id: 'fv-partner-1',
          fieldName: 'partnership_name',
          label: 'Partnership Name',
          section: 'partnershipMapping',
          required: true,
          rawValue: 'Acme Partners LP',
          normalizedValue: 'Acme Partners LP',
          reviewerCorrectedValue: null,
          confidenceScore: 0.85,
          confidenceBand: 'high',
          sourceLocation: { page: 1, bbox: [10, 50, 200, 80] },
          reviewStatus: 'PENDING',
          isModified: false,
          linkedIssueIds: [],
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      core: [
        {
          id: 'fv-core-1',
          fieldName: 'box_1_ordinary_income',
          label: 'Box 1: Ordinary Income',
          section: 'core',
          required: true,
          rawValue: '50000.00',
          normalizedValue: '50000.00',
          reviewerCorrectedValue: null,
          confidenceScore: 0.88,
          confidenceBand: 'high',
          sourceLocation: { page: 2, bbox: [50, 10, 250, 40] },
          reviewStatus: 'PENDING',
          isModified: false,
          linkedIssueIds: [],
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    },
    issues: [],
    reportedDistributionAmount: null,
    pdfUrl: '/v1/k1-documents/k1-test-001/pdf',
    canApprove: false,
    canFinalize: false,
    canEdit: true,
    ...overrides,
  }
  return base
}

/** Render K1ReviewWorkspace with full router + query client providers. */
export function renderWorkspace(
  k1Id: string = MOCK_K1_ID,
  renderOptions?: RenderOptions,
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/k1/${k1Id}/review`]}>
        <Routes>
          <Route path="/k1/:id/review" element={<K1ReviewWorkspace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
    renderOptions,
  )
  return { ...utils, qc }
}
