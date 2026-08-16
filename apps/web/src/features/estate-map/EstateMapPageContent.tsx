import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { AlertTriangle, Network, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { assetsClient } from '../partnerships/api/assetsClient'
import { useEntityList } from '../partnerships/hooks/useEntityQueries'
import { usePartnershipTrackerList } from '../partnership-tracker/hooks/usePartnershipTracker'
import {
  MagicButton,
  MagicConfirmDialog,
  MagicStatusBadge,
} from '../partnership-tracker/components/magic-patterns/MagicPatternPrimitives'
import { deriveEstateMapPartnerships, selectDefaultRootEntity } from './estateMapModel'
import {
  hasStoredEstateMaps,
  loadEstateMaps,
  loadPartnershipRelationships,
  saveEstateMaps,
  subscribeToEstateMapChanges,
  subscribeToRelationshipChanges,
  type EstateMapDefinition,
} from './estateMapStorage'
import { EstateMapCanvas, type EstateMapBranchView } from './components/EstateMapCanvas'
import { EstateMapEditorDialog } from './components/EstateMapDialogs'

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `estate-map-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createDefaultMap(rootEntityId: string, rootName: string): EstateMapDefinition {
  const timestamp = new Date().toISOString()
  return {
    id: createId(),
    name: rootName.toLowerCase().includes('trust') ? 'Main Trust Estate Map' : `${rootName} Estate Map`,
    rootEntityId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function EstateMapPageContent() {
  const entities = useEntityList()
  const partnerships = usePartnershipTrackerList({ limit: 200 })
  const [maps, setMaps] = useState<EstateMapDefinition[]>(loadEstateMaps)
  const [activeMapId, setActiveMapId] = useState(() => loadEstateMaps()[0]?.id ?? '')
  const [editor, setEditor] = useState<EstateMapDefinition | 'new'>()
  const [deleteTarget, setDeleteTarget] = useState<EstateMapDefinition>()
  const [relationshipRevision, setRelationshipRevision] = useState(0)
  const storageInitialized = useRef(hasStoredEstateMaps())

  useEffect(
    () => subscribeToRelationshipChanges(() => setRelationshipRevision((value) => value + 1)),
    [],
  )
  useEffect(
    () => subscribeToEstateMapChanges(() => setMaps(loadEstateMaps())),
    [],
  )

  const entityItems = useMemo(() => entities.data?.items ?? [], [entities.data?.items])
  useEffect(() => {
    if (storageInitialized.current || entityItems.length === 0 || maps.length > 0) return
    const root = selectDefaultRootEntity(entityItems)
    if (!root) return
    const defaultMap = createDefaultMap(root.id, root.name)
    storageInitialized.current = true
    saveEstateMaps([defaultMap])
  }, [entityItems, maps.length])

  const partnershipItems = useMemo(
    () => partnerships.data?.items ?? [],
    [partnerships.data?.items],
  )
  const resolvedActiveMapId = maps.some((map) => map.id === activeMapId)
    ? activeMapId
    : maps[0]?.id ?? ''
  const activeMap = maps.find((map) => map.id === resolvedActiveMapId)
  const root = entityItems.find((entity) => entity.id === activeMap?.rootEntityId)

  const mapBranches = useMemo(() => {
    void relationshipRevision
    if (!activeMap) return []
    return deriveEstateMapPartnerships(
      partnershipItems,
      activeMap.rootEntityId,
      activeMap.id,
      loadPartnershipRelationships,
    )
  }, [activeMap, partnershipItems, relationshipRevision])

  const assetQueries = useQueries({
    queries: mapBranches.map((branch) => ({
      queryKey: ['partnership-assets', branch.summary.partnership.id],
      queryFn: () => assetsClient.list(branch.summary.partnership.id),
    })),
  })

  const branches: EstateMapBranchView[] = mapBranches.map((branch, index) => ({
    ...branch,
    assets: assetQueries[index]?.data?.rows ?? [],
    assetsLoading: assetQueries[index]?.isLoading ?? false,
    assetsError: assetQueries[index]?.isError ?? false,
  }))

  const countsByMap = useMemo(
    () => {
      void relationshipRevision
      return new Map(
        maps.map((map) => [
          map.id,
          deriveEstateMapPartnerships(
            partnershipItems,
            map.rootEntityId,
            map.id,
            loadPartnershipRelationships,
          ).length,
        ]),
      )
    },
    [maps, partnershipItems, relationshipRevision],
  )

  const persistMaps = (nextMaps: EstateMapDefinition[]) => {
    setMaps(nextMaps)
    saveEstateMaps(nextMaps)
  }

  const saveEditor = ({ name, rootEntityId }: { name: string; rootEntityId: string }) => {
    const timestamp = new Date().toISOString()
    if (editor === 'new') {
      const nextMap: EstateMapDefinition = {
        id: createId(),
        name,
        rootEntityId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      persistMaps([...maps, nextMap])
      setActiveMapId(nextMap.id)
    } else if (editor) {
      persistMaps(
        maps.map((map) =>
          map.id === editor.id ? { ...map, name, rootEntityId, updatedAt: timestamp } : map,
        ),
      )
    }
    setEditor(undefined)
  }

  const loading = entities.isLoading || partnerships.isLoading
  const failed = entities.isError || partnerships.isError

  return (
    <div
      className="-m-4 flex h-[calc(100vh-4rem)] min-h-[42rem] flex-col bg-slate-100 sm:-m-6 lg:-m-8"
      data-testid="estate-map-page"
    >
      <header className="shrink-0 border-b border-slate-300 bg-white px-5 py-4 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">Estate Maps</h1>
              {activeMap ? <MagicStatusBadge tone="calculated">Relationship-driven</MagicStatusBadge> : null}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
              Create focused maps for each trust or owner. Entity, partnership, relationship, and underlying-asset records remain the source of truth.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeMap ? (
              <>
                <MagicButton type="button" variant="secondary" onClick={() => setEditor(activeMap)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit map
                </MagicButton>
                <MagicButton type="button" variant="ghost" onClick={() => setDeleteTarget(activeMap)}>
                  <Trash2 className="h-4 w-4 text-red-700" aria-hidden="true" />
                  Delete
                </MagicButton>
              </>
            ) : null}
            <MagicButton type="button" onClick={() => setEditor('new')} disabled={entityItems.length === 0}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New map
            </MagicButton>
          </div>
        </div>
      </header>

      {maps.length ? (
        <nav aria-label="Estate maps" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-300 bg-slate-50 px-5 py-2.5 lg:px-8">
          {maps.map((map) => {
            const mapRoot = entityItems.find((entity) => entity.id === map.rootEntityId)
            const active = map.id === resolvedActiveMapId
            return (
              <button
                key={map.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveMapId(map.id)}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${active ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
              >
                <Network className="h-4 w-4" aria-hidden="true" />
                <span className="max-w-56 truncate font-semibold">{map.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {countsByMap.get(map.id) ?? 0}
                </span>
                <span className="sr-only">Root: {mapRoot?.name ?? 'Deleted entity'}</span>
              </button>
            )
          })}
        </nav>
      ) : null}

      {loading ? (
        <div className="grid min-h-0 flex-1 place-items-center bg-slate-100">
          <div className="text-center text-sm text-slate-600">
            <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-slate-400" aria-hidden="true" />
            Building estate maps from current records…
          </div>
        </div>
      ) : failed ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-700" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-slate-950">Estate map data could not be loaded</h2>
            <p className="mt-2 text-sm text-slate-600">Retry the entity and partnership requests to rebuild the map.</p>
            <MagicButton type="button" className="mt-5" onClick={() => void Promise.all([entities.refetch(), partnerships.refetch()])}>
              Retry
            </MagicButton>
          </div>
        </div>
      ) : !maps.length ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          <div className="max-w-xl rounded-xl border border-slate-300 bg-white px-8 py-10 text-center shadow-sm">
            <Network className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold text-slate-950">Create your first estate map</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Start with the main trust or owner. The map will automatically include the partnerships linked to that record in each partnership's Relationships section.
            </p>
            <MagicButton type="button" className="mt-6" onClick={() => setEditor('new')} disabled={entityItems.length === 0}>
              <Plus className="h-4 w-4" />Create estate map
            </MagicButton>
            {entityItems.length === 0 ? <p className="mt-3 text-xs text-amber-800">Create an entity or individual first.</p> : null}
          </div>
        </div>
      ) : !root ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          <div className="max-w-lg rounded-lg border border-amber-300 bg-white p-6 text-center shadow-sm">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-700" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-slate-950">The map's root record is no longer available</h2>
            <p className="mt-2 text-sm text-slate-600">Edit this map and select another trust, entity, or individual.</p>
            <MagicButton type="button" className="mt-5" onClick={() => activeMap && setEditor(activeMap)}>Choose a new root</MagicButton>
          </div>
        </div>
      ) : (
        <EstateMapCanvas key={resolvedActiveMapId} root={root} branches={branches} />
      )}

      {editor ? (
        <EstateMapEditorDialog
          key={editor === 'new' ? 'new' : editor.id}
          map={editor === 'new' ? undefined : editor}
          entities={entityItems}
          defaultRootEntityId={selectDefaultRootEntity(entityItems)?.id}
          onClose={() => setEditor(undefined)}
          onSave={saveEditor}
        />
      ) : null}
      <MagicConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? 'estate map'}?`}
        description={<>This removes only the saved map view. Your entities, relationships, partnerships, assets, and financial history remain unchanged.</>}
        confirmLabel="Delete map"
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={() => {
          if (!deleteTarget) return
          const nextMaps = maps.filter((map) => map.id !== deleteTarget.id)
          persistMaps(nextMaps)
          if (resolvedActiveMapId === deleteTarget.id) setActiveMapId(nextMaps[0]?.id ?? '')
          setDeleteTarget(undefined)
        }}
      />
    </div>
  )
}
