import React, { Fragment } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumbs?: Array<{ label: string; href?: string }>
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) {
  const isExternalUrl = (href: string) => /^([a-z][a-z\d+\-.]*:)?\/\//i.test(href)

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4"
    >
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex text-sm text-gray-500 mb-2 space-x-2">
            {breadcrumbs.map((crumb, idx) => (
              <Fragment key={idx}>
                {idx > 0 && <span>/</span>}
                {crumb.href ? (
                  isExternalUrl(crumb.href) ? (
                    <a href={crumb.href} className="hover:text-gray-900 transition-colors">
                      {crumb.label}
                    </a>
                  ) : (
                    <Link to={crumb.href} className="hover:text-gray-900 transition-colors">
                      {crumb.label}
                    </Link>
                  )
                ) : (
                  <span className="text-gray-900 font-medium">{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>

      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </motion.div>
  )
}
