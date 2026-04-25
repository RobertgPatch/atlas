import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('AssetsSection record FMV affordance', () => {
  it('shows the section-level Record FMV action to admins and wires the click handler', async () => {
    const user = userEvent.setup()
    const onRecordFmv = vi.fn()

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
        onRecordFmv={onRecordFmv}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Record Asset FMV' }))
    expect(onRecordFmv).toHaveBeenCalledTimes(1)
  })

  it('keeps the section-level Record FMV action hidden for non-admin users', () => {
    render(
      <AssetsSection
        rows={[row]}
        assetCount={1}
        valuedAssetCount={0}
        totalLatestAssetFmvUsd={null}
        isLoading={false}
        isError={false}
        isAdmin={false}
        onRetry={vi.fn()}
        onSelectAsset={vi.fn()}
        onAddAsset={vi.fn()}
        onRecordFmv={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Record Asset FMV' })).not.toBeInTheDocument()
  })
})