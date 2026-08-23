import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { featureFlags } from '../../config/featureFlags'

interface AppShellProps {
  children: React.ReactNode
  currentPath?: string
  userRole?: 'Admin' | 'User'
  userEmail?: string
  onSignOut?: () => void
  mainClassName?: string
  magicPatternDesigns?: boolean
  workspaceName?: string
  topBarBreadcrumbs?: Array<{ label: string; href?: string }>
}

type NavigationItem = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

type NavigationSection = {
  id: string
  label: string
  items: NavigationItem[]
}

const legacyNavigation: NavigationItem[] = [
  { name: 'Liquidity', href: '/liquidity', icon: Landmark },
  { name: 'Partnerships', href: '/partnership-tracker', icon: Building2 },
  { name: 'TIC Registry', href: '/tic-registry', icon: Network },
  { name: 'Entities', href: '/entities', icon: Building2 },
  { name: 'Estate Maps', href: '/estate-maps', icon: MapIcon },
]

const magicPatternNavigation: NavigationSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ name: 'Home', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'modules',
    label: 'Modules',
    items: [
      { name: 'Investment tracker', href: '/investment-tracker', icon: TrendingUp },
      { name: 'Liquidity', href: '/liquidity', icon: Wallet },
      { name: 'Entities & Owners', href: '/entities', icon: Users },
      { name: 'Estate Maps', href: '/estate-maps', icon: MapIcon },
      { name: 'TIC Registry', href: '/tic-registry', icon: Network },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    items: [{ name: 'Reports', href: '/reports', icon: FileText }],
  },
]

const isNavigationItemActive = (item: NavigationItem, currentPath: string) =>
  currentPath === item.href ||
  currentPath.startsWith(`${item.href}/`) ||
  (item.href === '/partnership-tracker' && currentPath === '/partnership-aggregation')

function LegacyNavItem({
  item,
  currentPath,
  collapsed,
  showDetails,
}: {
  item: NavigationItem
  currentPath: string
  collapsed: boolean
  showDetails: boolean
}) {
  const isActive = isNavigationItemActive(item, currentPath)
  return (
    <Link
      to={item.href}
      aria-label={item.name}
      title={collapsed && !showDetails ? item.name : undefined}
      className={`group flex min-h-11 items-center rounded-md border-l-2 py-2 text-sm font-medium transition-colors ${showDetails ? 'px-3' : 'lg:justify-center lg:px-2'} ${isActive ? 'border-primary bg-white/5 text-primary' : 'border-transparent text-gray-300 hover:bg-white/5 hover:text-white'}`}
    >
      <item.icon
        className={`h-5 w-5 flex-shrink-0 ${showDetails ? '-ml-1 mr-3' : 'lg:mx-0'} ${isActive ? 'text-primary' : 'text-gray-400 group-hover:text-gray-300'}`}
      />
      <span className={`truncate ${showDetails ? '' : 'lg:hidden'}`}>{item.name}</span>
    </Link>
  )
}

