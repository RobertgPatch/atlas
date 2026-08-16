import { useMemo, useState } from 'react'
import {
  Banknote,
  Building2,
  Gem,
  Landmark,
  LineChart,
  Pencil,
  PieChart,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import type {
  AssetFmvSource,
  PartnershipAssetCategory,
  PartnershipAssetRow,
} from '../../../../../../../packages/types/src/partnership-management'
import {
  ASSET_CATEGORY_BY_ID,
  ASSET_CATEGORY_DEFINITIONS,
  categoryForAsset,
} from '../../../partnerships/assetCategories'
import {
  useCreatePartnershipAsset,
  useDeletePartnershipAsset,
  useRecordAssetFmvSnapshot,
  useUpdatePartnershipAsset,
} from '../../../partnerships/hooks/useAssetMutations'
import { usePartnershipAssets } from '../../../partnerships/hooks/useAssetQueries'
import {
  MagicButton,
  MagicCard,
  MagicConfirmDialog,
  MagicModal,
  MagicStatusBadge,
  mpInputClass,
  mpLabelClass,
} from './MagicPatternPrimitives'

const CATEGORY_ICONS = {
  real_estate: Building2,
  marketable_securities: LineChart,
  alternatives: PieChart,
  cash_equivalents: Banknote,
  other: Gem,
} satisfies Record<PartnershipAssetCategory, typeof Building2>

const CATEGORY_TONES: Record<PartnershipAssetCategory, string> = {
  real_estate: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  marketable_securities: 'border-blue-200 bg-blue-50 text-blue-800',
  alternatives: 'border-violet-200 bg-violet-50 text-violet-800',
  cash_equivalents: 'border-slate-300 bg-slate-100 text-slate-700',
  other: 'border-amber-200 bg-amber-50 text-amber-800',
}

const FMV_SOURCES: Array<{ value: AssetFmvSource; label: string }> = [
  { value: 'manual', label: 'Manual estimate' },
  { value: 'manager_statement', label: 'Manager statement' },
  { value: 'valuation_409a', label: 'Valuation / appraisal' },
  { value: 'k1', label: 'K-1' },
  { value: 'imported', label: 'Imported' },
  { value: 'plaid', label: 'Linked account' },
]

const today = () => new Date().toISOString().slice(0, 10)
const money = (amount: number | null | undefined) => amount == null
  ? 'Not valued'
  : new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: Math.abs(amount) >= 1_000_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(amount) >= 1_000_000 ? 1 : 0,
    }).format(amount)

