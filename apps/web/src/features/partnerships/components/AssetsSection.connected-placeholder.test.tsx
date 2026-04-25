import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssetsSection } from './AssetsSection'

const row = {
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
}

describe('AssetsSection future connected placeholder', () => {
  it('keeps the connected-account placeholder optional while leaving manual actions primary', () => {
    render(
      <AssetsSection
        rows={[row]}
        assetCount={1}
        valuedAssetCount={0}
        totalLatestAssetFmvUsd={null}
        isLoading={false}
        isError={false}
        isAdmin={true}
        onRetry={vi.fn()}
        onSelectAsset={vi.fn()}
        onAddAsset={vi.fn()}
        onRecordFmv={vi.fn()}
      />,
    )

    expect(screen.getByText('Future connected account path')).toBeInTheDocument()
    expect(screen.getByText('Link Account will plug into this same asset model later. Manual asset creation and manual FMV entry remain the primary workflow today.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Asset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record Asset FMV' })).toBeInTheDocument()
  })
})