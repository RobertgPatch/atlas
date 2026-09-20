import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceNav } from '../components/magic-patterns/MagicPatternPartnershipWorkspace'

describe('MagicPattern partnership workspace navigation', () => {
  it('wraps without creating a second horizontal scrollbar above the K-1 year rail', () => {
    const onChange = vi.fn()
    render(<WorkspaceNav area="k1-history" counts={{ k1: 3 }} onChange={onChange} />)

    const navigation = screen.getByRole('navigation', { name: 'Partnership sections' })
    expect(navigation).toHaveClass('overflow-hidden')
    expect(navigation).toHaveClass('-top-4', 'sm:-top-6', 'lg:-top-8')
    expect(navigation).not.toHaveClass('overflow-x-auto')
    expect(navigation.firstElementChild).toHaveClass('flex-wrap')
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Capital Activity', 'K-1 History3',
    ])
    expect(within(navigation).queryByText('Estate planning')).not.toBeInTheDocument()
    expect(within(navigation).queryByRole('button', { name: 'Underlying Assets' })).not.toBeInTheDocument()
    expect(within(navigation).queryByRole('button', { name: /Valuations/i })).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Capital Activity' }))
    expect(onChange).toHaveBeenCalledWith('capital-activity')
  })
})
