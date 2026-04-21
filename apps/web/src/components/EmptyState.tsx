import React from 'react'
import { InboxIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
        {icon || <InboxIcon className="w-5 h-5 text-text-tertiary" />}
      </div>
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-tertiary text-center max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center px-3.5 py-2 text-sm font-medium text-white bg-accent rounded-card hover:bg-accent-hover transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
