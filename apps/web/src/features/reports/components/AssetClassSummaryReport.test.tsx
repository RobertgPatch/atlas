import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AssetClassSummaryResponse } from '../../../../../../../packages/types/src/reports'
import { AssetClassSummaryReport } from './AssetClassSummaryReport'

const basePayload: AssetClassSummaryResponse = {
  rows: [
    {
      id: 'asset-class-1',
      assetClass: 'Private Equity',
      partnershipCount: 3,
      originalCommitmentUsd: 6_500_000,
      calledPct: 31.5,
      unfundedUsd: 4_452_500,
      paidInUsd: 2_047_500,
      distributionsUsd: 275_000,
      residualValueUsd: 625_000,
      dpi: 0.13,
      rvpi: 0.31,
      tvpi: 0.44,
      irr: null,
    },
  ],
  totals: {
    originalCommitmentUsd: 6_500_000,
    calledPct: 31.5,
    unfundedUsd: 4_452_500,
    paidInUsd: 2_047_500,
    distributionsUsd: 275_000,
    residualValueUsd: 625_000,
    dpi: 0.13,
    rvpi: 0.31,
    tvpi: 0.44,
    irr: null,
  },
}

describe('AssetClassSummaryReport', () => {
  it('renders loading state', () => {
    render(
      <AssetClassSummaryReport
        data={undefined}
        isLoading={true}
        isError={false}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('asset-class-loading')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(
      <AssetClassSummaryReport
        data={{ ...basePayload, rows: [] }}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('asset-class-empty')).toBeInTheDocument()
    expect(screen.getByText('No asset classes match your filters')).toBeInTheDocument()
  })

  it('renders grouped rows, totals, and N/A weighted output', () => {
    render(
      <AssetClassSummaryReport
        data={basePayload}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByTestId('asset-class-table')).toBeInTheDocument()
    expect(screen.getByText('Private Equity')).toBeInTheDocument()
    expect(screen.getByText('3 partnerships')).toBeInTheDocument()
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
    expect(screen.getByTestId('asset-class-sticky-totals')).toBeInTheDocument()
  })
})
