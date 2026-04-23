import React from 'react'

interface KpiCardProps {
  label: string
  value: string | number
  delta?: string
  deltaType?: 'positive' | 'negative' | 'neutral'
  subtext?: string
  icon?: React.ReactNode
  accentColor?: string
}

export function KpiCard({
  label,
  value,
  delta,
  deltaType = 'neutral',
  subtext,
  icon,
  accentColor,
}: KpiCardProps) {
  const deltaColors = {
    positive: 'text-green-600',
    negative: 'text-red-600',
    neutral: 'text-text-tertiary',
  }

  return (
    <div className="bg-surface border border-border rounded-card px-5 py-4 shadow-card">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
            {label}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-kpi text-text-primary tabular-nums">{value}</span>
            {delta && (
              <span className={`text-xs font-medium ${deltaColors[deltaType]}`}>{delta}</span>
            )}
          </div>
          {subtext && <p className="text-xs text-text-tertiary mt-1">{subtext}</p>}
        </div>
        {icon && (
          <div
            className="flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0"
            style={{ backgroundColor: accentColor ? `${accentColor}12` : '#E8EDF3' }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
