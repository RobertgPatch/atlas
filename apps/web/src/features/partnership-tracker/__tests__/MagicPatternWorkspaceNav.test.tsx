import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceNav } from '../components/magic-patterns/MagicPatternPartnershipWorkspace'

describe('MagicPattern partnership workspace navigation', () => {
  it('wraps without creating a second horizontal scrollbar above the K-1 year rail', () => {
    render(<WorkspaceNav area="k1-history" counts={{ nav: 4, k1: 3 }} onChange={vi.fn()} />)

    const navigation = screen.getByRole('navigation', { name: 'Partnership sections' })
    expect(navigation).toHaveClass('overflow-hidden')
    expect(navigation).not.toHaveClass('overflow-x-auto')
    expect(navigation.firstElementChild).toHaveClass('flex-wrap')
  })
})
