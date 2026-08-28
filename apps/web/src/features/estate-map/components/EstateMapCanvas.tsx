import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Landmark,
  Maximize2,
  Minus,
  Network,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'
import type { PartnershipAssetRow } from '../../../../../../packages/types/src/partnership-management'
import type { EntityListItem } from '../../partnerships/api/entitiesClient'
import { entityTypeLabel } from '../../partnerships/entityTypeLabels'
import { MagicStatusBadge } from '../../partnership-tracker/components/magic-patterns/MagicPatternPrimitives'
import {
  estateMapSourceHref,
  formatEstateMoney,
  type EstateMapPartnership,
} from '../estateMapModel'

export interface EstateMapBranchView extends EstateMapPartnership {
  assets: PartnershipAssetRow[]
  assetsLoading: boolean
  assetsError: boolean
}

type SelectedNode =
  | { kind: 'root'; id: string }
  | { kind: 'partnership'; id: string }
  | { kind: 'asset'; id: string; partnershipId: string }

const clampZoom = (value: number) => Math.min(1.4, Math.max(0.6, value))

function relationshipLabel(branch: EstateMapPartnership) {
  return branch.relationships.map((relationship) => {
    if (relationship.kind === 'ownership') {
      return `Ownership ${relationship.ownershipPercent?.toFixed(2) ?? 'â€”'}%`
    }
    return relationship.controlRole || 'Control'
  })
}

function RootNode({
  entity,
  selected,
  onSelect,
}: {
  entity: EntityListItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`relative w-80 rounded-lg border bg-white p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${selected ? 'border-primary bg-primary-subtle ring-1 ring-focus/10' : 'border-slate-300 hover:border-slate-400 hover:shadow-md'}`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MagicStatusBadge tone="success">Main trust / owner</MagicStatusBadge>
            <span className="text-[0.65rem] font-medium uppercase tracking-wide text-slate-500">
              {entityTypeLabel(entity.entityType)}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-slate-950">{entity.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {entity.jurisdiction || 'Jurisdiction not on file'} Â· {entity.status}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs">
        <span className="text-slate-500">Recorded holdings</span>
        <span className="text-right font-mono font-semibold tabular-nums text-slate-900">
          {formatEstateMoney(entity.holdingsValueUsd)}
        </span>
      </div>
    </button>
  )
}

function PartnershipNode({
  branch,
  selected,
  onSelect,
}: {
  branch: EstateMapBranchView
  selected: boolean
  onSelect: () => void
}) {
  const partnership = branch.summary.partnership
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-lg border bg-white p-3.5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${selected ? 'border-primary bg-primary-subtle ring-1 ring-focus/10' : 'border-slate-300 hover:border-slate-400 hover:shadow-md'}`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-700">
          <Building2 className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5 text-slate-950">{partnership.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {partnership.partnershipType} Â· {partnership.status}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {relationshipLabel(branch).map((label) => (
          <MagicStatusBadge key={label} tone={label.startsWith('Ownership') ? 'success' : 'info'}>
            {label}
          </MagicStatusBadge>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5 text-xs">
        <span className="text-slate-500">Latest NAV</span>
        <span className="font-mono font-semibold tabular-nums text-slate-900">
          {formatEstateMoney(branch.summary.latestNav?.amount)}
        </span>
      </div>
    </button>
  )
}

function AssetNode({
  asset,
  selected,
  onSelect,
}: {
  asset: PartnershipAssetRow
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-md border bg-white px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${selected ? 'border-primary bg-primary-subtle' : 'border-slate-200 hover:border-slate-400'}`}
    >
      <div className="flex items-start gap-2.5">
        <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-900" title={asset.name}>
            {asset.name}
          </p>
          <div className="mt-1 flex items-center justify-between gap-2 text-[0.68rem] text-slate-500">
            <span className="truncate">{asset.assetType}</span>
            <span className="shrink-0 font-mono font-medium tabular-nums text-slate-800">
              {formatEstateMoney(asset.latestFmv?.amountUsd)}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

