import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

describe('AppShell current navigation', () => {
  beforeEach(() => window.localStorage.clear())

  it('renders the exact current dashboard navigation', () => {
    const onSignOut = vi.fn()

    render(
      <MemoryRouter>
        <AppShell
          currentPath="/liquidity"
          userEmail="alex.morgan@jackson.test"
          userRole="Admin"
          workspaceName="Morgan Family Office"
          onSignOut={onSignOut}
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
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/dashboard',
      '/investment-tracker',
      '/liquidity',
      '/entities',
      '/estate-maps',
      '/tic-registry',
      '/reports',
    ])
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
        <AppShell currentPath="/investment-tracker">
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

  it('shows the User role, opens mobile navigation, and signs out', () => {
    const onSignOut = vi.fn()
    render(
      <MemoryRouter>
        <AppShell
          currentPath="/entities"
          userEmail="member@jackson.test"
          userRole="User"
          onSignOut={onSignOut}
        >
          <div>Entities content</div>
        </AppShell>
      </MemoryRouter>,
    )

    expect(screen.getByText('User')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getAllByRole('button', { name: 'Close navigation' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Close navigation' })[0])
    expect(screen.queryAllByRole('button', { name: 'Close navigation' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
