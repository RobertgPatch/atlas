import type React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddAssetDialog } from './AddAssetDialog'
import { useCreatePartnershipAsset } from '../hooks/useAssetMutations'

vi.mock('../hooks/useAssetMutations', () => ({
  useCreatePartnershipAsset: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

function getTextInputs() {
  return screen.getAllByRole('textbox')
}

describe('AddAssetDialog', () => {
  it('validates required fields before submit', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn()
    vi.mocked(useCreatePartnershipAsset).mockReturnValue({ mutateAsync, isPending: false } as never)

    render(<AddAssetDialog open={true} onClose={vi.fn()} partnershipId="partnership-1" />)

    await user.click(screen.getByRole('button', { name: 'Create Asset' }))

    expect(screen.getByText('Asset name is required.')).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('validates the optional initial valuation fields', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn()
    vi.mocked(useCreatePartnershipAsset).mockReturnValue({ mutateAsync, isPending: false } as never)

    render(<AddAssetDialog open={true} onClose={vi.fn()} partnershipId="partnership-1" />)

    const [nameInput] = getTextInputs()
    await user.type(nameInput, 'North Campus')
    await user.click(screen.getByRole('checkbox'))

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2099-01-01' } })
    fireEvent.change(amountInput, { target: { value: '-5' } })

    fireEvent.submit(document.getElementById('add-asset-form') as HTMLFormElement)

    await waitFor(() => {
      expect(screen.getByText('Valuation date cannot be in the future.')).toBeInTheDocument()
      expect(screen.getByText('FMV amount cannot be negative.')).toBeInTheDocument()
    })
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('renders duplicate validation returned by the mutation', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue({ kind: 'duplicate-asset', error: 'DUPLICATE_PARTNERSHIP_ASSET' })
    vi.mocked(useCreatePartnershipAsset).mockReturnValue({ mutateAsync, isPending: false } as never)

    render(<AddAssetDialog open={true} onClose={vi.fn()} partnershipId="partnership-1" />)

    const [nameInput] = getTextInputs()
    await user.type(nameInput, 'North Campus')
    await user.click(screen.getByRole('button', { name: 'Create Asset' }))

    expect(await screen.findByText('An asset with that name and type already exists under this partnership.')).toBeInTheDocument()
  })

  it('submits a valid payload and resets local state on success', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const mutateAsync = vi.fn().mockResolvedValue({
      asset: { id: 'asset-1' },
      latestFmv: null,
    })
    vi.mocked(useCreatePartnershipAsset).mockReturnValue({ mutateAsync, isPending: false } as never)

    render(<AddAssetDialog open={true} onClose={onClose} partnershipId="partnership-1" />)

    const [nameInput, descriptionInput, notesInput] = getTextInputs()
    await user.type(nameInput, 'North Campus')
    await user.type(descriptionInput, 'Office tower holding')
    await user.type(notesInput, 'Priority asset')
    await user.click(screen.getByRole('checkbox'))

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2025-02-01' } })
    fireEvent.change(amountInput, { target: { value: '1250000' } })

    await user.click(screen.getByRole('button', { name: 'Create Asset' }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        name: 'North Campus',
        assetType: 'Private Equity',
        description: 'Office tower holding',
        notes: 'Priority asset',
        initialValuation: {
          valuationDate: '2025-02-01',
          amountUsd: 1250000,
          source: 'manual',
          confidenceLabel: null,
          note: null,
        },
      })
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(nameInput).toHaveValue('')
    expect(document.querySelector('input[type="number"]')).not.toBeInTheDocument()
  })
})