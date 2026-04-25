import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditableCell } from './EditableCell'
import { useReportMutations } from '../hooks/useReportMutations'
import { reportsClient } from '../api/reportsClient'

vi.mock('../api/reportsClient', () => ({
  reportsClient: {
    updatePortfolioOriginalCommitment: vi.fn(),
  },
  ReportsApiError: class ReportsApiError extends Error {
    code: string
    status: number
    payload?: unknown

    constructor(code: string, status: number, payload?: unknown) {
      super(code)
      this.code = code
      this.status = status
      this.payload = payload
    }
  },
}))

const mockedClient = reportsClient as {
  updatePortfolioOriginalCommitment: ReturnType<typeof vi.fn>
}

describe('EditableCell validation', () => {
  it('shows inline errors for invalid monetary values', async () => {
    const user = userEvent.setup()

    render(
      <EditableCell
        value={100}
        editable={true}
        onCommit={vi.fn().mockResolvedValue({ status: 'ok' })}
      />,
    )

    await user.click(screen.getByTestId('editable-cell-display'))

    const input = screen.getByTestId('editable-cell-input')

    await user.clear(input)
    await user.type(input, '-1')
    await user.click(screen.getByRole('button', { name: 'Save amount' }))
    expect(screen.getByTestId('editable-cell-error')).toHaveTextContent(
      'Use numbers only (up to 2 decimals).',
    )

    await user.clear(input)
    await user.type(input, 'abc')
    await user.click(screen.getByRole('button', { name: 'Save amount' }))
    expect(screen.getByTestId('editable-cell-error')).toHaveTextContent(
      'Use numbers only (up to 2 decimals).',
    )

    await user.clear(input)
    await user.type(input, '1000000000000')
    await user.click(screen.getByRole('button', { name: 'Save amount' }))
    expect(screen.getByTestId('editable-cell-error')).toHaveTextContent(
      'Maximum is 999,999,999,999.99.',
    )
  })

  it('commits valid values and exits edit mode', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn().mockResolvedValue({ status: 'ok' })

    render(<EditableCell value={100} editable={true} onCommit={onCommit} />)

    await user.click(screen.getByTestId('editable-cell-display'))
    const input = screen.getByTestId('editable-cell-input')

    await user.clear(input)
    await user.type(input, '250.5')
    await user.click(screen.getByRole('button', { name: 'Save amount' }))

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(250.5)
    })

    expect(screen.queryByTestId('editable-cell-input')).not.toBeInTheDocument()
  })
})

function UndoHarness() {
  const {
    saveOriginalCommitment,
    undoLatestCommitmentEdit,
    undoState,
    hasUndoAvailable,
  } = useReportMutations()

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void saveOriginalCommitment({
            partnershipId: 'partnership-1',
            commitmentId: 'commitment-1',
            previousValue: 100,
            nextValue: 150,
            expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
          })
        }}
      >
        save-first
      </button>
      <button
        type="button"
        onClick={() => {
          void saveOriginalCommitment({
            partnershipId: 'partnership-1',
            commitmentId: 'commitment-1',
            previousValue: 150,
            nextValue: 200,
            expectedUpdatedAt: undoState?.expectedUpdatedAt,
          })
        }}
      >
        save-second
      </button>
      <button
        type="button"
        onClick={() => {
          void undoLatestCommitmentEdit()
        }}
      >
        undo
      </button>

      <div data-testid="undo-value">{undoState?.previousValue ?? 'none'}</div>
      <div data-testid="has-undo">{hasUndoAvailable ? 'yes' : 'no'}</div>
    </div>
  )
}

describe('useReportMutations single-step undo semantics', () => {
  it('replaces the undo target after each successful save', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    mockedClient.updatePortfolioOriginalCommitment
      .mockResolvedValueOnce({
        id: 'commitment-1',
        partnershipId: 'partnership-1',
        commitmentAmountUsd: 150,
        updatedAt: '2026-01-01T00:00:01.000Z',
      })
      .mockResolvedValueOnce({
        id: 'commitment-1',
        partnershipId: 'partnership-1',
        commitmentAmountUsd: 200,
        updatedAt: '2026-01-01T00:00:02.000Z',
      })
      .mockResolvedValueOnce({
        id: 'commitment-1',
        partnershipId: 'partnership-1',
        commitmentAmountUsd: 150,
        updatedAt: '2026-01-01T00:00:03.000Z',
      })

    render(
      <QueryClientProvider client={queryClient}>
        <UndoHarness />
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'save-first' }))
    await waitFor(() => {
      expect(screen.getByTestId('undo-value')).toHaveTextContent('100')
    })

    await user.click(screen.getByRole('button', { name: 'save-second' }))
    await waitFor(() => {
      expect(screen.getByTestId('undo-value')).toHaveTextContent('150')
    })

    await user.click(screen.getByRole('button', { name: 'undo' }))

    await waitFor(() => {
      expect(mockedClient.updatePortfolioOriginalCommitment).toHaveBeenLastCalledWith(
        expect.objectContaining({
          commitmentAmountUsd: 150,
        }),
      )
      expect(screen.getByTestId('has-undo')).toHaveTextContent('no')
    })
  })
})
