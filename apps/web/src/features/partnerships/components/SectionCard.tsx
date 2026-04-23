import React from 'react'

interface SectionCardProps {
  title: string
  subtitle?: string
  headerAction?: React.ReactNode
  children: React.ReactNode
}

export function SectionCard({ title, subtitle, headerAction, children }: SectionCardProps) {
  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>}
        </div>
        {headerAction && <div>{headerAction}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}