function MagicPatternNavItem({
  item,
  currentPath,
  collapsed,
  onNavigate,
}: {
  item: NavigationItem
  currentPath: string
  collapsed: boolean
  onNavigate: () => void
}) {
  const isActive = isNavigationItemActive(item, currentPath)

  return (
    <Link
      to={item.href}
      aria-current={isActive ? 'page' : undefined}
      aria-label={item.name}
      title={collapsed ? item.name : undefined}
      onClick={onNavigate}
      className={`group relative flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${isActive ? 'bg-primary-subtle text-primary' : 'text-content-secondary hover:bg-primary-subtle hover:text-primary'}`}
    >
      <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className={`min-w-0 flex-1 truncate text-left ${collapsed ? 'lg:hidden' : ''}`}>
        {item.name}
      </span>
      {item.badge !== undefined ? (
        <>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${isActive ? 'bg-primary-subtle-hover text-primary' : 'bg-gray-100 text-gray-600'} ${collapsed ? 'lg:hidden' : ''}`}
          >
            {item.badge}
          </span>
          {collapsed ? (
            <span
              className={`absolute right-1.5 top-1.5 hidden h-2 w-2 rounded-full ring-2 ring-white lg:block ${isActive ? 'bg-primary' : 'bg-gray-900'}`}
              aria-hidden="true"
            />
          ) : null}
        </>
      ) : null}
      {collapsed ? (
        <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-md lg:group-hover:block lg:group-focus-visible:block">
          {item.name}
        </span>
      ) : null}
    </Link>
  )
}

function getAccountInitials(userEmail?: string) {
  const localPart = userEmail?.split('@')[0]
  if (!localPart) return 'J'

  const parts = localPart.split(/[._-]/).filter(Boolean)
  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase()
  }

  return localPart.slice(0, 2).toUpperCase()
}

export function AppShell({
  children,
  currentPath = '/liquidity',
  userRole = 'User',
  userEmail,
  onSignOut,
  mainClassName = 'bg-gray-50',
  magicPatternDesigns = featureFlags.magicPatternDesigns,
  workspaceName = 'Family Office',
  topBarBreadcrumbs,
}: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isDesktopNavCollapsed, setIsDesktopNavCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('atlas-sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [isDesktopNavHovered, setIsDesktopNavHovered] = useState(false)
  const [isDesktopNavFocused, setIsDesktopNavFocused] = useState(false)
  const reduceMotion = useReducedMotion()
  const showLegacyDesktopNavDetails =
    !isDesktopNavCollapsed || isDesktopNavHovered || isDesktopNavFocused
  const accountInitials = getAccountInitials(userEmail)

  useEffect(() => {
    try {
      window.localStorage.setItem('atlas-sidebar-collapsed', String(isDesktopNavCollapsed))
    } catch {
      /* Storage may be disabled. */
    }
  }, [isDesktopNavCollapsed])

  return (
    <div
      className={`flex bg-gray-50 ${magicPatternDesigns ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
    >
      {isMobileMenuOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className={`fixed inset-0 z-40 h-full w-full lg:hidden ${magicPatternDesigns ? 'bg-gray-900/50' : 'bg-gray-900/80 backdrop-blur-sm'}`}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      <div
        data-testid="app-sidebar-frame"
        onMouseEnter={
          magicPatternDesigns ? undefined : () => setIsDesktopNavHovered(true)
        }
        onMouseLeave={
          magicPatternDesigns ? undefined : () => setIsDesktopNavHovered(false)
        }
        onFocusCapture={
          magicPatternDesigns
            ? undefined
            : () => {
                if (isDesktopNavCollapsed) setIsDesktopNavFocused(true)
              }
        }
        onBlurCapture={
          magicPatternDesigns
            ? undefined
            : (event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsDesktopNavFocused(false)
                }
              }
        }
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:relative lg:inset-auto lg:shrink-0 lg:translate-x-0 lg:transition-[width] ${isDesktopNavCollapsed ? (magicPatternDesigns ? 'lg:w-16' : 'lg:w-20') : 'lg:w-64'} ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div
          data-testid="app-sidebar-panel"
          data-design-variant={magicPatternDesigns ? 'magic-patterns' : 'legacy'}
          className={
            magicPatternDesigns
              ? 'flex h-full w-full flex-col border-r border-gray-200 bg-white transition-[width] duration-200 ease-out motion-reduce:transition-none'
              : `flex h-full flex-col border-r border-gray-800 bg-black transition-[width,box-shadow] duration-200 motion-reduce:transition-none ${isDesktopNavCollapsed && showLegacyDesktopNavDetails ? 'lg:absolute lg:inset-y-0 lg:left-0 lg:w-64 lg:shadow-2xl' : 'w-full'}`
          }
        >
          {magicPatternDesigns ? (
            <>
              <div className="flex h-16 shrink-0 items-center gap-3 px-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white">
                  J
                </div>
                <div
                  className={`min-w-0 flex-1 ${isDesktopNavCollapsed ? 'lg:hidden' : ''}`}
                >
                  <p className="truncate text-sm font-semibold text-gray-900">Jackson</p>
                  <p className="truncate text-xs text-gray-500">{workspaceName}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation"
                  className="ml-auto grid min-h-11 min-w-11 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <nav
                aria-label="Main navigation"
                className="flex-1 overflow-y-auto px-2 pb-4"
              >
                {magicPatternNavigation.map((section, sectionIndex) => (
                  <div key={section.id} className={sectionIndex === 0 ? '' : 'mt-6'}>
                    <h2
                      className={`px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${isDesktopNavCollapsed ? 'lg:hidden' : ''}`}
                    >
                      {section.label}
                    </h2>
                    {isDesktopNavCollapsed && sectionIndex > 0 ? (
                      <div
                        className="mx-2 mb-2 hidden border-t border-gray-200 lg:block"
                        aria-hidden="true"
                      />
                    ) : null}
                    <ul role="list" className="space-y-1">
                      {section.items.map((item) => (
                        <li key={item.name}>
                          <MagicPatternNavItem
                            item={item}
                            currentPath={currentPath}
                            collapsed={isDesktopNavCollapsed}
                            onNavigate={() => setIsMobileMenuOpen(false)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>

              <div className="hidden shrink-0 border-t border-gray-200 p-2 lg:block">
                <button
                  type="button"
                  aria-expanded={!isDesktopNavCollapsed}
                  aria-label={
                    isDesktopNavCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                  }
                  onClick={() => setIsDesktopNavCollapsed((collapsed) => !collapsed)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${isDesktopNavCollapsed ? 'justify-center px-0' : ''}`}
                >
                  {isDesktopNavCollapsed ? (
                    <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
                  )}
                  <span className={isDesktopNavCollapsed ? 'hidden' : ''}>Collapse</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className={`flex h-16 items-center border-b border-gray-800 px-4 ${showLegacyDesktopNavDetails ? '' : 'lg:justify-center lg:px-2'}`}
              >
                <div
                  className={`items-center gap-2 ${showLegacyDesktopNavDetails ? 'flex' : 'flex lg:hidden'}`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-decorative-brand-accent">
                    <span className="font-serif text-lg font-bold text-black">J</span>
                  </div>
                  <span className="font-serif text-xl font-bold uppercase tracking-widest text-white">
                    Jackson
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation"
                  className="ml-auto grid min-h-11 min-w-11 place-items-center text-gray-400 hover:text-white lg:hidden"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label={
                    isDesktopNavCollapsed ? 'Expand navigation' : 'Collapse navigation'
                  }
                  aria-pressed={isDesktopNavCollapsed}
                  onClick={() => {
                    setIsDesktopNavCollapsed((collapsed) => !collapsed)
                    setIsDesktopNavHovered(false)
                    setIsDesktopNavFocused(false)
                  }}
                  className={`${showLegacyDesktopNavDetails ? 'ml-auto' : ''} hidden h-10 w-10 place-items-center rounded-md text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:grid`}
                >
                  {isDesktopNavCollapsed ? (
                    <PanelLeftOpen className="h-5 w-5" />
                  ) : (
                    <PanelLeftClose className="h-5 w-5" />
                  )}
                </button>
              </div>

              <div className="flex-1 space-y-8 overflow-y-auto px-3 py-4">
                <nav className="space-y-1">
                  {legacyNavigation.map((item) => (
                    <LegacyNavItem
                      key={item.name}
                      item={item}
                      currentPath={currentPath}
                      collapsed={isDesktopNavCollapsed}
                      showDetails={showLegacyDesktopNavDetails}
                    />
                  ))}
                </nav>
              </div>

              <div
                className={`border-t border-gray-800 p-4 ${showLegacyDesktopNavDetails ? '' : 'lg:px-2'}`}
              >
                <div
                  className={`flex w-full items-center ${showLegacyDesktopNavDetails ? '' : 'lg:flex-col lg:gap-2'}`}
                >
                  <div className="flex-shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-sm font-medium text-gray-300">
                      JD
                    </div>
                  </div>
                  <div
                    className={`ml-3 flex-1 overflow-hidden ${showLegacyDesktopNavDetails ? '' : 'lg:hidden'}`}
                  >
                    <p className="truncate text-sm font-medium text-white">
                      {userEmail ?? 'User'}
                    </p>
                    <p className="truncate text-xs text-gray-400">{userRole}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Sign out"
                    title={showLegacyDesktopNavDetails ? undefined : 'Sign out'}
                    onClick={onSignOut}
                    className={`${showLegacyDesktopNavDetails ? 'ml-2' : 'lg:ml-0'} grid min-h-10 min-w-10 place-items-center rounded-md text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center">
            <button
              type="button"
              aria-label="Open navigation"
              className="mr-4 grid min-h-11 min-w-11 place-items-center text-gray-500 hover:text-gray-700 lg:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            {magicPatternDesigns && topBarBreadcrumbs?.length ? (
              <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
                <ol className="flex min-w-0 items-center gap-2 text-sm">
                  {topBarBreadcrumbs.map((crumb, index) => {
                    const isLast = index === topBarBreadcrumbs.length - 1
                    return (
                      <React.Fragment key={`${crumb.label}-${index}`}>
                        <li className="min-w-0">
                          {crumb.href && !isLast ? (
                            <Link
                              to={crumb.href}
                              className="rounded text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                            >
                              {crumb.label}
                            </Link>
                          ) : (
                            <span
                              aria-current={isLast ? 'page' : undefined}
                              className={isLast ? 'truncate font-medium text-gray-900' : 'text-gray-500'}
                            >
                              {crumb.label}
                            </span>
                          )}
                        </li>
                        {!isLast ? (
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
                        ) : null}
                      </React.Fragment>
                    )
                  })}
                </ol>
              </nav>
            ) : null}
          </div>
          {magicPatternDesigns ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-56 truncate text-sm font-medium text-gray-900">
                  {userEmail ?? 'User'}
                </p>
                <p className="text-xs text-gray-500">{userRole}</p>
              </div>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white"
                aria-hidden="true"
              >
                {accountInitials}
              </div>
              <button
                type="button"
                aria-label="Sign out"
                onClick={onSignOut}
                className="grid min-h-10 min-w-10 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </header>

        <main className={`relative flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 ${mainClassName}`}>
          <motion.div
            data-testid="app-shell-content"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto w-full max-w-[2400px]"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
