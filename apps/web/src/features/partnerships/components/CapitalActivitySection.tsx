import React from 'react'
import { ArrowRightLeftIcon } from 'lucide-react'
import type { CapitalActivityEvent } from 'packages/types/src'
import { DataTable, type Column } from '../../../components/DataTable'
import { SectionCard } from './SectionCard'

interface CapitalActivitySectionProps {
  rows: CapitalActivityEvent[]
  isLoading?: boolean
  isAdmin: boolean
  onAddActivity: () => void
}

const EVENT_LABEL: Record<CapitalActivityEvent['eventType'], string> = {
  capital_call: 'Capital Call',
  funded_contribution: 'Funded Contribution',
  other_adjustment: 'Other Adjustment',
}

const SOURCE_STYLE: Record<CapitalActivityEvent['sourceType'], string> = {
  manual: 'bg-gray-100 text-gray-700 border-gray-200',
  parsed: 'bg-blue-50 text-blue-700 border-blue-200',
}

const EVENT_STYLE: Record<CapitalActivityEvent['eventType'], string> = {
  capital_call: 'bg-amber-50 text-amber-700 border-amber-200',
  funded_contribution: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  other_adjustment: 'bg-violet-50 text-violet-700 border-violet-200',
}

const COLUMNS: Column<CapitalActivityEvent>[] = [
  {
    key: 'activityDate',
    header: 'Date',
    sortable: true,
    render: (row) => (
      <span className="tabular-nums text-text-primary">
        {new Date(row.activityDate).toLocaleDateString()}
      </span>
    ),
  },
  {
    key: 'eventType',
    header: 'Event Type',
    render: (row) => (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${EVENT_STYLE[row.eventType]}`}>
        {EVENT_LABEL[row.eventType]}
      </span>
    ),
  },
  {
    key: 'amountUsd',
    header: 'Amount',
    align: 'right',
    render: (row) => (
      <span className="font-medium tabular-nums">{`$${row.amountUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</span>
    ),
  },
  {
    key: 'sourceType',
    header: 'Source',
    render: (row) => (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SOURCE_STYLE[row.sourceType]}`}>
        {row.sourceType === 'manual' ? 'Manual' : 'Parsed'}
      </span>
    ),
  },
  {
    key: 'notes',
    header: 'Notes',
    render: (row) =>
      row.notes ? (
        <span className="text-sm text-text-secondary truncate max-w-xs block">{row.notes}</span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
]

export function CapitalActivitySection({
  rows,
  isLoading = false,
  isAdmin,
  onAddActivity,
}: CapitalActivitySectionProps) {
  return (
    <SectionCard
      title="Capital Activity"
      subtitle="Calls, funded contributions, and manual adjustments"
      headerAction={
        isAdmin ? (
          <button
            type="button"
            onClick={onAddActivity}
            className="px-3 py-1.5 rounded-lg bg-atlas-gold text-white text-xs font-medium hover:bg-atlas-hover"
          >
            Add Activity
          </button>
        ) : undefined
      }
    >
      <DataTable
        columns={COLUMNS}
        data={rows}
        state={isLoading ? 'loading' : rows.length ? 'populated' : 'empty'}
        emptyTitle="No capital activity"
        emptyDescription="Record capital calls and funded contributions to keep paid-in and unfunded metrics current."
        emptyAction={
          isAdmin
            ? {
                label: 'Add Capital Activity',
                onClick: onAddActivity,
              }
            : undefined
        }
      />
      {rows.length > 0 && (
        <div className="px-5 py-3 border-t border-border text-xs text-text-tertiary inline-flex items-center gap-1">
          <ArrowRightLeftIcon className="w-3.5 h-3.5" />
          Activity rows are source-tagged to preserve parsed vs manual distinctions.
        </div>
      )}
    </SectionCard>
  )
}
