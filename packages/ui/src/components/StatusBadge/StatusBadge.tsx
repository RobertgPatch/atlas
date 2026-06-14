import React from 'react'

export type AtlasStatus =
  | 'uploaded'
  | 'processing'
  | 'needs_review'
  | 'ready_for_approval'
  | 'finalized'
  | 'active'
  | 'inactive'

export interface StatusBadgeProps {
  status: AtlasStatus | (string & {})
  label?: string
  size?: 'small' | 'medium'
}

const colorMap: Record<string, string> = {
  uploaded: 'bg-blue-50 border-blue-200 text-blue-700',
  processing: 'bg-amber-50 border-amber-200 text-amber-700',
  needs_review: 'bg-amber-50 border-amber-200 text-amber-700',
  ready_for_approval: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  finalized: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  active: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  inactive: 'bg-gray-100 border-gray-200 text-gray-700',
}

function humanize(status: string): string {
  return status
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'small'
}) => {
  const colorClasses = colorMap[status] ?? colorMap.inactive
  const displayLabel = label ?? humanize(status)
  const sizeClasses = size === 'medium' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold capitalize ${sizeClasses} ${colorClasses}`}
    >
      {displayLabel}
    </span>
  )
}

export default StatusBadge
