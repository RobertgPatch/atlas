import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { k1EntryDetailFixture } from '../../partnership-tracker/__tests__/fixtures'
import type { K1TrackerYearDetail } from '../../../../../../packages/types/src/k1-tracker'
import { K1PartnershipIntakeRail } from './K1PartnershipIntakeRail'

const mocks = vi.hoisted(() => ({ batches: vi.fn(), refetch: vi.fn() }))

vi.mock('../hooks/useK1Queries', () => ({
  useK1Batches: (filters: unknown) => mocks.batches(filters),
}))

const queryResult = {
  data: {
    pages: [{
      items: [{
        id: 'batch-1',
        status: 'ACTION_REQUIRED',
        entityScopeId: 'entity-1',
        createdAt: '2026-08-18T00:00:00Z',
        closedAt: null,
        counts: { total: 1, active: 0, actionRequired: 1, applied: 0, failed: 0 },
        items: [{
          id: 'item-1', fileName: 'redwood-2024.pdf', sizeBytes: 512, sha256: 'a'.repeat(64), status: 'NEEDS_REVIEW',
          upload: null, k1DocumentId: 'document-review', error: null, updatedAt: '2026-08-18T00:04:00Z',
          documentVersion: 2, activeExtractionAttemptId: 'attempt-1', canRetry: false, canCancel: true, canDelete: false,
          partnershipId: null, taxYear: 2024,
          partnershipCandidates: [{ id: 'p-1', maskedLabel: 'Redwood LP · **-***1234', score: 1, decision: 'PROPOSED' }],
          attemptHistory: [],
        }],
      }],
      counts: { total: 2, active: 1, attentionRequired: 1, completed: 0, cancelled: 0 },
      nextCursor: null,
    }],
  },
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: mocks.refetch,
}

const renderRail = (onUpload = vi.fn(), detail: K1TrackerYearDetail = k1EntryDetailFixture) => render(<MemoryRouter initialEntries={['/partnerships/p-1']}><Routes>
  <Route path="/partnerships/:id" element={<K1PartnershipIntakeRail detail={detail} entityId="entity-1" entityName="Jackson Family Trust" partnershipId="p-1" partnershipName="Redwood LP" canUpload onUpload={onUpload} />} />
  <Route path="/k1/:id/review" element={<div>Source review destination</div>} />
  <Route path="/k1" element={<div>Full processing queue</div>} />
</Routes></MemoryRouter>)

describe('K1PartnershipIntakeRail', () => {
  beforeEach(() => {
    mocks.batches.mockReset().mockReturnValue(queryResult)
    mocks.refetch.mockReset().mockResolvedValue({})
  })

  it('shows applied provenance, open checks, entity-scoped durable activity, and upload initiation', async () => {
    const onUpload = vi.fn()
    renderRail(onUpload)

    expect(mocks.batches).toHaveBeenCalledWith({ entityId: 'entity-1', limit: 3 })
    expect(screen.getByText(/1 reviewed PDF is linked/)).toBeInTheDocument()
    expect(screen.getByText('redwood-2024.pdf')).toBeInTheDocument()
    expect(screen.getByText('Review needed')).toBeInTheDocument()
    expect(screen.getByText(/For Redwood LP · Jackson Family Trust/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review K-1 now' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'K-1 document workflow' })).not.toHaveClass(
      '2xl:sticky',
      '2xl:top-4',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Upload K-1 PDFs' }))
    expect(onUpload).toHaveBeenCalledOnce()
  })

  it('keeps a candidate-matched document reachable before a tracker year exists', async () => {
    render(<MemoryRouter initialEntries={['/partnerships/p-1']}><Routes>
      <Route path="/partnerships/:id" element={<K1PartnershipIntakeRail entityId="entity-1" entityName="Jackson Family Trust" partnershipId="p-1" partnershipName="Redwood LP" canUpload onUpload={vi.fn()} />} />
      <Route path="/k1/:id/review" element={<div>Source review destination</div>} />
    </Routes></MemoryRouter>)

    expect(screen.getByText(/is waiting for review for Redwood LP/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Review K-1 now' }))
    expect(screen.getByText('Source review destination')).toBeInTheDocument()
  })

  it('opens the applied source document in the real review route', async () => {
    renderRail()
    await userEvent.click(screen.getAllByRole('button', { name: 'Open source review' })[0])
    expect(screen.getByText('Source review destination')).toBeInTheDocument()
  })

  it('does not present an applied document as still requiring review', () => {
    const appliedResult = {
      ...JSON.parse(JSON.stringify(queryResult)) as typeof queryResult,
      refetch: mocks.refetch,
    }
    ;(appliedResult.data.pages[0].items[0].items[0] as { status: string }).status = 'APPLIED'
    mocks.batches.mockReturnValue(appliedResult)

    renderRail()

    expect(screen.getByText('Applied')).toBeInTheDocument()
    expect(screen.queryByText('K-1 review required')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review K-1 now' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review K-1 redwood-2024.pdf' })).toBeInTheDocument()
  })

  it('separates required inputs from calculated warnings and gives direct field actions', () => {
    const detail: K1TrackerYearDetail = {
      ...k1EntryDetailFixture,
      sourceConflicts: [],
      calculation: {
        ...k1EntryDetailFixture.calculation,
        checks: [
          { key: 'required-source-data', status: 'INCOMPLETE', actual: null, expected: null, difference: null, tolerance: null, message: 'Enter opening outside basis.' },
          { key: 'section-l-ending', status: 'INCOMPLETE', actual: null, expected: '0.00', difference: null, tolerance: '1.00', message: 'Section L ending capital is incomplete.' },
          { key: 'book-tax-unexplained', status: 'INCOMPLETE', actual: null, expected: '0.00', difference: null, tolerance: '1.00', message: 'Book capital is incomplete.' },
          { key: 'negative-before-limit-basis', status: 'WARNING', actual: '-4903568.00', expected: null, difference: null, tolerance: null, message: 'Basis is limited to zero.' },
          { key: 'suspended-losses', status: 'WARNING', actual: '409811.00', expected: null, difference: null, tolerance: null, message: 'Losses remain suspended.' },
          { key: 'taxable-excess-distribution', status: 'WARNING', actual: '4493757.00', expected: null, difference: null, tolerance: null, message: 'Distributions exceed basis.' },
        ],
      },
    }

    renderRail(vi.fn(), detail)

    expect(screen.getByRole('heading', { name: 'Reconciliation checklist' })).toBeInTheDocument()
    expect(screen.getByText(/3 required items/)).toBeInTheDocument()
    expect(screen.getByText(/3 calculated warnings/)).toBeInTheDocument()
    expect(screen.getByText('Opening outside basis is missing')).toBeInTheDocument()
    expect(screen.getByText('Section L ending capital is missing')).toBeInTheDocument()
    expect(screen.getByText('Ending book capital is missing')).toBeInTheDocument()
    expect(screen.getByText('Potential taxable excess distribution')).toBeInTheDocument()
    const checklist = screen.getByRole('heading', { name: 'Reconciliation checklist' }).closest('section')!
    expect(within(checklist).getAllByText('Required')).toHaveLength(3)
    expect(within(checklist).getAllByText('Review')).toHaveLength(3)
    expect(screen.getByRole('button', { name: /Complete book-tax workpaper/ })).toBeInTheDocument()
  })
})
