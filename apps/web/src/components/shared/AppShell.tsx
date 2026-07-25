import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Building2,
  ChartNoAxesCombined,
  Landmark,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  LogOut,
} from 'lucide-react'

interface AppShellProps {
  children: React.ReactNode
  currentPath?: string
  userRole?: 'Admin' | 'User'
  userEmail?: string
  onSignOut?: () => void
  contentClassName?: string
}

type NavigationItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }> }
const navigation: NavigationItem[] = [
  { name: 'Liquidity', href: '/liquidity', icon: Landmark },
  { name: 'Partnerships', href: '/partnership-tracker', icon: Building2 },
  { name: 'Investment Tracker', href: '/private-investment-tracker', icon: ChartNoAxesCombined },
  { name: 'TIC Registry', href: '/tic-registry', icon: Network },
  { name: 'Entities', href: '/entities', icon: Building2 },
]

function NavItem({ item, currentPath, collapsed, showDetails }: { item: NavigationItem; currentPath: string; collapsed: boolean; showDetails: boolean }) {
  const isActive = currentPath === item.href || currentPath.startsWith(`${item.href}/`) || (item.href === '/partnership-tracker' && currentPath === '/partnership-aggregation')
  return <Link
    to={item.href}
    aria-label={item.name}
    title={collapsed && !showDetails ? item.name : undefined}
    className={`group flex min-h-11 items-center rounded-md border-l-2 py-2 text-sm font-medium transition-colors ${showDetails ? 'px-3' : 'lg:justify-center lg:px-2'} ${isActive ? 'border-jackson-gold bg-white/5 text-jackson-gold' : 'border-transparent text-gray-300 hover:bg-white/5 hover:text-white'}`}
  >
    <item.icon className={`h-5 w-5 flex-shrink-0 ${showDetails ? '-ml-1 mr-3' : 'lg:mx-0'} ${isActive ? 'text-jackson-gold' : 'text-gray-400 group-hover:text-gray-300'}`} />
    <span className={`truncate ${showDetails ? '' : 'lg:hidden'}`}>{item.name}</span>
  </Link>
}

export function AppShell({
  children,
  currentPath = '/liquidity',
  userRole = 'User',
  userEmail,
  onSignOut,
  contentClassName = 'max-w-7xl',
}: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isDesktopNavCollapsed, setIsDesktopNavCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return window.localStorage.getItem('atlas-sidebar-collapsed') === 'true' } catch { return false }
  })
  const [isDesktopNavHovered, setIsDesktopNavHovered] = useState(false)
  const [isDesktopNavFocused, setIsDesktopNavFocused] = useState(false)
  const reduceMotion = useReducedMotion()
  const showDesktopNavDetails = !isDesktopNavCollapsed || isDesktopNavHovered || isDesktopNavFocused

  useEffect(() => {
    try { window.localStorage.setItem('atlas-sidebar-collapsed', String(isDesktopNavCollapsed)) } catch { /* Storage may be disabled. */ }
  }, [isDesktopNavCollapsed])

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        data-testid="app-sidebar-frame"
        onMouseEnter={() => setIsDesktopNavHovered(true)}
        onMouseLeave={() => setIsDesktopNavHovered(false)}
        onFocusCapture={() => { if (isDesktopNavCollapsed) setIsDesktopNavFocused(true) }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDesktopNavFocused(false)
        }}
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:relative lg:inset-auto lg:shrink-0 lg:translate-x-0 lg:transition-[width] ${isDesktopNavCollapsed ? 'lg:w-20' : 'lg:w-64'} ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div data-testid="app-sidebar-panel" className={`flex h-full flex-col border-r border-gray-800 bg-black transition-[width,box-shadow] duration-200 motion-reduce:transition-none ${isDesktopNavCollapsed && showDesktopNavDetails ? 'lg:absolute lg:inset-y-0 lg:left-0 lg:w-64 lg:shadow-2xl' : 'w-full'}`}>
          {/* Logo */}
          <div className={`flex h-16 items-center border-b border-gray-800 px-4 ${showDesktopNavDetails ? '' : 'lg:justify-center lg:px-2'}`}>
            <div className={`items-center gap-2 ${showDesktopNavDetails ? 'flex' : 'flex lg:hidden'}`}>
              <div className="w-8 h-8 bg-jackson-gold rounded-lg flex items-center justify-center">
                <span className="text-black font-serif font-bold text-lg">J</span>
              </div>
              <span className="text-xl font-serif font-bold text-white tracking-widest uppercase">
                Jackson
              </span>
            </div>
            <button
              type="button"
              aria-label="Close navigation"
              className="ml-auto grid min-h-11 min-w-11 place-items-center text-gray-400 hover:text-white lg:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label={isDesktopNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-pressed={isDesktopNavCollapsed}
              onClick={() => {
                setIsDesktopNavCollapsed((collapsed) => !collapsed)
                setIsDesktopNavHovered(false)
                setIsDesktopNavFocused(false)
              }}
              className={`${showDesktopNavDetails ? 'ml-auto' : ''} hidden h-10 w-10 place-items-center rounded-md text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold lg:grid`}
            >
              {isDesktopNavCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-8">
            <nav className="space-y-1">
              {navigation.map((item) => (
                <NavItem key={item.name} item={item} currentPath={currentPath} collapsed={isDesktopNavCollapsed} showDetails={showDesktopNavDetails} />
              ))}
            </nav>
          </div>

          {/* User Profile */}
          <div className={`border-t border-gray-800 p-4 ${showDesktopNavDetails ? '' : 'lg:px-2'}`}>
            <div className={`flex w-full items-center ${showDesktopNavDetails ? '' : 'lg:flex-col lg:gap-2'}`}>
              <div className="flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-sm font-medium text-gray-300">
                  JD
                </div>
              </div>
              <div className={`ml-3 flex-1 overflow-hidden ${showDesktopNavDetails ? '' : 'lg:hidden'}`}>
                <p className="text-sm font-medium text-white truncate">{userEmail ?? 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{userRole}</p>
              </div>
              <button
                type="button"
                aria-label="Sign out"
                title={showDesktopNavDetails ? undefined : 'Sign out'}
                onClick={onSignOut}
                className={`${showDesktopNavDetails ? 'ml-2' : 'lg:ml-0'} grid min-h-10 min-w-10 place-items-center rounded-md text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10">
          <div className="flex items-center flex-1">
            <button
              type="button"
              aria-label="Open navigation"
              className="mr-4 grid min-h-11 min-w-11 place-items-center text-gray-500 hover:text-gray-700 lg:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`${contentClassName} mx-auto`}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
