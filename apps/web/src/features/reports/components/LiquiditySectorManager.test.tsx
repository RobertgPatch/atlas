import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiquiditySectorManager } from './LiquiditySectorManager'
import { sectorManagementStocks } from '../utils/sectorManagementStocks'
import { liquiditySectorsClient } from '../api/liquiditySectorsClient'
import { reportsClient } from '../api/reportsClient'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import { loadSectorHoldings } from '../hooks/useLiquiditySectors'
import type { SectorAssignment } from '../../../../../../packages/types/src/liquidity-sectors'

vi.mock('../api/liquiditySectorsClient', () => ({ liquiditySectorsClient: { list: vi.fn(), save: vi.fn() } }))
vi.mock('../api/reportsClient', () => ({ reportsClient: { getConsolidatedHoldings: vi.fn() } }))
const base = consolidatedHoldingsFixture.rows[0]!
const unknown = { ...base, id: 'UNKNOWN', symbol: 'UNKNOWN', description: 'Unclassified Company', sector: null, industry: null, details: [] }
const apple = { ...unknown, id: 'AAPL', symbol: 'AAPL', description: 'Apple Inc.' }
const fund = { ...unknown, id: 'FUND', symbol: 'FUND', type: 'Equity Fund' }
let stored: SectorAssignment[]
beforeEach(() => {
  vi.clearAllMocks()
  stored = []
  vi.mocked(liquiditySectorsClient.list).mockImplementation(async () => ({ items: stored }))
  vi.mocked(reportsClient.getConsolidatedHoldings).mockResolvedValue({ ...consolidatedHoldingsFixture,
    rows: [unknown, apple, fund], page: { size: 1000, offset: 0, total: 3 } })
  vi.mocked(liquiditySectorsClient.save).mockImplementation(async (symbol, body) => {
    const assignment = { symbol, sector: body.sector, version: body.expectedVersion + 1, updatedAt: '2026-09-30T10:00:00Z' }
    stored = [...stored.filter((item) => item.symbol !== symbol), assignment]
    return assignment
  })
})
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidation = vi.spyOn(client, 'invalidateQueries')
  const result = render(<QueryClientProvider client={client}><LiquiditySectorManager entityId="entity-a"/></QueryClientProvider>)
  return { ...result, client, invalidation }
}

describe('sector management', () => {
  it('starts with unclassified stocks, saves a global override, and restores automatic classification', async () => {
    const user = userEvent.setup()
    const { invalidation } = setup()
    expect(await screen.findByText('UNKNOWN')).toBeInTheDocument()
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument()
    expect(screen.queryByText('FUND')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Sector for UNKNOWN'), 'Industrials')
    await user.click(screen.getByRole('button', { name: 'Save sector for UNKNOWN' }))
    expect(await screen.findByText('UNKNOWN assigned to Industrials across all entities and custodians.')).toBeInTheDocument()
    expect(liquiditySectorsClient.save).toHaveBeenCalledWith('UNKNOWN', { sector: 'Industrials', expectedVersion: 0 })
    expect(screen.getByText('No unclassified stocks')).toBeInTheDocument()
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['reports', 'consolidated-holdings'] })
    await user.click(screen.getByRole('button', { name: /Manual assignments/ }))
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
    expect(screen.getByText('Manual')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset UNKNOWN to automatic' }))
    expect(await screen.findByText('UNKNOWN reset to automatic classification.')).toBeInTheDocument()
    expect(liquiditySectorsClient.save).toHaveBeenLastCalledWith('UNKNOWN', { sector: null, expectedVersion: 1 })
    await user.click(screen.getByRole('button', { name: /^Unclassified/ }))
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
  })

  it('searches all stocks, allows catalog overrides, and loads saved assignments on remount', async () => {
    stored = [{ symbol: 'AAPL', sector: 'Financials', version: 4, updatedAt: '2026-09-30T10:00:00Z' }]
    const user = userEvent.setup()
    const first = setup()
    await screen.findByText('UNKNOWN')
    await user.click(screen.getByRole('button', { name: /All stocks/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search stocks' }), 'apple')
    expect(screen.getByLabelText('Sector for AAPL')).toHaveValue('Financials')
    expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset AAPL to automatic' })).toHaveAttribute('title', 'Reset to automatic: Technology')
    first.unmount()
    setup()
    await screen.findByText('UNKNOWN')
    await user.click(screen.getByRole('button', { name: /Manual assignments/ }))
    expect(screen.getByLabelText('Sector for AAPL')).toHaveValue('Financials')
  })

  it('keeps a rejected edit visible and offers reload without claiming success', async () => {
    vi.mocked(liquiditySectorsClient.save).mockRejectedValue(new Error('This assignment changed in another session. Reload the list and try again.'))
    const user = userEvent.setup()
    setup()
    await screen.findByText('UNKNOWN')
    await user.selectOptions(screen.getByLabelText('Sector for UNKNOWN'), 'Energy')
    await user.click(screen.getByRole('button', { name: 'Save sector for UNKNOWN' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('another session')
    expect(screen.getByLabelText('Sector for UNKNOWN')).toHaveValue('Energy')
    expect(screen.queryByText(/assigned to Energy across/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reload list' }))
    await waitFor(() => expect(screen.getByLabelText('Sector for UNKNOWN')).toHaveValue('Unclassified'))
  })

  it('rolls custodian spelling variants of the symbol into one management row and excludes funds', () => {
    expect(sectorManagementStocks([{ ...apple, symbol: 'brk-b' }, { ...apple, symbol: 'BRK/B' }, fund], [])).toEqual([
      expect.objectContaining({ symbol: 'BRK.B', automaticSector: 'Financials' }),
    ])
  })

  it('reads subsequent report pages instead of truncating the stock list', async () => {
    vi.mocked(reportsClient.getConsolidatedHoldings)
      .mockResolvedValueOnce({ ...consolidatedHoldingsFixture, rows: [apple], page: { size: 1000, offset: 0, total: 1001 } })
      .mockResolvedValueOnce({ ...consolidatedHoldingsFixture, rows: [unknown], page: { size: 1000, offset: 1000, total: 1001 } })
    expect(await loadSectorHoldings('entity-a')).toEqual([apple, unknown])
    expect(reportsClient.getConsolidatedHoldings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, entityId: 'entity-a' }), expect.objectContaining({ pricingMode: 'saved' }))
  })
})
