import {
  BuildingIcon,
  DollarSignIcon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-react'
import type { ConsolidatedHoldingsKpis } from '../../../../../../packages/types/src/reports'
import { formatCurrency, formatPercent } from '../utils/formatters'

interface ConsolidatedHoldingsSummaryCardsProps {
  kpis: ConsolidatedHoldingsKpis | undefined
}

export function ConsolidatedHoldingsSummaryCards({
  kpis,
}: ConsolidatedHoldingsSummaryCardsProps) {
  const gainLoss = kpis?.totalUnrealizedGainLoss ?? null
  const gainLossPositive = (gainLoss ?? 0) >= 0

  const cards = [
    {
      label: 'Total Portfolio Value',
      value: formatCurrency(kpis?.totalMarketValue),
      icon: <DollarSignIcon className="h-5 w-5" />,
      iconBg: 'bg-blue-100 text-blue-600',
      bg: 'bg-white',
      valueClass: 'text-gray-900',
    },
    {
      label: 'Total Cost Basis',
      value: formatCurrency(kpis?.totalCostBasis),
      icon: <WalletIcon className="h-5 w-5" />,
      iconBg: 'bg-violet-100 text-violet-600',
      bg: 'bg-white',
      valueClass: 'text-gray-900',
    },
    {
      label: 'Unrealized Gain/Loss',
      value: formatCurrency(gainLoss),
      subValue: formatPercent(kpis?.gainLossPercent, 2),
      icon: <TrendingUpIcon className="h-5 w-5" />,
      iconBg: gainLossPositive
        ? 'bg-emerald-100 text-emerald-600'
        : 'bg-red-100 text-red-600',
      bg: gainLossPositive ? 'bg-emerald-50' : 'bg-red-50',
      valueClass: gainLossPositive ? 'text-emerald-600' : 'text-red-600',
    },
    {
      label: 'Connected Accounts',
      value: String(kpis?.selectedAccountCount ?? 0),
      subValue: `${kpis?.uniqueAssetCount ?? 0} assets`,
      icon: <BuildingIcon className="h-5 w-5" />,
      iconBg: 'bg-amber-100 text-amber-600',
      bg: 'bg-white',
      valueClass: 'text-gray-900',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.bg} rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-md`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">{card.label}</span>
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.iconBg}`}
            >
              {card.icon}
            </div>
          </div>
          <div className={`text-2xl font-semibold ${card.valueClass}`}>
            {card.value}
          </div>
          {card.subValue && (
            <span className={`mt-1 inline-block text-sm font-medium ${card.valueClass}`}>
              {card.subValue}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
