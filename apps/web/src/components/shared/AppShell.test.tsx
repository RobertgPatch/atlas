import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

describe('AppShell design flag', () => {
  beforeEach(() => window.localStorage.clear())

  it('renders the grouped Magic Patterns navigation when the flag is on', () => {
    const onSignOut = vi.fn()

    render(
      <MemoryRouter>
        <AppShell
          currentPath="/liquidity"
          userEmail="alex.morgan@jackson.test"
          userRole="Admin"
          workspaceName="Morgan Family Office"
          onSignOut={onSignOut}
          magicPatternDesigns
        >
          <div>Dashboard content</div>
        </AppShell>
      </MemoryRouter>,
    )

    const panel = screen.getByTestId('app-sidebar-panel')
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })

    expect(panel).toHaveAttribute('data-design-variant', 'magic-patterns')
    expect(panel).toHaveClass('border-gray-200', 'bg-white')
    expect(screen.getByText('Morgan Family Office')).toBeInTheDocument()
    expect(within(navigation).getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(within(navigation).getByRole('heading', { name: 'Modules' })).toBeInTheDocument()
    expect(within(navigation).getByRole('heading', { name: 'Workspace' })).toBeInTheDocument()
    expect(within(navigation).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(within(navigation).getByRole('link', { name: 'Entities & Owners' })).toHaveAttribute(
      'href',
      '/entities',
    )
    expect(within(navigation).getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/reports',
    )
    expect(within(navigation).getByRole('link', { name: 'Liquidity' })).toHaveClass(
      'bg-primary-subtle',
      'text-primary',
    )
    expect(within(navigation).getByRole('link', { name: 'Liquidity' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByTestId('app-shell-content')).toHaveClass(
      'w-full',
      'max-w-[2400px]',
    )
    expect(screen.getByTestId('app-shell-content').closest('main')).toHaveClass(
      'relative',
      'overflow-y-auto',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveClass('focus-visible:ring-focus')
  })

  it('collapses the Magic Patterns navigation to a persistent 64px icon rail', () => {
    render(
      <MemoryRouter>
        <AppShell currentPath="/investment-tracker" magicPatternDesigns>
          <div>Aggregate content</div>
        </AppShell>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    const frame = screen.getByTestId('app-sidebar-frame')
    const investmentTracker = screen.getByRole('link', { name: 'Investment tracker' })
    const visibleLabel = investmentTracker.querySelector('.min-w-0')

    expect(frame).toHaveClass('lg:w-16')
    expect(visibleLabel).toHaveClass('lg:hidden')
    expect(investmentTracker).toHaveClass('bg-primary-subtle', 'text-primary')
    expect(investmentTracker).toHaveAttribute('title', 'Investment tracker')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(window.localStorage.getItem('atlas-sidebar-collapsed')).toBe('true')
  })

  it('preserves the legacy navigation when the flag is off', () => {
    render(
      <MemoryRouter>
        <AppShell currentPath="/liquidity" magicPatternDesigns={false}>
          <div>Liquidity content</div>
        </AppShell>
      </MemoryRouter>,
    )

    const panel = screen.getByTestId('app-sidebar-panel')
    expect(panel).toHaveAttribute('data-design-variant', 'legacy')
    expect(panel).toHaveClass('border-gray-800', 'bg-black')
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.getByTestId('app-sidebar-frame')).toHaveClass('lg:w-20')
  })
})
