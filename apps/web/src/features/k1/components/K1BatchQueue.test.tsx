import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { K1BatchQueue } from './K1BatchQueue'

const mocks = vi.hoisted(() => ({
  batchesHook: vi.fn(), cancel: vi.fn(), remove: vi.fn(), retry: vi.fn(), refetch: vi.fn(), next: vi.fn(),
}))

const collection = {
  items: [{
    id: 'batch-1111', status: 'ACTION_REQUIRED' as const, entityScopeId: 'entity-1',
    createdAt: '2026-08-18T00:00:00Z', closedAt: null,
    counts: { total: 2, active: 0, actionRequired: 1, applied: 0, failed: 1 },
    items: [{
      id: 'item-failed', fileName: 'failed-k1.pdf', sizeBytes: 123, sha256: 'a'.repeat(64), status: 'FAILED' as const,
      upload: null, k1DocumentId: 'document-failed', error: { code: 'EXTRACTION_FAILED', message: 'The extraction attempt did not complete.', retryable: true },
      updatedAt: '2026-08-18T00:05:00Z', documentVersion: 4, activeExtractionAttemptId: null, canRetry: true, canCancel: true, canDelete: true,
      attemptHistory: [{ id: 'attempt-1', attemptNumber: 1, provider: 'AWS_BDA' as const, status: 'FAILED' as const, blueprintVersion: '1', schemaVersion: 'v1', active: false, startedAt: '2026-08-18T00:01:00Z', completedAt: '2026-08-18T00:02:00Z', error: { code: 'EXTRACTION_FAILED', message: 'The extraction attempt did not complete.', retryable: true } }],
    }, {
      id: 'item-review', fileName: 'review-k1.pdf', sizeBytes: 456, sha256: 'b'.repeat(64), status: 'NEEDS_REVIEW' as const,
      upload: null, k1DocumentId: 'document-review', error: null, updatedAt: '2026-08-18T00:06:00Z', documentVersion: 2,
      activeExtractionAttemptId: 'attempt-2', canRetry: true, canCancel: true, canDelete: false,
      attemptHistory: [{ id: 'attempt-2', attemptNumber: 1, provider: 'AWS_BDA' as const, status: 'SUCCEEDED' as const, blueprintVersion: '1', schemaVersion: 'v1', active: true, startedAt: null, completedAt: '2026-08-18T00:04:00Z', error: null }],
    }],
  }],
  counts: { total: 3, active: 1, attentionRequired: 1, completed: 1, cancelled: 0 }, nextCursor: 'next-page',
}

vi.mock('../hooks/useK1Queries', () => ({
  useK1Batches: (filters: unknown) => mocks.batchesHook(filters),
  useCancelK1BatchItem: () => ({ mutateAsync: mocks.cancel, isPending: false }),
  useDeleteK1BatchItem: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useRetryK1Extraction: () => ({ mutateAsync: mocks.retry, isPending: false }),
}))

const queryResult = () => ({
  data: { pages: [collection] }, isLoading: false, isError: false, isFetching: false,
  refetch: mocks.refetch, hasNextPage: true, fetchNextPage: mocks.next, isFetchingNextPage: false,
})

const renderQueue = () => render(<MemoryRouter initialEntries={['/k1']}><Routes>
  <Route path="/k1" element={<K1BatchQueue entityId="entity-1" />} />
  <Route path="/k1/:id/review" element={<div>Review destination</div>} />
</Routes></MemoryRouter>)

describe('K1BatchQueue durable operations', () => {
  beforeEach(() => {
    mocks.batchesHook.mockReset().mockImplementation(queryResult)
    mocks.cancel.mockReset().mockResolvedValue({})
    mocks.remove.mockReset().mockResolvedValue(undefined)
    mocks.retry.mockReset().mockResolvedValue({})
    mocks.refetch.mockReset().mockResolvedValue({})
    mocks.next.mockReset().mockResolvedValue({})
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('renders aggregate and per-file states, filters, errors, attempt history, pagination, and review navigation', async () => {
    renderQueue()
    expect(screen.getByText('3', { selector: 'b' })).toBeTruthy()
    expect(screen.getByText('failed-k1.pdf')).toBeTruthy()
    expect(screen.getAllByText(/EXTRACTION_FAILED/).length).toBeGreaterThan(0)
    const failedItem = screen.getByTestId('queue-item-item-failed')
    await userEvent.click(within(failedItem).getByText('Attempt history (1)', { selector: 'summary' }))
    expect(within(failedItem).getByText(/#1/)).toBeTruthy()
    await userEvent.click(screen.getByLabelText('Needs attention only'))
    expect(mocks.batchesHook).toHaveBeenLastCalledWith(expect.objectContaining({ attentionOnly: true }))
    await userEvent.selectOptions(screen.getByLabelText('Batch status'), 'PARTIAL_FAILURE')
    expect(mocks.batchesHook).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'PARTIAL_FAILURE' }))
    await userEvent.click(screen.getByRole('button', { name: 'Load older batches' }))
    expect(mocks.next).toHaveBeenCalled()
    const reviewItem = screen.getByTestId('queue-item-item-review')
    await userEvent.click(within(reviewItem).getByRole('button', { name: 'Open review' }))
    expect(screen.getByText('Review destination')).toBeTruthy()
  })

  it('confirms and invokes revision-bound retry, cancellation, and deletion actions', async () => {
    renderQueue()
    const failed = screen.getByTestId('queue-item-item-failed')
    await userEvent.click(within(failed).getByRole('button', { name: 'Retry' }))
    expect(mocks.retry).toHaveBeenCalledWith({ k1DocumentId: 'document-failed', expectedDocumentVersion: 4 })
    await userEvent.click(within(failed).getByRole('button', { name: 'Cancel' }))
    expect(mocks.cancel).toHaveBeenCalledWith('item-failed')
    await userEvent.click(within(failed).getByRole('button', { name: 'Delete' }))
    expect(mocks.remove).toHaveBeenCalledWith('item-failed')
    const review = screen.getByTestId('queue-item-item-review')
    await userEvent.click(within(review).getByRole('button', { name: 'Re-run extraction' }))
    expect(mocks.retry).toHaveBeenLastCalledWith({ k1DocumentId: 'document-review', expectedDocumentVersion: 2 })
    expect(window.confirm).toHaveBeenCalledTimes(4)
  })
})
