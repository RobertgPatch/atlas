import React from 'react'

export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'default'

export interface StatusBadgeProps {
  status: string
  type?: StatusType
}

export function StatusBadge({ status, type = 'default' }: StatusBadgeProps) {
  const baseClasses =
    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border'
  const typeClasses: Record<StatusType, string> = {
    success: 'bg-success-light text-success border-success/20',
    warning: 'bg-warning-light text-warning border-warning/20',
    error: 'bg-error-light text-error border-error/20',
    info: 'bg-atlas-light text-atlas-gold border-atlas-gold/20',
    default: 'bg-gray-100 text-gray-700 border-gray-200',
  }

  let activeType = type
  if (type === 'default') {
    const lowerStatus = status.toLowerCase()
    if (['complete', 'processed', 'active', 'resolved'].includes(lowerStatus))
      activeType = 'success'
    else if (['in review', 'pending', 'open'].includes(lowerStatus))
      activeType = 'warning'
    else if (['error', 'failed', 'rejected', 'critical'].includes(lowerStatus))
      activeType = 'error'
    else if (['new', 'assigned'].includes(lowerStatus)) activeType = 'info'
  }

  return (
    <span className={`${baseClasses} ${typeClasses[activeType]}`}>
      {status}
    </span>
  )
}
