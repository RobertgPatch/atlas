export type EstateRelationshipKind = 'ownership' | 'control'

export interface EstateRelationshipRecord {
  id: string
  partyId: string
  partyName: string
  kind: EstateRelationshipKind
  ownershipPercent?: number
  controlRole?: string
  effectiveDate: string
  note?: string
  /** Omitted means the relationship appears on every map rooted at this party. */
  estateMapIds?: string[]
}

export interface EstateMapDefinition {
  id: string
  name: string
  rootEntityId: string
  createdAt: string
  updatedAt: string
}

const MAPS_STORAGE_KEY = 'atlas-estate-maps:v1'
const RELATIONSHIP_PREFIX = 'atlas-magic-relationships:'
const MAPS_CHANGED_EVENT = 'atlas:estate-maps-changed'
const RELATIONSHIPS_CHANGED_EVENT = 'atlas:relationships-changed'

export const relationshipStorageKey = (partnershipId: string) =>
  `${RELATIONSHIP_PREFIX}${partnershipId}`

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadPartnershipRelationships(
  partnershipId: string,
): EstateRelationshipRecord[] {
  const records = readJson<unknown>(relationshipStorageKey(partnershipId), [])
  if (!Array.isArray(records)) return []
  return records.filter(
    (record): record is EstateRelationshipRecord =>
      Boolean(
        record &&
          typeof record === 'object' &&
          typeof (record as EstateRelationshipRecord).id === 'string' &&
          typeof (record as EstateRelationshipRecord).partyId === 'string' &&
          ((record as EstateRelationshipRecord).kind === 'ownership' ||
            (record as EstateRelationshipRecord).kind === 'control'),
      ),
  )
}

export function savePartnershipRelationships(
  partnershipId: string,
  records: EstateRelationshipRecord[],
) {
  try {
    writeJson(relationshipStorageKey(partnershipId), records)
    window.dispatchEvent(
      new CustomEvent(RELATIONSHIPS_CHANGED_EVENT, { detail: { partnershipId } }),
    )
  } catch {
    // Local storage can be disabled. The editor still keeps its in-memory state.
  }
}

export function subscribeToRelationshipChanges(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(RELATIONSHIP_PREFIX)) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(RELATIONSHIPS_CHANGED_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(RELATIONSHIPS_CHANGED_EVENT, listener)
  }
}

export function loadEstateMaps(): EstateMapDefinition[] {
  const maps = readJson<unknown>(MAPS_STORAGE_KEY, [])
  if (!Array.isArray(maps)) return []
  return maps.filter(
    (map): map is EstateMapDefinition =>
      Boolean(
        map &&
          typeof map === 'object' &&
          typeof (map as EstateMapDefinition).id === 'string' &&
          typeof (map as EstateMapDefinition).name === 'string' &&
          typeof (map as EstateMapDefinition).rootEntityId === 'string',
      ),
  )
}

export function hasStoredEstateMaps() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MAPS_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function saveEstateMaps(maps: EstateMapDefinition[]) {
  try {
    writeJson(MAPS_STORAGE_KEY, maps)
    window.dispatchEvent(new CustomEvent(MAPS_CHANGED_EVENT))
  } catch {
    // Local storage can be disabled. The page still keeps its in-memory state.
  }
}

export function subscribeToEstateMapChanges(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent) => {
    if (event.key === MAPS_STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(MAPS_CHANGED_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(MAPS_CHANGED_EVENT, listener)
  }
}
