import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecordAssetFmvDialog } from './RecordAssetFmvDialog'
import { useRecordAssetFmvSnapshot } from '../hooks/useAssetMutations'

vi.mock('../hooks/useAssetMutations', () => ({
  useRecordAssetFmvSnapshot: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

const assets = [
  {
    id: 'asset-1',
    partnershipId: 'partnership-1',
    name: 'North Campus',
    assetType: 'Real Estate',
    sourceType: 'manual' as const,
    status: 'ACTIVE',
    description: null,
    notes: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    latestFmv: null,
  },
]

describe('RecordAssetFmvDialog', () => {
  it('validates missing asset, future date, and negative amount before submit', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn()
    vi.mocked(useRecordAssetFmvSnapshot).mockReturnValue({ mutateAsync, isPending: false } as never)

    render(
      <RecordAssetFmvDialog
        open={true}
        onClose={vi.fn()}
        partnershipId="partnership-1"
        assets={assets}
        initialAssetId={null}
      />,
    )

    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    fireEvent.change(select, { target: { value: '' } })
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2099-01-01' } })
    fireEvent.change(amountInput, { target: { value: '-1' } })

    fireEvent.submit(screen.getByRole('button', { name: 'Record FMV' }).closest('form') as HTMLFormElement)

    await waitFor(() => {
      expect(screen.getByText('Choose an asset first.')).toBeInTheDocument()
      expect(screen.getByText('Valuation date cannot be in the future.')).toBeInTheDocument()
      expect(screen.getByText('FMV amount cannot be negative.')).toBeInTheDocument()
    })
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('submits a valid FMV snapshot and closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'snapshot-1' })
    vi.mocked(useRecordAssetFmvSnapshot).mockReturnValue({ mutateAsync, isPending: false } as never)

    render(
      <RecordAssetFmvDialog
        open={true}
        onClose={onClose}
        partnershipId="partnership-1"
        assets={assets}
        initialAssetId="asset-1"
      />,
    )

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement
    const [confidenceInput] = screen.getAllByRole('textbox')

    fireEvent.change(dateInput, { target: { value: '2025-02-01' } })
    fireEvent.change(amountInput, { target: { value: '250000' } })
    await user.type(confidenceInput, 'Manager estimate')

    await user.click(screen.getByRole('button', { name: 'Record FMV' }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        valuationDate: '2025-02-01',
        amountUsd: 250000,
        source: 'manual',
        confidenceLabel: 'Manager estimate',
        note: null,
      })
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})