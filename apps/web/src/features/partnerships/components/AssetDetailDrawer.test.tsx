import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetDetailDrawer } from './AssetDetailDrawer'
import { useAssetDetail, useAssetFmvHistory } from '../hooks/useAssetQueries'

vi.mock('../hooks/useAssetQueries', () => ({
  useAssetDetail: vi.fn(),
  useAssetFmvHistory: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('AssetDetailDrawer', () => {
  it('renders a localized detail error without collapsing the parent screen and retries the detail query', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()

    vi.mocked(useAssetDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never)
    vi.mocked(useAssetFmvHistory).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)

    render(
      <div>
        <p>Parent partnership detail</p>
        <AssetDetailDrawer
          open={true}
          onClose={vi.fn()}
          partnershipId="partnership-1"
          assetId="asset-1"
          isAdmin={false}
          onRecordFmv={vi.fn()}
        />
      </div>,
    )

    expect(screen.getByText('Parent partnership detail')).toBeInTheDocument()
    expect(screen.getByText('Could not load asset detail')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('keeps asset metadata visible when only the history request fails and retries just the history fetch', async () => {
    const user = userEvent.setup()
    const historyRefetch = vi.fn()

    vi.mocked(useAssetDetail).mockReturnValue({
      data: {
        asset: {
          id: 'asset-1',
          partnershipId: 'partnership-1',
          name: 'North Campus',
          assetType: 'Real Estate',
          sourceType: 'manual',
          status: 'ACTIVE',
          description: null,
          notes: 'Core campus position',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        latestFmv: {
          id: 'snapshot-1',
          assetId: 'asset-1',
          valuationDate: '2025-02-01',
          amountUsd: 1200000,
          source: 'manual',
          confidenceLabel: null,
          note: null,
          recordedByUserId: 'user-1',
          recordedByEmail: 'admin@atlas.com',
          createdAt: '2025-02-02T00:00:00.000Z',
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(useAssetFmvHistory).mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch: historyRefetch,
    } as never)

    render(
      <AssetDetailDrawer
        open={true}
        onClose={vi.fn()}
        partnershipId="partnership-1"
        assetId="asset-1"
        isAdmin={true}
        onRecordFmv={vi.fn()}
      />,
    )

    expect(screen.getByText('North Campus')).toBeInTheDocument()
    expect(screen.getByText('Core campus position')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record FMV' })).toBeInTheDocument()
    expect(screen.getByText('Valuation History')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(historyRefetch).toHaveBeenCalledTimes(1)
  })
})