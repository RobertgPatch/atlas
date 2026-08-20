import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePartnershipTrackerDetail } from '../../hooks/usePartnershipTracker'
import { MagicPatternPartnershipIndex } from './MagicPatternPartnershipIndex'
import {
  MagicPatternPartnershipWorkspace,
  type MagicWorkspaceArea,
} from './MagicPatternPartnershipWorkspace'
import { MagicButton, MagicCard } from './MagicPatternPrimitives'

const validAreas = new Set<MagicWorkspaceArea>([
  'overview',
  'capital-activity',
  'valuations',
  'k1-history',
  'underlying-assets',
])

export function MagicPatternPartnershipTrackerPageContent({ canEdit }: { canEdit: boolean }) {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('partnership') ?? undefined
  const detail = usePartnershipTrackerDetail(selectedId)
  const rawArea = params.get('area')
  const area: MagicWorkspaceArea = rawArea && validAreas.has(rawArea as MagicWorkspaceArea)
    ? rawArea as MagicWorkspaceArea
    : rawArea === 'cash-activity'
      ? 'capital-activity'
    : rawArea === 'k1'
      ? 'k1-history'
      : rawArea === 'capital'
        ? 'valuations'
        : rawArea === 'assets'
          ? 'underlying-assets'
          : 'overview'
  const rawYear = Number(params.get('year'))
  const selectedYear = Number.isInteger(rawYear) && rawYear >= 1900 && rawYear <= 2100 ? rawYear : undefined

  const updateUrl = useCallback((changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }, [params, setParams])

  if (!selectedId) {
    return <MagicPatternPartnershipIndex canEdit={canEdit} onOpen={(id) => updateUrl({ partnership: id, area: 'overview', year: undefined })} />
  }

  if (detail.isLoading) {
    return <MagicCard className="grid min-h-80 place-items-center" data-testid="magic-partnership-loading"><Loader2 className="h-7 w-7 animate-spin text-slate-400 motion-reduce:animate-none" /></MagicCard>
  }

  if (detail.isError || !detail.data) {
    return <MagicCard className="border-red-200 bg-red-50 p-6" data-testid="magic-partnership-error"><div className="flex gap-3 text-red-900"><AlertTriangle className="h-5 w-5 shrink-0" /><div><h1 className="font-semibold">Failed to load partnership</h1><p className="mt-1 text-sm">The selected partnership could not be loaded. It may have been deleted or your access may have changed.</p></div></div><div className="mt-4 flex gap-2"><MagicButton type="button" variant="secondary" onClick={() => void detail.refetch()}><RefreshCw className="h-4 w-4" />Try again</MagicButton><MagicButton type="button" variant="ghost" onClick={() => updateUrl({ partnership: undefined, area: undefined, year: undefined })}>All partnerships</MagicButton></div></MagicCard>
  }

  return <MagicPatternPartnershipWorkspace
    detail={detail.data}
    canEdit={canEdit}
    area={area}
    selectedYear={selectedYear}
    onAreaChange={(nextArea) => updateUrl({ area: nextArea, year: nextArea === 'k1-history' ? params.get('year') ?? undefined : undefined })}
    onYearChange={(year) => updateUrl({ area: 'k1-history', year: String(year) })}
    onBack={() => updateUrl({ partnership: undefined, area: undefined, year: undefined })}
    onDeleted={() => updateUrl({ partnership: undefined, area: undefined, year: undefined })}
  />
}
