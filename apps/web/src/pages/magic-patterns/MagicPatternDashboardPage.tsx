import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileBarChart,
  FileText,
  Layers3,
  RefreshCw,
  Upload,
  Wallet,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { ConsolidatedHoldingsResponse } from '../../../../../packages/types/src/reports'
import { authClient } from '../../auth/authClient'
import { sessionStore, useSession } from '../../auth/sessionStore'
import { ErrorState } from '../../components/ErrorState'
import { AppShell } from '../../components/shared/AppShell'
import type { DashboardSummaryResponse } from '../../features/dashboard/api/dashboardClient'
import { useDashboardSummary } from '../../features/dashboard/hooks/useDashboardSummary'
import { useLiquiditySummary } from '../../features/dashboard/hooks/useLiquiditySummary'

type DashboardData = DashboardSummaryResponse
type OpenIssue = DashboardData['openIssues'][number]
type RecentK1 = DashboardData['recentK1Activity'][number]

const formatUsd = (value: number | null | undefined) => {
  if (value == null) return null
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const formatDate = (value: string | number) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const formatTimestamp = (value: string | number) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const formatRelativeTime = (value: string) => {
  const elapsedMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(elapsedMs / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const displayNameFromEmail = (email?: string) => {
  const localPart = email?.split('@')[0]
  if (!localPart) return 'there'
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

const greetingForCurrentHour = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const statusLabel: Record<RecentK1['status'], string> = {
  UPLOADED: 'uploaded',
  PROCESSING: 'is processing',
  NEEDS_REVIEW: 'needs review',
  READY_FOR_APPROVAL: 'is ready for approval',
  FINALIZED: 'was finalized',
}

const issueTone: Record<OpenIssue['severity'], { icon: LucideIcon; iconClass: string; chipClass: string }> = {
  HIGH: {
    icon: AlertCircle,
    iconClass: 'text-red-600',
    chipClass: 'border-red-200 bg-red-50 text-red-700',
  },
  MEDIUM: {
    icon: AlertCircle,
    iconClass: 'text-amber-600',
    chipClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  LOW: {
    icon: AlertCircle,
    iconClass: 'text-blue-600',
    chipClass: 'border-blue-200 bg-blue-50 text-blue-700',
  },
}

interface ModuleCardProps {
  title: string
  icon: LucideIcon
  value: string | null
  caption: string
  href: string
  attentionCount?: number
  unavailableReason?: string
  stats?: Array<{ label: string; value: string }>
}

function ModuleCard({
  title,
  icon: Icon,
  value,
  caption,
  href,
  attentionCount,
  unavailableReason,
  stats = [],
}: ModuleCardProps) {
  return (
    <Link
      to={href}
      className="group flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4332]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-semibold text-gray-900">{title}</span>
        </span>
        {attentionCount ? (
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800">
            {attentionCount} to review
          </span>
        ) : null}
      </div>

      {value ? (
        <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-gray-900">{value}</p>
      ) : (
        <div className="mt-3">
          <p className="text-2xl font-bold text-gray-400">&mdash;</p>
          <p className="mt-1 text-xs text-gray-500">{unavailableReason ?? 'Not available'}</p>
        </div>
      )}
      <p className="mt-1 text-xs text-gray-500">{caption}</p>

      {stats.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="truncate text-xs text-gray-500">{stat.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-[#1B4332]">
        Open {title}
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  )
}

interface QuickActionProps {
  title: string
  description: string
  href: string
  icon: LucideIcon
  badge?: number
}

function QuickActionCard({ title, description, href, icon: Icon, badge }: QuickActionProps) {
  return (
    <li>
      <Link
        to={href}
        className="group flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4332]"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#EAF3EE] text-[#1B4332]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          {badge ? (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-700">
              {badge}
            </span>
          ) : (
            <ArrowRight
              className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="mt-3 text-sm font-semibold text-gray-900">{title}</span>
        <span className="mt-1 text-xs leading-relaxed text-gray-600">{description}</span>
      </Link>
    </li>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-3">
        <div className="h-8 w-72 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-gray-100" />
      </div>
      <div className="h-52 animate-pulse rounded-lg border border-gray-200 bg-white" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-48 animate-pulse rounded-lg border border-gray-200 bg-white" />
        ))}
      </div>
      <span className="sr-only">Loading home dashboard</span>
    </div>
  )
}

function PortfolioSummary({
  data,
  liquidityData,
  liquidityLoading,
  liquidityError,
  updatedAt,
  onRefresh,
  refreshing,
}: {
  data: DashboardData
  liquidityData?: ConsolidatedHoldingsResponse
  liquidityLoading: boolean
  liquidityError: boolean
  updatedAt: number
  onRefresh: () => void
  refreshing: boolean
}) {
  const partnershipValue = data.kpis.portfolioValueUsd
  const liquidityValue = liquidityData?.kpis.totalMarketValue
  const hasKnownValue = partnershipValue != null || liquidityValue != null
  const totalValue = hasKnownValue ? (partnershipValue ?? 0) + (liquidityValue ?? 0) : null
  const segments = [
    ...(liquidityValue != null && liquidityValue > 0
      ? [{ id: 'liquidity', label: 'Liquid investments', value: liquidityValue }]
      : []),
    ...data.assetClassSummary
      .filter((row) => row.residualValueUsd > 0)
      .map((row) => ({
        id: row.assetClass,
        label: row.assetClass,
        value: row.residualValueUsd,
      })),
  ].map((segment) => ({
    ...segment,
    percent: totalValue && totalValue > 0 ? (segment.value / totalValue) * 100 : 0,
  }))
  const incompleteNotice = liquidityLoading
    ? 'Connected holdings are still loading and are not included in this total yet.'
    : liquidityError
      ? 'Connected holdings could not be loaded and are not included in this total.'
      : null
  const segmentColors = [
    'bg-[#1B4332]',
    'bg-emerald-600',
    'bg-emerald-400',
    'bg-teal-500',
    'bg-blue-500',
    'bg-amber-500',
    'bg-gray-400',
  ]

  return (
    <section
      aria-labelledby="portfolio-summary-title"
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="portfolio-summary-title"
            className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500"
          >
            Total portfolio value
          </h2>
          {totalValue != null ? (
            <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-4xl">
              {formatUsd(totalValue)}
            </p>
          ) : (
            <p className="mt-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600">
              Portfolio value is unavailable until current partnership valuations are recorded.
            </p>
          )}
          <p className="mt-1.5 text-xs text-gray-500">
            {data.kpis.totalPartnerships.toLocaleString()} partnership records &middot;{' '}
            {liquidityLoading
              ? 'Connected accounts loading'
              : liquidityError
                ? 'Connected accounts unavailable'
                : `${(liquidityData?.kpis.selectedAccountCount ?? 0).toLocaleString()} connected accounts`}{' '}
            &middot; As of {formatDate(updatedAt)}
          </p>
          {incompleteNotice ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {incompleteNotice}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4332] disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {segments.length > 0 ? (
        <>
          <div
            className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-gray-100"
            aria-label="Portfolio value by asset class"
          >
            {segments.map((segment, index) => (
              <span
                key={segment.id}
                className={segmentColors[index % segmentColors.length]}
                style={{ width: `${Math.min(Math.max(segment.percent, 0), 100)}%` }}
                title={`${segment.label}: ${segment.percent.toFixed(1)}%`}
              />
            ))}
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {segments.slice(0, 8).map((segment, index) => (
              <div key={segment.id} className="min-w-0">
                <dt className="flex items-center gap-2 text-xs text-gray-600">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${segmentColors[index % segmentColors.length]}`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{segment.label}</span>
                </dt>
                <dd className="mt-1 pl-[18px] text-lg font-semibold tabular-nums text-gray-900">
                  {formatUsd(segment.value)}
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    {segment.percent.toFixed(1)}% of portfolio value
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span>Source: partnership valuations, capital activity, and connected holdings</span>
        <span>Updated {formatTimestamp(updatedAt)}</span>
      </div>
    </section>
  )
}

function ActionItems({ items, onSelect }: { items: OpenIssue[]; onSelect: (item: OpenIssue) => void }) {
  return (
    <section
      id="dashboard-action-items"
      aria-labelledby="action-items-title"
      className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div>
          <h2 id="action-items-title" className="text-sm font-semibold text-gray-900">
            Needs your attention
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">Open review issues across your K-1 records</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-gray-500">
          {items.length} open
        </span>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
          <p className="text-sm text-gray-600">Nothing outstanding right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((item) => {
            const tone = issueTone[item.severity]
            const Icon = tone.icon
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B4332]"
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconClass}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">{item.message}</span>
                    <span className="mt-1 block text-xs text-gray-500">
                      {item.entity} &middot; {item.partnership}
                    </span>
                    <span className="mt-1 block text-xs text-gray-400">
                      Opened {formatDate(item.createdAt)}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.chipClass}`}>
                    {item.severity}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <Link
        to="/k1"
        className="block border-t border-gray-100 px-4 py-2.5 text-sm font-medium text-[#1B4332] transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B4332]"
      >
        Open K-1 workspace
      </Link>
    </section>
  )
}

function RecentActivity({ entries, onSelect }: { entries: RecentK1[]; onSelect: (item: RecentK1) => void }) {
  return (
    <section
      aria-labelledby="recent-activity-title"
      className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      <header className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h2 id="recent-activity-title" className="text-sm font-semibold text-gray-900">
          Recent activity
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">Latest K-1 processing events</p>
      </header>
      {entries.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-600">
          No K-1 activity yet. New uploads appear here.
        </p>
      ) : (
        <ol className="relative px-4 py-2">
          <span
            className="absolute bottom-6 left-[29px] top-6 w-px bg-gray-200"
            aria-hidden="true"
          />
          {entries.map((entry) => (
            <li key={entry.id} className="relative pl-9">
              <span className="absolute left-0 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#EAF3EE] text-[#1B4332]">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className="w-full rounded-md py-3 pl-2 pr-2 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4332]"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0 text-sm font-medium text-gray-900">
                    K-1 {statusLabel[entry.status]}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-500">
                    {formatRelativeTime(entry.uploadedAt)}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-gray-600">
                  {entry.partnership} &middot; {entry.entity}
                </span>
                <span className="mt-1 block text-xs text-gray-400">
                  {entry.taxYear ?? 'Tax year pending'} &middot; {formatTimestamp(entry.uploadedAt)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function MagicPatternDashboardPage() {
  const { session } = useSession()
  const dashboard = useDashboardSummary()
  const liquidity = useLiquiditySummary()
  const navigate = useNavigate()

  const content = (() => {
    if (dashboard.isLoading) return <DashboardSkeleton />
    if (dashboard.isError || !dashboard.data) {
      return (
        <ErrorState
          title="Unable to load your home dashboard"
          message="The portfolio summary could not be loaded."
          onRetry={() => void dashboard.refetch()}
        />
      )
    }

    const data = dashboard.data
    const reviewCount = data.statusCounts.NEEDS_REVIEW + data.statusCounts.READY_FOR_APPROVAL
    const finalizedPercent = data.kpis.totalK1Documents
      ? Math.round((data.kpis.finalizedK1Documents / data.kpis.totalK1Documents) * 100)
      : 0
    const updatedAt = Math.max(dashboard.dataUpdatedAt, liquidity.dataUpdatedAt ?? 0)
    const liquidityKpis = liquidity.data?.kpis
    const connectedAccountCount = liquidityKpis?.selectedAccountCount ?? 0
    const liquidityCaption = liquidity.isLoading
      ? 'Loading connected cash and brokerage accounts'
      : liquidity.isError
        ? 'Connected cash and brokerage accounts unavailable'
        : `${connectedAccountCount.toLocaleString()} connected account${connectedAccountCount === 1 ? '' : 's'}`

    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              {greetingForCurrentHour()}, {displayNameFromEmail(session?.user.email)}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Your portfolio, document work, and open reviews in one place.
            </p>
            <button
              type="button"
              onClick={() => document.getElementById('dashboard-action-items')?.scrollIntoView({ behavior: 'smooth' })}
              className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
                data.kpis.openIssuesCount > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {data.kpis.openIssuesCount > 0 ? (
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              {data.kpis.openIssuesCount > 0
                ? `${data.kpis.openIssuesCount} item${data.kpis.openIssuesCount === 1 ? '' : 's'} need your attention`
                : 'Nothing needs your attention'}
            </button>
          </div>
          <Link
            to="/reports"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#1B4332] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#143426] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4332] focus-visible:ring-offset-2"
          >
            <FileBarChart className="h-4 w-4" aria-hidden="true" />
            Run report
          </Link>
        </header>

        <PortfolioSummary
          data={data}
          liquidityData={liquidity.data}
          liquidityLoading={liquidity.isLoading}
          liquidityError={liquidity.isError}
          updatedAt={updatedAt}
          refreshing={dashboard.isFetching || liquidity.isFetching}
          onRefresh={() => {
            void dashboard.refetch()
            void liquidity.refetch()
          }}
        />

        <section aria-labelledby="modules-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="modules-title" className="text-sm font-semibold text-gray-900">
              Workspace overview
            </h2>
            <p className="text-xs text-gray-500">Live totals from your current access scope</p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ModuleCard
              title="Partnerships"
              icon={Layers3}
              value={formatUsd(data.kpis.portfolioValueUsd)}
              caption={`${data.kpis.totalPartnerships.toLocaleString()} partnership records`}
              href="/partnership-tracker"
              stats={[
                { label: 'Commitment', value: formatUsd(data.kpis.totalCommitmentUsd) ?? '—' },
                { label: 'Unfunded', value: formatUsd(data.kpis.totalUnfundedUsd) ?? '—' },
              ]}
            />
            <ModuleCard
              title="K-1s"
              icon={FileText}
              value={data.kpis.totalK1Documents.toLocaleString()}
              caption={`${finalizedPercent}% finalized`}
              href="/k1"
              attentionCount={reviewCount}
              stats={[
                { label: 'Finalized', value: data.kpis.finalizedK1Documents.toLocaleString() },
                { label: 'Processing', value: data.statusCounts.PROCESSING.toLocaleString() },
              ]}
            />
            <ModuleCard
              title="Entities"
              icon={Building2}
              value={data.kpis.totalEntities.toLocaleString()}
              caption="Entities available to your account"
              href="/entities"
              attentionCount={data.kpis.highSeverityOpenIssues}
              stats={[
                { label: 'Partnerships', value: data.kpis.totalPartnerships.toLocaleString() },
                { label: 'Open issues', value: data.kpis.openIssuesCount.toLocaleString() },
              ]}
            />
            <ModuleCard
              title="Liquidity"
              icon={Wallet}
              value={formatUsd(liquidityKpis?.totalMarketValue)}
              caption={liquidityCaption}
              href="/liquidity"
              unavailableReason={
                liquidity.isLoading
                  ? 'Loading current balances'
                  : liquidity.isError
                    ? 'Unable to load current balances'
                    : connectedAccountCount === 0
                      ? 'Connect accounts to add liquid assets'
                      : 'No market values reported'
              }
              stats={
                liquidityKpis
                  ? [
                      {
                        label: 'Cost basis',
                        value: formatUsd(liquidityKpis.totalCostBasis) ?? 'Not reported',
                      },
                      {
                        label: 'Positions',
                        value: liquidityKpis.uniqueAssetCount.toLocaleString(),
                      },
                    ]
                  : undefined
              }
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="quick-actions-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="quick-actions-title" className="text-sm font-semibold text-gray-900">
                  Quick actions
                </h2>
                <p className="text-xs text-gray-500">Go straight to common workflows</p>
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <QuickActionCard
                  title="Upload or review K-1s"
                  description="Add documents and move records through review."
                  href="/k1"
                  icon={Upload}
                  badge={reviewCount || undefined}
                />
                <QuickActionCard
                  title="Open partnerships"
                  description="Review valuations, commitments, and capital activity."
                  href="/partnership-tracker"
                  icon={CircleDollarSign}
                />
                <QuickActionCard
                  title="Manage entities"
                  description="Maintain ownership records and entity access."
                  href="/entities"
                  icon={Building2}
                />
                <QuickActionCard
                  title="Open liquidity"
                  description="Review connected accounts, allocations, and holdings."
                  href="/liquidity"
                  icon={Wallet}
                />
              </ul>
            </section>

            <RecentActivity
              entries={data.recentK1Activity}
              onSelect={(item) => navigate(`/k1/${item.id}/review`)}
            />
          </div>
          <ActionItems
            items={data.openIssues}
            onSelect={(item) => navigate(`/k1/${item.k1DocumentId}/review`)}
          />
        </div>
      </div>
    )
  })()

  return (
    <AppShell
      currentPath="/dashboard"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <div data-design-variant="magic-patterns-home">{content}</div>
    </AppShell>
  )
}
