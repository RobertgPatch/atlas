import React from 'react'
import { KpiCard } from '../../../components/KpiCard'
import { Building2Icon, DollarSignIcon, TrendingUpIcon } from 'lucide-react'

interface PartnershipKpiStripProps {
  partnershipCount: number
  totalDistributionsUsd: number
  totalFmvUsd: number
  totalCommitmentUsd: number
  totalPaidInUsd: number
  totalUnfundedUsd: number
  loading?: boolean
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

export function PartnershipKpiStrip({
  partnershipCount,
  totalDistributionsUsd,
  totalFmvUsd,
  totalCommitmentUsd,
  totalPaidInUsd,
  totalUnfundedUsd,
  loading = false,
}: PartnershipKpiStripProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
      <KpiCard
        label="Total Partnerships"
        value={loading ? '—' : partnershipCount.toLocaleString()}
        icon={<Building2Icon className="w-4 h-4 text-atlas-gold" />}
        accentColor="#C9A96E"
      />
      <KpiCard
        label="Total Distributions"
        value={loading ? '—' : formatUsd(totalDistributionsUsd)}
        subtext="Across all filtered partnerships"
        icon={<DollarSignIcon className="w-4 h-4 text-atlas-gold" />}
        accentColor="#C9A96E"
      />
      <KpiCard
        label="Total FMV"
        value={loading ? '—' : formatUsd(totalFmvUsd)}
        subtext="Latest FMV per partnership"
        icon={<TrendingUpIcon className="w-4 h-4 text-atlas-gold" />}
        accentColor="#C9A96E"
      />
      <KpiCard
        label="Total Commitment"
        value={loading ? '—' : formatUsd(totalCommitmentUsd)}
        icon={<TrendingUpIcon className="w-4 h-4 text-atlas-gold" />}
        accentColor="#C9A96E"
      />
      <KpiCard
        label="Total Paid-In"
        value={loading ? '—' : formatUsd(totalPaidInUsd)}
        icon={<DollarSignIcon className="w-4 h-4 text-atlas-gold" />}
        accentColor="#C9A96E"
      />
      <KpiCard
        label="Total Unfunded"
        value={loading ? '—' : formatUsd(totalUnfundedUsd)}
        icon={<DollarSignIcon className="w-4 h-4 text-atlas-gold" />}
        accentColor="#C9A96E"
      />
    </div>
  )
}
