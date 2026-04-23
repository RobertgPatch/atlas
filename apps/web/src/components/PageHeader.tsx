import React from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  primaryAction?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }
  secondaryActions?: Array<{
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }>
}

export function PageHeader({ title, subtitle, primaryAction, secondaryActions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {secondaryActions?.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-text-secondary bg-surface border border-border rounded-card hover:bg-gray-50 transition-colors"
          >
            {action.icon}
            {action.label}
          </button>
        ))}
        {primaryAction && (
          <button
            onClick={primaryAction.onClick}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-card hover:bg-accent-hover transition-colors"
          >
            {primaryAction.icon}
            {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  )
}
