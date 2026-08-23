import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MagicPatternUnderlyingAssets } from '../components/magic-patterns/MagicPatternUnderlyingAssets'

vi.mock('../../partnerships/hooks/useAssetQueries', () => ({
  usePartnershipAssets: () => ({
    data: {
      summary: {
        assetCount: 2,
        valuedAssetCount: 2,
        totalLatestAssetFmvUsd: 2_000_000,
      },
      rows: [
        {
          id: 'asset-1',
          partnershipId: 'partnership-1',
          name: 'North Campus',
          assetCategory: 'real_estate',
          assetType: 'Commercial property',
          sourceType: 'manual',
          status: 'ACTIVE',
          displayDetail: null,
          description: null,
          notes: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          latestFmv: {
            amountUsd: 1_500_000,
            valuationDate: '2025-02-01T00:00:00.000Z',
            source: 'manual',
            confidenceLabel: null,
            createdAt: '2025-02-02T00:00:00.000Z',
          },
        },
        {
          id: 'asset-2',
          partnershipId: 'partnership-1',
          name: 'Undated Asset',
          assetCategory: 'other',
          assetType: 'Other asset',
          sourceType: 'manual',
          status: 'ACTIVE',
          displayDetail: null,
          description: null,
          notes: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          latestFmv: {
            amountUsd: 500_000,
            valuationDate: 'not-a-date',
            source: 'manual',
            confidenceLabel: null,
            createdAt: '2025-02-02T00:00:00.000Z',
          },
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../partnerships/hooks/useAssetMutations', () => ({
  useCreatePartnershipAsset: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdatePartnershipAsset: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRecordAssetFmvSnapshot: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeletePartnershipAsset: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

describe('MagicPatternUnderlyingAssets', () => {
  it('renders ISO timestamps and degrades safely for invalid valuation dates', () => {
    render(
      <MagicPatternUnderlyingAssets
        partnershipId="partnership-1"
        partnershipName="Atlas Holdings"
        canEdit={false}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Underlying asset summary' })).toBeInTheDocument()
    const summary = screen.getByRole('table', { name: 'Underlying asset summary for Atlas Holdings' })
    expect(within(summary).getByText('Latest asset FMV')).toBeInTheDocument()
    expect(within(summary).getByText('$2.0M')).toBeInTheDocument()
    expect(within(summary).getByText('Valuation coverage')).toBeInTheDocument()
    expect(within(summary).getByText('100.0%')).toBeInTheDocument()
    expect(screen.getByText('Feb 1, 2025')).toBeInTheDocument()
    expect(screen.getByText('Date unavailable')).toBeInTheDocument()
  })
})
