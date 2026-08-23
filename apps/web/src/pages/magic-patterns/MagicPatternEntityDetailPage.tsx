import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Info,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { authClient } from '../../auth/authClient'
import { sessionStore, useSession } from '../../auth/sessionStore'
import { AppShell } from '../../components/shared/AppShell'
import { Button } from '../../components/shared/Button'
import {
  useDeleteEntity,
  useEntityDetail,
  useEntityList,
} from '../../features/partnerships/hooks/useEntityQueries'
import { entityTypeLabel } from '../../features/partnerships/entityTypeLabels'
import { errorMessage } from '../entitiesPageUtils'

type DetailTab = 'overview' | 'owners' | 'partnerships' | 'investments'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const normalizeStatus = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'active') return 'validated' as const
  if (normalized === 'validated') return 'validated' as const
  if (normalized === 'pending') return 'pending' as const
  if (normalized === 'error') return 'error' as const
  if (normalized === 'inactive') return 'inactive' as const
  return 'draft' as const
}

const DesignButton = Button

function StatusChip({ status, compact = false }: { status: string; compact?: boolean }) {
  const normalized = normalizeStatus(status)
  const config = {
    validated: {
      label: 'Validated',
      style: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
      Icon: CheckCircle2,
    },
    draft: {
      label: 'Draft',
      style: 'bg-slate-50 text-slate-600 ring-slate-500/20',
      Icon: CircleDashed,
    },
    pending: {
      label: 'Pending',
      style: 'bg-amber-50 text-amber-700 ring-amber-600/20',
      Icon: Clock,
    },
    error: {
      label: 'Error',
      style: 'bg-red-50 text-red-700 ring-red-600/20',
      Icon: AlertCircle,
    },
    inactive: {
      label: 'Inactive',
      style: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
      Icon: Ban,
    },
  }[normalized]
  const Icon = config.Icon
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${config.style} ${
        compact ? 'gap-1 px-2 py-0.5 text-xs' : 'gap-1.5 px-2.5 py-1 text-sm'
      }`}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden="true" />
      {config.label}
    </span>
  )
}

function Badge({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-none ring-1 ring-inset ${
        primary
          ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
          : 'bg-white text-slate-700 ring-slate-300'
      }`}
    >
      {children}
    </span>
  )
}

