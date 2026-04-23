import React from 'react'
import { SectionCard } from './SectionCard'
import { BarChart2Icon } from 'lucide-react'

export function ActivityDetailPreview() {
  return (
    <SectionCard title="Activity Detail">
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <BarChart2Icon className="w-8 h-8 text-text-tertiary mb-3" />
        <p className="text-sm font-medium text-text-secondary">Detail feed coming with Feature 005</p>
        <p className="text-xs text-text-tertiary mt-1 max-w-xs">
          Full transaction and activity history will be available in the Dashboards &amp; Analytics module.
        </p>
      </div>
    </SectionCard>
  )
}
