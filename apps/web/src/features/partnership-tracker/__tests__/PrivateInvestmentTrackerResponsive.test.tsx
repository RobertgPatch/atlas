import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivateInvestmentTrackerPageContent } from '../components/private-investment/PrivateInvestmentTrackerPageContent'
import { privateInvestmentResponseFixture } from './fixtures'

const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePrivateInvestmentTracker: () => state.current,
  usePrivateInvestmentPdfExport: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}))

describe('Private Investment Tracker responsive containment', () => {
  beforeEach(() => {
    state.current = {
      data: privateInvestmentResponseFixture,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
      isError: false,
      refetch: vi.fn(),
    }
  })

  it.each([1440, 1024, 768, 390])('keeps wide data inside local table scrollers at %ipx', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    const { container, unmount } = render(
      <MemoryRouter><PrivateInvestmentTrackerPageContent /></MemoryRouter>,
    )
    expect(container.querySelectorAll('.overflow-x-auto')).toHaveLength(1)
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(container.querySelectorAll('.sticky').length).toBeGreaterThan(1)
    unmount()
  })

  it('keeps the summary table locally scrollable at 200% browser zoom', () => {
    document.documentElement.style.zoom = '2'
    const { container, unmount } = render(
      <MemoryRouter><PrivateInvestmentTrackerPageContent /></MemoryRouter>,
    )
    expect(container.querySelectorAll('.overflow-x-auto')).toHaveLength(1)
    unmount()
    document.documentElement.style.zoom = ''
  })
})
