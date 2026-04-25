import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  FileText,
  UploadCloud,
  Building2,
  Briefcase,
  BarChart3,
  Users,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
} from 'lucide-react'

interface AppShellProps {
  children: React.ReactNode
  currentPath?: string
  userRole?: 'Admin' | 'User'
  userEmail?: string
  onSignOut?: () => void
}

export function AppShell({
  children,
  currentPath = '/dashboard',
  userRole = 'User',
  userEmail,
  onSignOut,
}: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'K-1 Processing', href: '/k1', icon: FileText },
    { name: 'Upload Center', href: '/upload', icon: UploadCloud },
    { name: 'Entities', href: '/entities', icon: Building2 },
    { name: 'Partnerships', href: '/partnerships', icon: Briefcase },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
  ]

  const adminNavigation = [
    { name: 'User Management', href: '/admin/users', icon: Users },
  ]

  const NavItem = ({ item }: { item: { name: string; href: string; icon: React.ComponentType<{ className?: string }> } }) => {
    const isActive = currentPath === item.href
    return (
      <a
        href={item.href}
        className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
          isActive
            ? 'bg-white/5 text-atlas-gold border-l-2 border-atlas-gold'
            : 'text-gray-300 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
        }`}
      >
        <item.icon
          className={`flex-shrink-0 -ml-1 mr-3 h-5 w-5 ${
            isActive ? 'text-atlas-gold' : 'text-gray-400 group-hover:text-gray-300'
          }`}
        />
        <span className="truncate">{item.name}</span>
      </a>
    )
  }

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
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-black border-r border-gray-800 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-atlas-gold rounded-lg flex items-center justify-center">
                <span className="text-black font-serif font-bold text-lg">A</span>
              </div>
              <span className="text-xl font-serif font-bold text-white tracking-widest uppercase">
                Atlas
              </span>
            </div>
            <button
              className="ml-auto lg:hidden text-gray-400 hover:text-white"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-8">
            <nav className="space-y-1">
              {navigation.map((item) => (
                <NavItem key={item.name} item={item} />
              ))}
            </nav>

            {userRole === 'Admin' && (
              <div>
                <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Administration
                </h3>
                <nav className="space-y-1">
                  {adminNavigation.map((item) => (
                    <NavItem key={item.name} item={item} />
                  ))}
                </nav>
              </div>
            )}
          </div>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center w-full">
              <div className="flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-sm font-medium text-gray-300">
                  JD
                </div>
              </div>
              <div className="ml-3 flex-1 overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{userEmail ?? 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{userRole}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="ml-2 text-gray-400 hover:text-white"
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
              className="mr-4 lg:hidden text-gray-500 hover:text-gray-700"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="max-w-md w-full hidden sm:block">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-atlas-gold focus:border-atlas-gold sm:text-sm transition-colors"
                  placeholder="Search entities, partnerships, or K-1s..."
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-400 hover:text-gray-500 transition-colors">
              <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-error ring-2 ring-white" />
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
