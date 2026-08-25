import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityDetail } from './EntityDetail'

const remove = vi.fn()

vi.mock('../features/partnerships/hooks/useEntityQueries', () => ({
  useEntityDetail: () => ({
    data: {
      entity: {
        id: 'e-1',
        name: 'Jackson Family Trust',
        entityType: 'TRUST',
        jurisdiction: 'Nevada',
        taxId: '88-1140552',
        formedOn: '06/02/2008',
        status: 'ACTIVE',
        notes: 'Family investment vehicle.',
        registeredAgent: 'Silver State Agents',
        primaryContact: 'Robert Jackson',
      },
      partnerships: [
        {
          id: 'p-1',
          name: 'Cascade Ridge Fund I',
          entity: { id: 'e-1', name: 'Jackson Family Trust' },
          assetClass: 'Private equity',
          status: 'ACTIVE',
          latestK1Year: 2025,
          latestDistributionUsd: 125000,
          latestFmv: { amountUsd: 5000000, asOfDate: '2026-06-30', createdAt: '2026-07-01' },
        },
      ],
      rollup: {
        partnershipCount: 1,
        totalDistributionsUsd: 125000,
        totalFmvUsd: 5000000,
        totalCommitmentUsd: 6000000,
        totalPaidInUsd: 5500000,
        totalUnfundedUsd: 500000,
        latestK1Year: 2025,
      },
    },
    isLoading: false,
    isError: false,
  }),
  useEntityList: () => ({
    data: {
      items: [
        {
          id: 'e-1',
          name: 'Jackson Family Trust',
          entityType: 'TRUST',
          jurisdiction: 'Nevada',
          taxId: '88-1140552',
          formedOn: '06/02/2008',
          status: 'ACTIVE',
          notes: 'Family investment vehicle.',
          registeredAgent: 'Silver State Agents',
          primaryContact: 'Robert Jackson',
          ownerCount: 2,
          partnershipCount: 1,
          investmentCount: 1,
          holdingsValueUsd: 5470000,
          totalDistributionsUsd: 125000,
        },
      ],
    },
  }),
  useDeleteEntity: () => ({ mutateAsync: remove, isPending: false }),
}))

vi.mock('../auth/sessionStore', () => ({
  useSession: () => ({ session: { role: 'Admin', user: { email: 'admin@jackson.test' } } }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))

vi.mock('../auth/authClient', () => ({ authClient: { logout: vi.fn() } }))

function renderDetail(magicPatternDesigns = true) {
  return render(
    <MemoryRouter initialEntries={['/entities/e-1']}>
      <Routes>
        <Route path="/entities/:id" element={<EntityDetail magicPatternDesigns={magicPatternDesigns} />} />
        <Route path="/entities" element={<div>Entity directory</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Magic Patterns entity detail', () => {
  beforeEach(() => remove.mockReset())

  it('matches the prototype overview hierarchy with real entity data', () => {
    renderDetail()

    expect(screen.getByTestId('app-sidebar-panel')).toHaveAttribute(
      'data-design-variant',
      'magic-patterns',
    )
    expect(screen.getByRole('heading', { name: 'Jackson Family Trust' })).toBeTruthy()
    expect(screen.getByText('Trust · Nevada · EIN 88-1140552')).toBeTruthy()
    expect(screen.getAllByText('Holdings value')).toHaveLength(2)
    expect(screen.getByText('Partnership NAV')).toBeTruthy()
    expect(screen.getByText('Investment market value')).toBeTruthy()
    expect(screen.getByText('Ownership allocated')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Registration details' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Holdings summary' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
  })

  it('matches the prototype tabs and detail removal confirmation', () => {
    renderDetail()

    fireEvent.click(screen.getByRole('tab', { name: /Partnerships/ }))
    expect(screen.getByRole('heading', { name: 'Partnership interests' })).toBeTruthy()
    expect(screen.getByText('Cascade Ridge Fund I')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove entity' }))
    expect(
      screen.getByRole('alertdialog', { name: 'Remove Jackson Family Trust?' }),
    ).toBeTruthy()
    expect(
      screen.getByText(/along with its links to owners, partnerships, and investments/i),
    ).toBeTruthy()
  })

  it('preserves the legacy detail experience when the flag is disabled', () => {
    renderDetail(false)

    expect(screen.getByTestId('app-sidebar-panel')).toHaveAttribute('data-design-variant', 'legacy')
    expect(screen.getByRole('heading', { name: 'Jackson Family Trust' })).toBeTruthy()
    expect(screen.getAllByText('Partnerships').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Remove entity' })).toBeNull()
  })
})
