import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AssetsSection } from './AssetsSection'

function buildAsset(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}

function renderAssetsSection(overrides: Partial<React.ComponentProps<typeof AssetsSection>> = {}) {
  const props: React.ComponentProps<typeof AssetsSection> = {
    rows: [],
    assetCount: 0,
    valuedAssetCount: 0,
    totalLatestAssetFmvUsd: null,
    isLoading: false,
    isError: false,
    isAdmin: false,
    onRetry: vi.fn(),
    onSelectAsset: vi.fn(),
    onAddAsset: vi.fn(),
    onRecordFmv: vi.fn(),
    ...overrides,
  }

  return {
    ...render(<AssetsSection {...props} />),
    props,
  }
}

describe('AssetsSection', () => {
  it('renders the loading state while preserving the section summary shell', () => {
    const { container } = renderAssetsSection({ isLoading: true })

    expect(screen.getByText('Assets')).toBeInTheDocument()
    expect(screen.getByText('Total Latest Asset FMV')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders the empty state with the admin call to action', async () => {
    const user = userEvent.setup()
    const { props } = renderAssetsSection({ isAdmin: true })

    expect(screen.getByText('No assets recorded')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add Asset' })).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'Add Asset' })[0])
    expect(props.onAddAsset).toHaveBeenCalledTimes(1)
  })

  it('renders the localized error state and retries from the asset section only', async () => {
    const user = userEvent.setup()
    const { props } = renderAssetsSection({ isError: true })

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders populated rows with manual, imported, and plaid source states plus mixed FMV coverage', async () => {
    const user = userEvent.setup()
    const latestDate = new Date('2025-02-01').toLocaleDateString()
    const { props } = renderAssetsSection({
      rows: [
        buildAsset({
          id: 'asset-manual',
          latestFmv: {
            amountUsd: 1200000,
            valuationDate: '2025-02-01',
            source: 'manual',
            confidenceLabel: null,
            createdAt: '2025-02-02T00:00:00.000Z',
          },
        }),
        buildAsset({ id: 'asset-imported', name: 'Bridge Loan', assetType: 'Credit', sourceType: 'imported' }),
        buildAsset({
          id: 'asset-plaid',
          name: 'Operating Cash',
          assetType: 'Cash',
          sourceType: 'plaid',
          latestFmv: {
            amountUsd: 250000,
            valuationDate: '2025-02-01',
            source: 'plaid',
            confidenceLabel: 'Bank balance',
            createdAt: '2025-02-03T00:00:00.000Z',
          },
        }),
      ],
      assetCount: 3,
      valuedAssetCount: 2,
      totalLatestAssetFmvUsd: 1450000,
    })

    expect(screen.getByText('$1,450,000')).toBeInTheDocument()
    expect(screen.getByText('Some assets have no FMV yet. Unvalued assets are excluded from the asset rollup until a snapshot is recorded.')).toBeInTheDocument()
    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.getByText('Imported')).toBeInTheDocument()
    expect(screen.getByText('Linked')).toBeInTheDocument()
    expect(screen.getByText('No FMV yet')).toBeInTheDocument()
    expect(screen.getAllByText(latestDate).length).toBeGreaterThanOrEqual(2)

    await user.click(screen.getByText('North Campus'))
    expect(props.onSelectAsset).toHaveBeenCalledWith('asset-manual')
  })

  it('keeps write actions hidden for non-admin viewers', () => {
    renderAssetsSection({
      rows: [buildAsset()],
      assetCount: 1,
      valuedAssetCount: 0,
    })

    expect(screen.queryByRole('button', { name: 'Add Asset' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record Asset FMV' })).not.toBeInTheDocument()
  })
})