function FinancialMetric({
  label,
  value,
  kind = 'current',
  asOf,
  explanation,
  unavailableReason,
}: {
  label: string
  value: string | null
  kind?: 'current' | 'calculated'
  asOf?: string
  explanation?: string
  unavailableReason?: string
}) {
  return (
    <div className="flex min-w-0 flex-col items-start text-left">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5F7185]">
          {label}
        </span>
        {explanation ? (
          <span
            tabIndex={0}
            role="note"
            aria-label={`${label} calculation: ${explanation}`}
            title={explanation}
            className="rounded text-[#5F7185] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {value ? (
        <span className="mt-1.5 font-mono text-xl font-semibold tracking-tight text-[#17263A] tabular-nums">
          {value}
        </span>
      ) : (
        <span className="mt-1.5 inline-flex items-center gap-2 rounded-md border border-dashed border-[#BFCBD9] px-2 py-1 text-sm text-[#5F7185]">
          — <span>{unavailableReason ?? 'Not available'}</span>
        </span>
      )}
      {value && (kind === 'calculated' || asOf) ? (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {kind === 'calculated' ? (
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              Calculated
            </span>
          ) : null}
          {asOf ? <span className="text-xs text-[#5F7185]">{asOf}</span> : null}
        </span>
      ) : null}
    </div>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[#DAE2EC] bg-white text-[#17263A] shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function KeyValueList({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; hint?: string; emphasis?: boolean }>
}) {
  return (
    <dl className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="min-w-0 text-sm text-slate-500">
            <span className={item.emphasis ? 'font-medium text-slate-700' : undefined}>
              {item.label}
            </span>
            {item.hint ? <span className="mt-0.5 block text-xs text-slate-400">{item.hint}</span> : null}
          </dt>
          <dd
            className={`min-w-0 shrink-0 text-right text-sm tabular-nums ${
              item.emphasis ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ConfirmRemoveDialog({
  open,
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  name: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  const close = () => {
    if (!pending) onCancel()
  }
  return (
    <Dialog open={open} onClose={close} className="relative z-[80]" role="alertdialog">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-slate-900/50 transition-opacity duration-150 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 flex items-end justify-center p-4 sm:items-center">
        <DialogPanel
          transition
          className="relative w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-slate-900/5 transition duration-200 ease-out data-[closed]:translate-y-3 data-[closed]:scale-[0.98] data-[closed]:opacity-0"
        >
          <button
            type="button"
            onClick={close}
            disabled={pending}
            aria-label="Close dialog"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex gap-4 p-6 pb-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 pr-6 pt-1">
              <DialogTitle className="text-base font-semibold leading-6 text-slate-900">
                Remove {name}?
              </DialogTitle>
              <p className="mt-1.5 text-sm leading-5 text-slate-600">
                The entity is removed from the directory along with its links to owners, partnerships, and investments. This cannot be undone.
              </p>
            </div>
          </div>
          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
            <DesignButton type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </DesignButton>
            <DesignButton type="button" variant="danger" onClick={() => void onConfirm()} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {pending ? 'Removing…' : 'Remove entity'}
            </DesignButton>
          </footer>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export function MagicPatternEntityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session } = useSession()
  const isAdmin = session?.role === 'Admin'
  const detail = useEntityDetail(id)
  const list = useEntityList()
  const remove = useDeleteEntity()
  const [tab, setTab] = useState<DetailTab>('overview')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const listItem = useMemo(
    () => list.data?.items.find((item) => item.id === id),
    [id, list.data?.items],
  )

  const shellProps = {
    currentPath: '/entities',
    userRole: session?.role ?? 'User',
    userEmail: session?.user.email,
    onSignOut: () => {
      void authClient.logout().finally(() => sessionStore.setUnauthenticated())
    },
    mainClassName: 'bg-[#E7EDF4]',
    magicPatternDesigns: true,
  }

  if (detail.isLoading) {
    return (
      <AppShell {...shellProps} topBarBreadcrumbs={[{ label: 'Entities & Owners' }, { label: 'Loading…' }]}>
        <div className="flex min-h-72 items-center justify-center text-sm text-[#5F7185]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Loading entity…
        </div>
      </AppShell>
    )
  }

  if (detail.isError || !detail.data) {
    return (
      <AppShell {...shellProps} topBarBreadcrumbs={[{ label: 'Entities & Owners' }, { label: 'Not found' }]}>
        <Card className="mx-auto max-w-xl p-6 text-center">
          <h1 className="text-base font-semibold text-[#17263A]">Entity not found</h1>
          <p className="mt-2 text-sm text-[#3E5169]">
            This entity is no longer in the directory. It may have been removed.
          </p>
          <div className="mt-4 flex justify-center">
            <DesignButton variant="secondary" onClick={() => navigate('/entities')}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Entities & Owners
            </DesignButton>
          </div>
        </Card>
      </AppShell>
    )
  }

  const { entity, partnerships, rollup } = detail.data
  const kind = entityTypeLabel(entity.entityType)
  const ownerCount = listItem?.ownerCount ?? 0
  const investmentCount = listItem?.investmentCount ?? 0
  const holdingsValue = listItem?.holdingsValueUsd ?? rollup.totalFmvUsd
  const investmentValue = Math.max(0, holdingsValue - rollup.totalFmvUsd)
  const tabs: Array<{ value: DetailTab; label: string; count?: number }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'owners', label: 'Owners', count: ownerCount },
    { value: 'partnerships', label: 'Partnerships', count: partnerships.length },
    { value: 'investments', label: 'Investments', count: investmentCount },
  ]

  const handleRemove = async () => {
    if (!id) return
    setActionError(null)
    try {
      await remove.mutateAsync(id)
      setConfirmOpen(false)
      navigate('/entities')
    } catch (error) {
      setConfirmOpen(false)
      setActionError(errorMessage(error))
    }
  }

  return (
    <AppShell
      {...shellProps}
      topBarBreadcrumbs={[{ label: 'Entities & Owners' }, { label: entity.name }]}
    >
      <div data-design-variant="magic-patterns-entity-detail">
        <header className="border-b border-[#BFCBD9] pb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-[#17263A]">{entity.name}</h1>
          <p className="mt-1 text-sm text-[#3E5169]">
            {kind} · {entity.jurisdiction ?? 'Jurisdiction not on file'} · EIN {entity.taxId || 'Pending'}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DesignButton variant="secondary" onClick={() => navigate('/entities')}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All entities
            </DesignButton>
            {isAdmin ? (
              <DesignButton variant="danger" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove entity
              </DesignButton>
            ) : null}
          </div>
        </header>

        {actionError ? (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {actionError}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusChip status={entity.status} />
          <Badge primary>{kind}</Badge>
          <Badge>{ownerCount} owners</Badge>
          <Badge>{partnerships.length} partnerships</Badge>
          <Badge>{investmentCount} investments</Badge>
        </div>

        <Card className="mt-6 p-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <FinancialMetric
              label="Holdings value"
              value={holdingsValue > 0 ? formatCurrency(holdingsValue) : null}
              kind="calculated"
              asOf="latest available"
              explanation="Partnership FMV plus the latest investment valuations linked to this entity."
              unavailableReason="No holdings linked to this entity"
            />
            <FinancialMetric
              label="Partnership NAV"
              value={rollup.totalFmvUsd > 0 ? formatCurrency(rollup.totalFmvUsd) : null}
              asOf="latest available"
              unavailableReason="No partnership valuations"
            />
            <FinancialMetric
              label="Investment market value"
              value={investmentValue > 0 ? formatCurrency(investmentValue) : null}
              asOf="latest available"
              unavailableReason="No investments linked"
            />
            <FinancialMetric
              label="Ownership allocated"
              value={null}
              kind="calculated"
              explanation="Sum of all owner percentages on the ownership schedule."
              unavailableReason="No owners recorded"
            />
          </div>
        </Card>

        <div className="mt-6">
          <div role="tablist" aria-label="Entity record sections" className="flex items-end border-b border-gray-200">
            {tabs.map((item) => {
              const selected = item.value === tab
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(item.value)}
                  className={`-mb-px inline-flex items-center justify-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                    selected
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                  {typeof item.count === 'number' ? (
                    <span
                      className={`ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                        selected ? 'bg-primary-subtle text-primary' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {item.count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {tab === 'overview' ? (
            <div role="tabpanel" className="pt-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="p-4 lg:col-span-2">
                  <h2 className="truncate text-sm font-semibold leading-5 text-[#17263A]">Registration details</h2>
                  <p className="mt-1 text-sm leading-5 text-[#5F7185]">Filed record as held in the entity file.</p>
                  <div className="mt-2">
                    <KeyValueList
                      items={[
                        { label: 'Legal name', value: entity.name },
                        { label: 'Entity type', value: kind },
                        { label: 'Jurisdiction', value: entity.jurisdiction ?? 'Not on file' },
                        { label: 'Tax ID (EIN)', value: entity.taxId || 'Pending' },
                        { label: 'Formation date', value: entity.formedOn ?? '—' },
                        { label: 'Registered agent', value: entity.registeredAgent ?? 'Not on file' },
                        { label: 'Primary contact', value: entity.primaryContact ?? 'Not assigned' },
                        { label: 'Record status', value: <StatusChip status={entity.status} compact /> },
                      ]}
                    />
                  </div>
                </Card>

                <div className="flex flex-col gap-6">
                  <Card className="p-4">
                    <h2 className="truncate text-sm font-semibold leading-5 text-[#17263A]">Holdings summary</h2>
                    <div className="mt-2">
                      <KeyValueList
                        items={[
                          {
                            label: 'Partnership interests',
                            value: `${partnerships.length}`,
                            hint: 'Fund and co-investment commitments',
                          },
                          {
                            label: 'Investments',
                            value: `${investmentCount}`,
                            hint: 'Securities, real assets, and direct holdings',
                          },
                          {
                            label: 'Holdings value',
                            value: holdingsValue > 0 ? formatCurrency(holdingsValue) : '—',
                            hint: 'USD, latest available valuations',
                            emphasis: true,
                          },
                        ]}
                      />
                    </div>
                  </Card>
                  <Card className="p-4">
                    <h2 className="text-sm font-semibold text-[#17263A]">Notes</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[#3E5169]">
                      {entity.notes ?? 'No notes recorded for this entity.'}
                    </p>
                  </Card>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'owners' ? (
            <div role="tabpanel" className="pt-6">
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-[#17263A]">Ownership schedule</h2>
                <p className="mt-1 text-sm text-[#5F7185]">Who owns this entity, in what capacity, and at what percentage.</p>
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full min-w-[640px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        {['From', 'Relationship', 'To', 'Percentage'].map((label) => (
                          <th key={label} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${label === 'Percentage' ? 'text-right' : ''}`}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                          No owners recorded yet. Add an owner to complete the ownership schedule.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : null}

          {tab === 'partnerships' ? (
            <div role="tabpanel" className="pt-6">
              <Card className="overflow-hidden">
                <div className="p-4">
                  <h2 className="text-sm font-semibold text-[#17263A]">Partnership interests</h2>
                  <p className="mt-1 text-sm text-[#5F7185]">Fund commitments and co-investments held by this entity.</p>
                </div>
                <div className="overflow-x-auto border-t border-[#DAE2EC]">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#BFCBD9] bg-[#EDF2F8]">
                        {['Partnership', 'Commitment (USD)', 'Capital called (USD)', 'Distributions (USD)', 'NAV (USD)', 'Period', 'Status'].map((label, index) => (
                          <th key={label} className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#3E5169] ${index > 0 && index < 5 ? 'text-right' : 'text-left'}`}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {partnerships.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-10 text-center text-sm text-[#3E5169]">
                            No partnership interests linked to this entity yet.
                          </td>
                        </tr>
                      ) : (
                        partnerships.map((partnership, index) => (
                          <tr key={partnership.id} className={`border-b border-[#DAE2EC] last:border-0 ${index % 2 ? 'bg-[#F4F7FA]' : ''}`}>
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-[#17263A]">{partnership.name}</p>
                              <p className="text-xs text-[#5F7185]">{partnership.assetClass ?? 'Asset class not on file'}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right text-[#5F7185]">—</td>
                            <td className="px-3 py-2.5 text-right text-[#5F7185]">—</td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {partnership.latestDistributionUsd == null ? '—' : formatCurrency(partnership.latestDistributionUsd)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {partnership.latestFmv ? formatCurrency(partnership.latestFmv.amountUsd) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-[#5F7185]">
                              {partnership.latestFmv?.asOfDate ?? (partnership.latestK1Year ? `Tax year ${partnership.latestK1Year}` : '—')}
                            </td>
                            <td className="px-3 py-2.5"><StatusChip status={partnership.status} compact /></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : null}

          {tab === 'investments' ? (
            <div role="tabpanel" className="pt-6">
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-[#17263A]">Investments</h2>
                <p className="mt-1 text-sm text-[#5F7185]">Securities, direct holdings, and real assets owned by this entity.</p>
                <p className="py-10 text-center text-sm text-[#3E5169]">No investments linked to this entity yet.</p>
              </Card>
            </div>
          ) : null}
        </div>

        <ConfirmRemoveDialog
          open={confirmOpen}
          name={entity.name}
          pending={remove.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleRemove}
        />
      </div>
    </AppShell>
  )
}
