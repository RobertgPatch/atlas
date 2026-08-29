import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardSummaryResponse } from '../../features/dashboard/api/dashboardClient'
import { useDashboardSummary } from '../../features/dashboard/hooks/useDashboardSummary'
import { useLiquiditySummary } from '../../features/dashboard/hooks/useLiquiditySummary'
import { consolidatedHoldingsFixture } from '../../features/reports/fixtures/consolidatedHoldingsFixture'
import { MagicPatternDashboardPage } from './MagicPatternDashboardPage'

vi.mock('../../features/dashboard/hooks/useDashboardSummary', () => ({
  useDashboardSummary: vi.fn(),
}))

vi.mock('../../features/dashboard/hooks/useLiquiditySummary', () => ({
  useLiquiditySummary: vi.fn(),
}))

vi.mock('../../auth/authClient', () => ({
  authClient: {
    logout: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../auth/sessionStore', () => ({
  useSession: () => ({
    session: {
      user: { email: 'advisor@example.com' },
      role: 'User',
    },
  }),
  sessionStore: {
    setUnauthenticated: vi.fn(),
  },
}))

const summary: DashboardSummaryResponse = {
  kpis: {
    totalEntities: 3,
    totalPartnerships: 7,
    totalK1Documents: 10,
    finalizedK1Documents: 6,
    openIssuesCount: 2,
    highSeverityOpenIssues: 1,
    totalDistributionsUsd: 1_250_000,
    portfolioValueUsd: 12_500_000,
    totalCommitmentUsd: 20_000_000,
    totalPaidInUsd: 11_000_000,
    totalUnfundedUsd: 9_000_000,
    portfolioTvpi: 1.25,
  },
  assetClassSummary: [
    {
      assetClass: 'Private Equity',
      partnershipCount: 5,
      commitmentUsd: 15_000_000,
      paidInUsd: 9_000_000,
      unfundedUsd: 6_000_000,
      reportedDistributionsUsd: 1_000_000,
      residualValueUsd: 10_000_000,
      tvpi: 1.22,
    },
    {
      assetClass: 'Real Estate',
      partnershipCount: 2,
      commitmentUsd: 5_000_000,
      paidInUsd: 2_000_000,
      unfundedUsd: 3_000_000,
      reportedDistributionsUsd: 250_000,
      residualValueUsd: 2_500_000,
      tvpi: 1.38,
    },
  ],
  statusCounts: {
    UPLOADED: 1,
    PROCESSING: 1,
    NEEDS_REVIEW: 2,
    READY_FOR_APPROVAL: 0,
    FINALIZED: 6,
  },
  recentK1Activity: [
    {
      id: 'doc-1',
      entity: 'Jackson Holdings',
      partnership: 'Summit Fund III',
      taxYear: 2025,
      status: 'NEEDS_REVIEW',
      uploadedAt: '2026-08-12T16:00:00.000Z',
    },
  ],
  reviewK1s: [
    {
      id: 'doc-1',
      entity: 'Jackson Holdings',
      partnership: 'Summit Fund III',
      taxYear: 2025,
      status: 'NEEDS_REVIEW',
      uploadedAt: '2026-08-12T16:00:00.000Z',
      openIssueCount: 1,
    },
  ],
  openIssues: [
    {
      id: 'issue-1',
      entity: 'Jackson Holdings',
      partnership: 'Summit Fund III',
      message: 'Confirm the reported capital account balance.',
      severity: 'HIGH',
      createdAt: '2026-08-12T16:00:00.000Z',
      k1DocumentId: 'doc-1',
    },
  ],
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-location">{location.pathname}</output>
}

describe('MagicPatternDashboardPage', () => {
  const refetch = vi.fn()
  const refetchLiquidity = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDashboardSummary).mockReturnValue({
      data: summary,
      dataUpdatedAt: new Date('2026-08-12T17:00:00.000Z').getTime(),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useDashboardSummary>)
    vi.mocked(useLiquiditySummary).mockReturnValue({
      data: {
        ...consolidatedHoldingsFixture,
        kpis: {
          ...consolidatedHoldingsFixture.kpis,
          totalMarketValue: 3_500_000,
          totalCostBasis: 2_750_000,
          uniqueAssetCount: 6,
          selectedAccountCount: 2,
        },
      },
      dataUpdatedAt: new Date('2026-08-12T18:00:00.000Z').getTime(),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: refetchLiquidity,
    } as unknown as ReturnType<typeof useLiquiditySummary>)
  })

  it('maps the real dashboard summary into the Magic Patterns home hierarchy', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MagicPatternDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /Advisor$/ })).toBeTruthy()
    expect(screen.getByText('$16.0M')).toBeTruthy()
    expect(screen.getAllByText('$3.5M')).toHaveLength(2)
    expect(screen.getByText('Liquid investments')).toBeTruthy()
    expect(screen.getByText('2 connected accounts')).toBeTruthy()
    expect(screen.getByText('Private Equity')).toBeTruthy()
    expect(screen.getByText('Confirm the reported capital account balance.')).toBeTruthy()
    const k1Module = container.querySelector<HTMLElement>('[data-module-tone="gold"]')!
    expect(within(k1Module).getByText('In review')).toBeTruthy()
    expect(within(k1Module).getByText('2')).toBeTruthy()
    expect(screen.getByText('Review Summit Fund III K-1')).toBeTruthy()
    expect(screen.getByText('K-1 needs review')).toBeTruthy()
    expect(screen.queryByText('$284.6M')).toBeNull()
    expect(container.querySelector('[data-dashboard-theme="forest-gold"]')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-hero')).toHaveClass('bg-[#183f2e]')
    expect(container.querySelectorAll('[data-module-tone]')).toHaveLength(4)
  })

  it('opens the existing K-1 review workspace from an action item', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MagicPatternDashboardPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Confirm the reported capital account balance.'))

    expect(screen.getByTestId('current-location').textContent).toBe('/k1/doc-1/review')
  })

  it('opens a pending K-1 directly from the homepage review item', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MagicPatternDashboardPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Review Summit Fund III K-1' }))

    expect(screen.getByTestId('current-location').textContent).toBe('/k1/doc-1/review')
  })

  it('refreshes through the existing dashboard query', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MagicPatternDashboardPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(refetch).toHaveBeenCalledTimes(1)
    expect(refetchLiquidity).toHaveBeenCalledTimes(1)
  })

  it('keeps the homepage usable and marks the portfolio incomplete when liquidity fails', () => {
    vi.mocked(useLiquiditySummary).mockReturnValue({
      data: undefined,
      dataUpdatedAt: 0,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: refetchLiquidity,
    } as unknown as ReturnType<typeof useLiquiditySummary>)

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MagicPatternDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Connected holdings could not be loaded and are not included in this total.')).toBeTruthy()
    expect(screen.getByText('Unable to load current balances')).toBeTruthy()
    expect(screen.getByText('Confirm the reported capital account balance.')).toBeTruthy()
  })

  it('shows a truthful partial state while liquidity is loading', () => {
    vi.mocked(useLiquiditySummary).mockReturnValue({
      data: undefined,
      dataUpdatedAt: 0,
      isLoading: true,
      isError: false,
      isFetching: true,
      refetch: refetchLiquidity,
    } as unknown as ReturnType<typeof useLiquiditySummary>)

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MagicPatternDashboardPage />
      </MemoryRouter>,
    )

    expect(
      screen.getByText((_, element) =>
        element?.tagName === 'P' && element.textContent?.includes('Connected accounts loading') === true,
      ),
    ).toBeTruthy()
    expect(screen.getByText('Connected holdings are still loading and are not included in this total yet.')).toBeTruthy()
    expect(screen.getByText('Loading current balances')).toBeTruthy()
  })

  it('offers a direct quick action to the liquidity workspace', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MagicPatternDashboardPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Open liquidity'))

    expect(screen.getByTestId('current-location').textContent).toBe('/liquidity')
  })

  it('keeps every dashboard card, action, and K-1 destination inside the retained route contract', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MagicPatternDashboardPage />
      </MemoryRouter>,
    )

    const destinations = new Set(
      Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map((link) => link.getAttribute('href'))
        .filter((href): href is string => Boolean(href)),
    )

    for (const retained of ['/reports', '/investment-tracker', '/k1', '/entities', '/liquidity']) {
      expect(destinations).toContain(retained)
    }
    expect([...destinations].some((destination) =>
      ['/partnership-tracker', '/partnership-aggregation', '/k1-tracker', '/upload'].some(
        (retired) => destination.startsWith(retired),
      ))).toBe(false)
  })
})
