import React from 'react'

export type StatusType =
  | 'uploaded'
  | 'processing'
  | 'needs_review'
  | 'ready_for_approval'
  | 'finalized'

interface StatusBadgeProps {
  status: StatusType
  className?: string
}

const statusConfig: Record<StatusType, { label: string; bg: string; text: string; dot: string }> = {
  uploaded: {
    label: 'Uploaded',
    bg: 'bg-status-uploaded-bg',
    text: 'text-status-uploaded-text',
    dot: 'bg-gray-400',
  },
  processing: {
    label: 'Processing',
    bg: 'bg-status-processing-bg',
    text: 'text-status-processing-text',
    dot: 'bg-accent',
  },
  needs_review: {
    label: 'Needs Review',
    bg: 'bg-status-review-bg',
    text: 'text-status-review-text',
    dot: 'bg-amber-500',
  },
  ready_for_approval: {
    label: 'Ready for Approval',
    bg: 'bg-status-approval-bg',
    text: 'text-status-approval-text',
    dot: 'bg-emerald-500',
  },
  finalized: {
    label: 'Finalized',
    bg: 'bg-status-finalized-bg',
    text: 'text-status-finalized-text',
    dot: 'bg-green-600',
  },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
