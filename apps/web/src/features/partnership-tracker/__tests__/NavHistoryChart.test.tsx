import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NavHistoryChart } from '../components/NavHistoryChart'
import { navFixtures } from './fixtures'

describe('NavHistoryChart', () => {
  it('uses actual dates for distinct x positions and exposes focusable exact points', () => {
    const { container } = render(<NavHistoryChart items={navFixtures} />)
    const circles = [...container.querySelectorAll('circle')]
    expect(circles).toHaveLength(3)
    expect(circles.map((circle) => circle.getAttribute('cx'))).toEqual([...new Set(circles.map((circle) => circle.getAttribute('cx')))])
    expect(screen.getByRole('img', { name: /2024-03-31.*800,000/i })).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/NAV increased/i)).toBeInTheDocument()
  })
  it('handles empty, one-point, and all-zero domains', () => {
    const { rerender, container } = render(<NavHistoryChart items={[]} />)
    expect(screen.getByText(/Add a NAV entry/i)).toBeInTheDocument()
    rerender(<NavHistoryChart items={[{ ...navFixtures[0]!, amount: '0.00' }]} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('NaN')
  })
})
