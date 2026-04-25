import React from 'react'
import {
  ArrowRightLeftIcon,
  BarChart3Icon,
  DollarSignIcon,
  HandCoinsIcon,
  LandmarkIcon,
  PieChartIcon,
} from 'lucide-react'
import type { PartnershipCapitalOverview } from 'packages/types/src'
import { KpiCard } from '../../../components/KpiCard'
import { SectionCard } from './SectionCard'

interface CapitalOverviewSectionProps {
  overview: PartnershipCapitalOverview
  isAdmin: boolean
  onAddCommitment: () => void
  onAddCapitalActivity: () => void
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—'
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(2)}%`
}

function formatMultiple(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(2)}x`
}

export function CapitalOverviewSection({
  overview,
  isAdmin,
  onAddCommitment,
  onAddCapitalActivity,
}: CapitalOverviewSectionProps) {
  return (
    <SectionCard
      title="Capital Overview"
      subtitle="Derived from commitments, capital activity, finalized K-1 distributions, and latest FMV"
      headerAction={
        isAdmin ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAddCommitment}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-text-primary hover:bg-gray-50"
            >
              Add Commitment
            </button>
            <button
              type="button"
              onClick={onAddCapitalActivity}
              className="px-3 py-1.5 rounded-lg bg-atlas-gold text-white text-xs font-medium hover:bg-atlas-hover"
            >
              Add Capital Activity
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
        <KpiCard
          label="Original Commitment"
          value={formatUsd(overview.originalCommitmentUsd)}
          icon={<LandmarkIcon className="w-4 h-4 text-atlas-gold" />}
          accentColor="#C9A96E"
        />
        <KpiCard
          label="Paid-In"
          value={formatUsd(overview.paidInUsd)}
          icon={<HandCoinsIcon className="w-4 h-4 text-atlas-gold" />}
          accentColor="#C9A96E"
        />
        <KpiCard
          label="% Called"
          value={formatPercent(overview.percentCalled)}
          icon={<PieChartIcon className="w-4 h-4 text-atlas-gold" />}
          accentColor="#C9A96E"
        />
        <KpiCard
          label="Unfunded"
          value={formatUsd(overview.unfundedUsd)}
          icon={<DollarSignIcon className="w-4 h-4 text-atlas-gold" />}
          accentColor="#C9A96E"
        />
        <KpiCard
          label="Reported Distributions"
          value={formatUsd(overview.reportedDistributionsUsd)}
          icon={<ArrowRightLeftIcon className="w-4 h-4 text-atlas-gold" />}
          accentColor="#C9A96E"
        />
        <KpiCard
          label="Residual Value"
          value={formatUsd(overview.residualValueUsd)}
          icon={<BarChart3Icon className="w-4 h-4 text-atlas-gold" />}
          accentColor="#C9A96E"
        />
        <KpiCard label="DPI" value={formatMultiple(overview.dpi)} accentColor="#C9A96E" />
        <KpiCard label="RVPI" value={formatMultiple(overview.rvpi)} accentColor="#C9A96E" />
        <KpiCard label="TVPI" value={formatMultiple(overview.tvpi)} accentColor="#C9A96E" />
      </div>
    </SectionCard>
  )
}
