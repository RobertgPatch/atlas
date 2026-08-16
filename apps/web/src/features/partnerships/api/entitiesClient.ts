import type { EntityDetail } from '../../../../../../packages/types/src/partnership-management'

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

export interface EntityListItem {
  id: string
  name: string
  entityType: string
  jurisdiction: string | null
  taxId: string | null
  formedOn: string | null
  status: string
  notes: string | null
  registeredAgent: string | null
  primaryContact: string | null
  ownerCount: number
  partnershipCount: number
  investmentCount: number
  holdingsValueUsd: number
  totalDistributionsUsd: number
}

export type EntityKind = 'llc' | 'trust' | 'corporation' | 'partnership' | 'individual'

export interface CreateEntityInput {
  name: string
  kind: EntityKind
  jurisdiction: string
  taxId: string
  formedOn: string
}

export class EntitiesApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(code)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers, ...init })
  if (!res.ok) {
    let payload: unknown
    try { payload = await res.json() } catch { /* ignore */ }
    const code =
      payload && typeof payload === 'object' && 'error' in (payload as object)
        ? String((payload as { error: unknown }).error)
        : `HTTP_${res.status}`
    throw new EntitiesApiError(code, res.status, payload)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const entitiesClient = {
  get(id: string): Promise<EntityDetail> {
    return request<EntityDetail>(`/entities/${id}`)
  },
  list(): Promise<{ items: EntityListItem[] }> {
    return request<{ items: EntityListItem[] }>(`/entities`)
  },
  create(input: string | CreateEntityInput): Promise<{ id: string; name: string }> {
    const body: CreateEntityInput =
      typeof input === 'string'
        ? { name: input, kind: 'llc', jurisdiction: 'Not on file', taxId: '', formedOn: '' }
        : input
    return request<{ id: string; name: string }>(`/entities`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  update(id: string, name: string): Promise<{ id: string; name: string }> {
    return request<{ id: string; name: string }>(`/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  },
  remove(id: string): Promise<void> {
    return request<void>(`/entities/${id}`, { method: 'DELETE' })
  },
}