function NodeDetailPanel({
  selected,
  root,
  branches,
  onClose,
}: {
  selected: SelectedNode
  root: EntityListItem
  branches: EstateMapBranchView[]
  onClose: () => void
}) {
  const branch =
    selected.kind === 'partnership'
      ? branches.find((candidate) => candidate.summary.partnership.id === selected.id)
      : selected.kind === 'asset'
        ? branches.find((candidate) => candidate.summary.partnership.id === selected.partnershipId)
        : undefined
  const asset =
    selected.kind === 'asset'
      ? branch?.assets.find((candidate) => candidate.id === selected.id)
      : undefined

  const title =
    selected.kind === 'root'
      ? root.name
      : selected.kind === 'partnership'
        ? branch?.summary.partnership.name
        : asset?.name
  const subtitle =
    selected.kind === 'root'
      ? `${entityTypeLabel(root.entityType)} Â· ${root.jurisdiction || 'Jurisdiction not on file'}`
      : selected.kind === 'partnership'
        ? `${branch?.summary.partnership.partnershipType ?? 'Partnership'} Â· ${branch?.summary.partnership.status ?? ''}`
        : `${asset?.assetType ?? 'Asset'} Â· ${asset?.status ?? ''}`
  const href = selected.kind === 'root'
    ? estateMapSourceHref({ kind: 'root', entityId: root.id })
    : estateMapSourceHref({
        kind: selected.kind,
        partnershipId: branch?.summary.partnership.id ?? '',
      })

  const details =
    selected.kind === 'root'
      ? [
          ['Role on map', 'Main trust / owner'],
          ['Status', root.status],
          ['Partnerships on file', String(root.partnershipCount)],
          ['Recorded holdings', formatEstateMoney(root.holdingsValueUsd)],
        ]
      : selected.kind === 'partnership' && branch
        ? [
            ['Legal owner record', branch.summary.partnership.entity.name],
            ['Relationship', relationshipLabel(branch).join(' Â· ')],
            ['Latest NAV', formatEstateMoney(branch.summary.latestNav?.amount)],
            ['Underlying assets', String(branch.assets.length)],
          ]
        : asset
          ? [
              ['Partnership', branch?.summary.partnership.name ?? 'â€”'],
              ['Status', asset.status],
              ['Latest FMV', formatEstateMoney(asset.latestFmv?.amountUsd)],
              ['Valuation source', asset.latestFmv?.source ?? 'Not valued'],
            ]
          : []

  return (
    <aside
      aria-label={`${title ?? 'Selected node'} details`}
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l border-slate-300 bg-white shadow-xl lg:relative lg:z-auto lg:shrink-0 lg:shadow-none"
    >
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-slate-500">
              {selected.kind === 'root' ? 'Owner record' : selected.kind === 'partnership' ? 'Partnership' : 'Underlying asset'}
            </p>
            <h2 className="mt-1 text-base font-semibold leading-6 text-slate-950">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            aria-label="Close details panel"
            onClick={onClose}
            className="grid min-h-9 min-w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {details.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3 px-3 py-3 text-xs">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        {asset?.description ? (
          <div className="mt-5">
            <h3 className="text-[0.66rem] font-semibold uppercase tracking-wider text-slate-500">Description</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{asset.description}</p>
          </div>
        ) : null}
      </div>
      <footer className="border-t border-slate-200 bg-slate-50 p-4">
        <Link
          to={href}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Open source record
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      </footer>
    </aside>
  )
}

