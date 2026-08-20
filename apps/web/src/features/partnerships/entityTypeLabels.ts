import type { EntityKind } from './api/entitiesClient'

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  llc: 'LLC',
  trust: 'Trust',
  corporation: 'Corporation',
  partnership: 'Holding Partnership / Family LP',
  individual: 'Individual',
}

export function normalizeEntityKind(value: string): EntityKind {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'trust') return 'trust'
  if (normalized === 'corporation' || normalized === 'corp') return 'corporation'
  if (normalized === 'partnership' || normalized === 'lp' || normalized === 'llp') {
    return 'partnership'
  }
  if (normalized === 'individual') return 'individual'
  return 'llc'
}

export const entityTypeLabel = (value: string) => ENTITY_KIND_LABELS[normalizeEntityKind(value)]
