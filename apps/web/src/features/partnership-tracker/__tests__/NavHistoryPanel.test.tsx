import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NavHistoryPanel } from '../components/NavHistoryPanel'
import { navFixtures } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({ usePartnershipTrackerActions: () => ({ deleteNav: { mutateAsync: vi.fn(), isPending: false }, createNav: { mutateAsync: vi.fn(), isPending: false }, updateNav: { mutateAsync: vi.fn(), isPending: false } }) }))

describe('NavHistoryPanel', () => {
  it('provides a chronological table equivalent to the visual plot', () => {
    const { container } = render(<NavHistoryPanel partnershipId="p-1" items={navFixtures} canEdit />)
    expect(container.querySelectorAll('circle')).toHaveLength(3)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(rows[1]).toHaveTextContent('Mar 31, 2024')
    expect(rows[3]).toHaveTextContent('Mar 31, 2025')
    expect(screen.getByRole('button', { name: 'Add NAV' })).toBeInTheDocument()
  })
})