export function EstateMapCanvas({
  root,
  branches,
}: {
  root: EntityListItem
  branches: EstateMapBranchView[]
}) {
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<SelectedNode>()
  const scrollRef = useRef<HTMLDivElement>(null)

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, select')) return
    const element = scrollRef.current
    if (!element) return
    const startX = event.clientX
    const startY = event.clientY
    const startLeft = element.scrollLeft
    const startTop = element.scrollTop
    const move = (moveEvent: PointerEvent) => {
      element.scrollLeft = startLeft - (moveEvent.clientX - startX)
      element.scrollTop = startTop - (moveEvent.clientY - startY)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-slate-100">
      <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Estate map canvas">
        <div
          ref={scrollRef}
          onPointerDown={startPan}
          className="min-h-0 flex-1 cursor-grab overflow-auto active:cursor-grabbing"
        >
          <div className="min-h-full min-w-max px-8 py-8" style={{ zoom }}>
            <div className="mb-5 flex items-center justify-center gap-3 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span className="h-px w-12 bg-slate-300" />
              Main trust / owner
              <span className="h-px w-12 bg-slate-300" />
            </div>
            <div className="flex justify-center">
              <RootNode
                entity={root}
                selected={selected?.kind === 'root'}
                onSelect={() => setSelected({ kind: 'root', id: root.id })}
              />
            </div>

            {branches.length ? (
              <>
                <div className="mx-auto h-8 w-px bg-slate-400" aria-hidden="true" />
                <div className="mx-auto mb-5 flex w-max min-w-full items-center gap-3 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <span className="h-px flex-1 bg-slate-300" />
                  Relationship-linked partnerships
                  <span className="h-px flex-1 bg-slate-300" />
                </div>
                <div className="relative flex min-w-full justify-center gap-5 px-6 pt-6">
                  {branches.length > 1 ? (
                    <div className="absolute left-[calc(9rem+1.5rem)] right-[calc(9rem+1.5rem)] top-0 h-px bg-slate-400" aria-hidden="true" />
                  ) : null}
                  {branches.map((branch) => {
                    const partnershipId = branch.summary.partnership.id
                    return (
                      <section key={partnershipId} className="relative w-72 shrink-0" aria-label={branch.summary.partnership.name}>
                        <div className="absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-slate-400" aria-hidden="true" />
                        <PartnershipNode
                          branch={branch}
                          selected={selected?.kind === 'partnership' && selected.id === partnershipId}
                          onSelect={() => setSelected({ kind: 'partnership', id: partnershipId })}
                        />
                        <div className="mx-auto h-6 w-px bg-slate-300" aria-hidden="true" />
                        <div className="mb-2 flex items-center gap-2 text-[0.63rem] font-semibold uppercase tracking-wider text-slate-500">
                          <span className="h-px flex-1 bg-slate-300" />
                          Assets
                          <span className="h-px flex-1 bg-slate-300" />
                        </div>
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                          {branch.assetsLoading ? (
                            <p className="px-2 py-5 text-center text-xs text-slate-500">Loading assetsâ€¦</p>
                          ) : branch.assetsError ? (
                            <p className="px-2 py-5 text-center text-xs text-red-700">Assets could not be loaded.</p>
                          ) : branch.assets.length ? (
                            branch.assets.map((asset) => (
                              <AssetNode
                                key={asset.id}
                                asset={asset}
                                selected={selected?.kind === 'asset' && selected.id === asset.id}
                                onSelect={() => setSelected({ kind: 'asset', id: asset.id, partnershipId })}
                              />
                            ))
                          ) : (
                            <p className="px-2 py-5 text-center text-xs leading-5 text-slate-500">No underlying assets recorded.</p>
                          )}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="mx-auto mt-10 max-w-xl rounded-lg border border-dashed border-slate-400 bg-white px-6 py-10 text-center shadow-sm">
                <Network className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
                <h2 className="mt-4 text-base font-semibold text-slate-950">No linked partnerships on this map</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Add an ownership or control relationship from {root.name} on a partnership's Relationships section. You can also assign each relationship to specific estate maps there.
                </p>
                <Link
                  to="/investment-tracker"
                  className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Open partnerships
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-300 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />Trust / owner</span>
            <span className="inline-flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5 text-slate-700" />Partnership</span>
            <span className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5 text-emerald-700" />Asset</span>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-1 shadow-sm">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom((value) => clampZoom(Number((value - 0.1).toFixed(1))))} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
            <span className="min-w-12 text-center font-mono text-xs tabular-nums text-slate-700">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 1.4} onClick={() => setZoom((value) => clampZoom(Number((value + 0.1).toFixed(1))))} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
            <button type="button" aria-label="Fit map to view" onClick={() => setZoom(1)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-slate-100"><Maximize2 className="h-4 w-4" /></button>
          </div>
        </footer>
      </section>
      {selected ? (
        <NodeDetailPanel selected={selected} root={root} branches={branches} onClose={() => setSelected(undefined)} />
      ) : null}
    </div>
  )
}