function AssetEditor({
  partnershipId,
  asset,
  onClose,
}: {
  partnershipId: string
  asset?: PartnershipAssetRow
  onClose: () => void
}) {
  const create = useCreatePartnershipAsset(partnershipId)
  const update = useUpdatePartnershipAsset(partnershipId)
  const initialCategory = asset ? categoryForAsset(asset) : 'real_estate'
  const [name, setName] = useState(asset?.name ?? '')
  const [assetCategory, setAssetCategory] = useState<PartnershipAssetCategory>(initialCategory)
  const [assetType, setAssetType] = useState(asset?.assetType ?? ASSET_CATEGORY_BY_ID.get(initialCategory)!.defaultAssetType)
  const [displayDetail, setDisplayDetail] = useState(asset?.displayDetail ?? '')
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(asset?.status ?? 'ACTIVE')
  const [description, setDescription] = useState(asset?.description ?? '')
  const [notes, setNotes] = useState(asset?.notes ?? '')
  const [includeValuation, setIncludeValuation] = useState(!asset)
  const [valuationDate, setValuationDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [valuationSource, setValuationSource] = useState<AssetFmvSource>('manual')
  const [error, setError] = useState<string>()
  const category = ASSET_CATEGORY_BY_ID.get(assetCategory)!
  const pending = create.isPending || update.isPending

  const changeCategory = (next: PartnershipAssetCategory) => {
    setAssetCategory(next)
    setAssetType(ASSET_CATEGORY_BY_ID.get(next)!.defaultAssetType)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (!name.trim()) return setError('Enter an asset name.')
    const parsedAmount = Number(amount)
    if (!asset && includeValuation && (!amount || !Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      return setError('Enter a valid non-negative fair market value.')
    }
    try {
      const common = {
        name: name.trim(),
        assetCategory,
        assetType,
        displayDetail: displayDetail.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
      }
      const result = asset
        ? await update.mutateAsync({ assetId: asset.id, body: { ...common, status } })
        : await create.mutateAsync({
            ...common,
            initialValuation: includeValuation
              ? { valuationDate, amountUsd: parsedAmount, source: valuationSource }
              : null,
          })
      if ('kind' in result) return setError('An asset with this name and type already exists in the partnership.')
      onClose()
    } catch {
      setError('The asset could not be saved. Try again.')
    }
  }

  return (
    <MagicModal
      open
      onClose={onClose}
      size="lg"
      title={asset ? 'Edit underlying asset' : 'Add underlying asset'}
      description="These fields drive the category columns, labels, and values shown on the estate map."
      footer={<><MagicButton type="button" variant="secondary" onClick={onClose}>Cancel</MagicButton><MagicButton type="submit" form="underlying-asset-form" disabled={pending}>{pending ? 'Saving…' : asset ? 'Save changes' : 'Add asset'}</MagicButton></>}
    >
      <form id="underlying-asset-form" onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="text-sm font-semibold text-slate-950">Estate map category</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {ASSET_CATEGORY_DEFINITIONS.map((option) => {
              const Icon = CATEGORY_ICONS[option.id]
              return <button key={option.id} type="button" aria-pressed={assetCategory === option.id} onClick={() => changeCategory(option.id)} className={`rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${assetCategory === option.id ? CATEGORY_TONES[option.id] : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}><Icon className="h-4 w-4" /><span className="mt-2 block text-xs font-semibold leading-4">{option.label}</span></button>
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">{category.description}</p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={mpLabelClass}>Asset name <span className="text-red-700">*</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="1230 Park Avenue" className={mpInputClass} /></label>
          <label className={mpLabelClass}>Asset type <span className="text-red-700">*</span><select required value={assetType} onChange={(event) => setAssetType(event.target.value)} className={mpInputClass}>{category.assetTypes.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label className={mpLabelClass}>{category.detailLabel}<input value={displayDetail} onChange={(event) => setDisplayDetail(event.target.value)} placeholder={category.detailPlaceholder} className={mpInputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">Displayed directly beneath the asset name on the estate map.</span></label>
          {asset ? <label className={mpLabelClass}>Status<select value={status} onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE')} className={mpInputClass}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={mpLabelClass}>Description <span className="font-normal text-slate-500">Optional</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className={`${mpInputClass} py-2`} /></label>
          <label className={mpLabelClass}>Internal notes <span className="font-normal text-slate-500">Optional</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${mpInputClass} py-2`} /></label>
        </div>
        {!asset ? <section className="rounded-md border border-slate-300 bg-slate-50 p-4"><label className="flex items-center gap-3 text-sm font-semibold text-slate-900"><input type="checkbox" checked={includeValuation} onChange={(event) => setIncludeValuation(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700" />Record the current fair market value</label>{includeValuation ? <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className={mpLabelClass}>Valuation date<input type="date" max={today()} required value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} className={mpInputClass} /></label><label className={mpLabelClass}>Fair market value (USD)<input type="number" min="0" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className={mpInputClass} /></label><label className={mpLabelClass}>Source<select value={valuationSource} onChange={(event) => setValuationSource(event.target.value as AssetFmvSource)} className={mpInputClass}>{FMV_SOURCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div> : null}</section> : null}
        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      </form>
    </MagicModal>
  )
}

function ValuationEditor({ partnershipId, asset, onClose }: { partnershipId: string; asset: PartnershipAssetRow; onClose: () => void }) {
  const record = useRecordAssetFmvSnapshot(partnershipId, asset.id)
  const [valuationDate, setValuationDate] = useState(today())
  const [amount, setAmount] = useState(asset.latestFmv ? String(asset.latestFmv.amountUsd) : '')
  const [source, setSource] = useState<AssetFmvSource>('manual')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed < 0) return setError('Enter a valid non-negative fair market value.')
    try {
      await record.mutateAsync({ valuationDate, amountUsd: parsed, source, note: note.trim() || null })
      onClose()
    } catch {
      setError('The valuation could not be recorded. Try again.')
    }
  }
  return <MagicModal open onClose={onClose} size="md" title={`Record value for ${asset.name}`} description="Valuations are append-only; the newest recorded snapshot becomes the value shown on the estate map." footer={<><MagicButton type="button" variant="secondary" onClick={onClose}>Cancel</MagicButton><MagicButton type="submit" form="asset-valuation-form" disabled={record.isPending}>{record.isPending ? 'Recording…' : 'Record valuation'}</MagicButton></>}><form id="asset-valuation-form" onSubmit={submit} className="space-y-4"><label className={mpLabelClass}>Valuation date<input type="date" max={today()} required value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} className={mpInputClass} /></label><label className={mpLabelClass}>Fair market value (USD)<input autoFocus type="number" min="0" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className={mpInputClass} /></label><label className={mpLabelClass}>Source<select value={source} onChange={(event) => setSource(event.target.value as AssetFmvSource)} className={mpInputClass}>{FMV_SOURCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className={mpLabelClass}>Valuation note <span className="font-normal text-slate-500">Optional</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className={`${mpInputClass} py-2`} /></label>{error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}</form></MagicModal>
}

export function MagicPatternUnderlyingAssets({
  partnershipId,
  partnershipName,
  canEdit,
  onOpenRelationships,
}: {
  partnershipId: string
  partnershipName: string
  canEdit: boolean
  onOpenRelationships?: () => void
}) {
  const assets = usePartnershipAssets(partnershipId)
  const remove = useDeletePartnershipAsset(partnershipId)
  const [filter, setFilter] = useState<'all' | PartnershipAssetCategory>('all')
  const [editor, setEditor] = useState<'new' | PartnershipAssetRow>()
  const [valuationTarget, setValuationTarget] = useState<PartnershipAssetRow>()
  const [deleteTarget, setDeleteTarget] = useState<PartnershipAssetRow>()
  const rows = assets.data?.rows ?? []
  const activeRows = rows.filter((asset) => asset.status === 'ACTIVE')
  const totalValue = activeRows.reduce((sum, asset) => sum + (asset.latestFmv?.amountUsd ?? 0), 0)
  const visibleRows = filter === 'all' ? rows : rows.filter((asset) => categoryForAsset(asset) === filter)
  const summaries = useMemo(() => ASSET_CATEGORY_DEFINITIONS.map((category) => {
    const categoryRows = activeRows.filter((asset) => categoryForAsset(asset) === category.id)
    const value = categoryRows.reduce((sum, asset) => sum + (asset.latestFmv?.amountUsd ?? 0), 0)
    return { ...category, rows: categoryRows, value, percentage: totalValue > 0 ? value / totalValue : 0 }
  }), [activeRows, totalValue])

  if (assets.isLoading) return <MagicCard className="grid min-h-72 place-items-center"><RefreshCw className="h-6 w-6 animate-spin text-slate-400 motion-reduce:animate-none" /></MagicCard>
  if (assets.isError) return <MagicCard className="border-red-200 bg-red-50 p-6"><h2 className="font-semibold text-red-900">Underlying assets could not be loaded</h2><p className="mt-1 text-sm text-red-800">The partnership remains available. Retry just this asset request.</p><MagicButton type="button" className="mt-4" onClick={() => void assets.refetch()}>Retry</MagicButton></MagicCard>

  return <div className="space-y-5">
    <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 bg-slate-50 px-5 py-4"><div><div className="flex items-center gap-2"><h2 className="text-base font-semibold text-slate-950">Underlying assets</h2><MagicStatusBadge tone="calculated">Estate map source</MagicStatusBadge></div><p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">Record each holding inside {partnershipName}. Category, map detail, and latest FMV populate the lower tier of every estate map containing this partnership.</p></div>{canEdit ? <MagicButton type="button" onClick={() => setEditor('new')}><Plus className="h-4 w-4" />Add asset</MagicButton> : null}</div><div className="grid gap-px bg-slate-200 sm:grid-cols-3"><div className="bg-white px-5 py-4"><p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Latest asset FMV</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-950">{money(assets.data?.summary.totalLatestAssetFmvUsd)}</p></div><div className="bg-white px-5 py-4"><p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Assets on file</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-950">{assets.data?.summary.assetCount ?? 0}</p></div><div className="bg-white px-5 py-4"><p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Valuation coverage</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-950">{assets.data?.summary.valuedAssetCount ?? 0} / {assets.data?.summary.assetCount ?? 0}</p></div></div></MagicCard>

    <section aria-labelledby="asset-category-heading"><div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="asset-category-heading" className="text-sm font-semibold text-slate-950">Estate map categories</h2><p className="mt-1 text-xs text-slate-500">Active assets only. Percentages are based on the latest valued assets.</p></div></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{summaries.map((summary) => { const Icon = CATEGORY_ICONS[summary.id]; return <button key={summary.id} type="button" onClick={() => setFilter(summary.id)} className={`rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${filter === summary.id ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-300'}`}><div className="flex items-start justify-between gap-3"><span className={`grid h-9 w-9 place-items-center rounded-md border ${CATEGORY_TONES[summary.id]}`}><Icon className="h-4 w-4" /></span><span className="font-mono text-xs font-semibold tabular-nums text-slate-600">{(summary.percentage * 100).toFixed(1)}%</span></div><h3 className="mt-3 text-sm font-semibold text-slate-950">{summary.mapLabel}</h3><p className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-950">{money(summary.value || null)}</p><p className="mt-1 text-xs text-slate-500">{summary.rows.length} {summary.rows.length === 1 ? 'asset' : 'assets'}</p></button> })}</div></section>

    <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50 px-5 py-3"><div><h2 className="text-sm font-semibold text-slate-950">Asset register</h2><p className="mt-1 text-xs text-slate-500">Latest value per asset; valuation history remains append-only.</p></div><div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter assets by category"><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === 'all' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>All <span className="font-mono">{rows.length}</span></button>{summaries.map((summary) => <button key={summary.id} type="button" aria-pressed={filter === summary.id} onClick={() => setFilter(summary.id)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === summary.id ? CATEGORY_TONES[summary.id] : 'border-slate-300 bg-white text-slate-700'}`}>{summary.label} <span className="font-mono">{rows.filter((asset) => categoryForAsset(asset) === summary.id).length}</span></button>)}</div></div>
      {visibleRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[68rem] text-left text-sm"><thead><tr className="border-b border-slate-300 bg-slate-100 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600"><th className="px-5 py-2">Asset</th><th className="px-5 py-2">Estate map category</th><th className="px-5 py-2">Type / map detail</th><th className="px-5 py-2 text-right">Latest FMV</th><th className="px-5 py-2">Valuation date</th><th className="px-5 py-2">Status</th><th className="w-36 px-5 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{visibleRows.map((asset, index) => { const category = categoryForAsset(asset); const definition = ASSET_CATEGORY_BY_ID.get(category)!; return <tr key={asset.id} className={`border-b border-slate-200 ${index % 2 ? 'bg-slate-50' : 'bg-white'}`}><td className="px-5 py-3"><p className="font-semibold text-slate-950">{asset.name}</p><p className="mt-0.5 max-w-xs truncate text-xs text-slate-500" title={asset.description ?? undefined}>{asset.description ?? 'No description'}</p></td><td className="px-5 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${CATEGORY_TONES[category]}`}>{definition.mapLabel}</span></td><td className="px-5 py-3"><p className="text-slate-800">{asset.assetType}</p><p className="mt-0.5 text-xs text-slate-500">{asset.displayDetail || 'No map detail'}</p></td><td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-950">{money(asset.latestFmv?.amountUsd)}</td><td className="px-5 py-3 font-mono text-xs text-slate-700">{asset.latestFmv ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${asset.latestFmv.valuationDate}T00:00:00Z`)) : '—'}</td><td className="px-5 py-3"><MagicStatusBadge tone={asset.status === 'ACTIVE' ? 'success' : 'neutral'}>{asset.status === 'ACTIVE' ? 'Active' : 'Inactive'}</MagicStatusBadge></td><td className="px-5 py-3"><div className="flex justify-end gap-1">{canEdit ? <><button type="button" aria-label={`Record valuation for ${asset.name}`} onClick={() => setValuationTarget(asset)} className="grid min-h-9 min-w-9 place-items-center rounded text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"><Landmark className="h-4 w-4" /></button><button type="button" aria-label={`Edit ${asset.name}`} onClick={() => setEditor(asset)} className="grid min-h-9 min-w-9 place-items-center rounded text-slate-600 hover:bg-blue-50 hover:text-blue-800"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`Delete ${asset.name}`} onClick={() => setDeleteTarget(asset)} className="grid min-h-9 min-w-9 place-items-center rounded text-slate-600 hover:bg-red-50 hover:text-red-800"><Trash2 className="h-4 w-4" /></button></> : null}</div></td></tr>})}</tbody></table></div> : <div className="px-6 py-12 text-center"><Gem className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 text-sm font-semibold text-slate-950">{rows.length ? 'No assets in this category' : 'No underlying assets recorded'}</h3><p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">{rows.length ? 'Choose another category or show all assets.' : 'Add real estate, marketable securities, alternatives, cash and equivalents, or other assets to populate the lowest estate-map tier.'}</p>{canEdit && !rows.length ? <MagicButton type="button" className="mt-5" onClick={() => setEditor('new')}><Plus className="h-4 w-4" />Add first asset</MagicButton> : null}</div>}
    </MagicCard>

    <MagicCard className="border-blue-200 bg-blue-50 p-5"><h2 className="text-sm font-semibold text-blue-950">How this partnership reaches the estate map</h2><ol className="mt-3 grid gap-3 text-sm text-blue-950 md:grid-cols-3"><li className="rounded-md border border-blue-200 bg-white/70 p-3"><strong className="block">1. Family, trusts, and entities</strong><span className="mt-1 block text-xs leading-5 text-blue-800">Create the people, trusts, LLCs, and partnerships in Entities.</span></li><li className="rounded-md border border-blue-200 bg-white/70 p-3"><strong className="block">2. Ownership and control</strong><span className="mt-1 block text-xs leading-5 text-blue-800">Use the Relationships panel on Overview to link family and trusts to this holding structure.</span>{onOpenRelationships ? <button type="button" onClick={onOpenRelationships} className="mt-2 text-xs font-semibold text-blue-800 underline underline-offset-2">Open relationships</button> : null}</li><li className="rounded-md border border-blue-200 bg-white/70 p-3"><strong className="block">3. Underlying assets</strong><span className="mt-1 block text-xs leading-5 text-blue-800">The register above supplies the five category columns and their latest values.</span></li></ol></MagicCard>

    {editor ? <AssetEditor key={editor === 'new' ? 'new' : editor.id} partnershipId={partnershipId} asset={editor === 'new' ? undefined : editor} onClose={() => setEditor(undefined)} /> : null}
    {valuationTarget ? <ValuationEditor key={valuationTarget.id} partnershipId={partnershipId} asset={valuationTarget} onClose={() => setValuationTarget(undefined)} /> : null}
    <MagicConfirmDialog open={Boolean(deleteTarget)} title={`Delete ${deleteTarget?.name ?? 'this asset'}?`} description={<>This permanently removes the asset and all of its valuation history. The partnership itself is not changed.</>} confirmLabel="Delete asset" pending={remove.isPending} onClose={() => setDeleteTarget(undefined)} onConfirm={async () => { if (!deleteTarget) return; await remove.mutateAsync(deleteTarget.id); setDeleteTarget(undefined) }} />
  </div>
}
