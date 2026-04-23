import type {
  K1DocumentSummary,
  K1Kpis,
  K1ListResponse,
  K1Status,
  K1UploadResponse,
} from '../../../../../../packages/types/src/k1-ingestion'

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

// --- Status mapping ----------------------------------------------------------
// Existing shared components use lowercase keys; the API contract uses uppercase.
// Keep the wire types intact and translate at the boundary only.

export const K1_STATUS_TO_BADGE: Record<
  K1Status,
  'uploaded' | 'processing' | 'needs_review' | 'ready_for_approval' | 'finalized'
> = {
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  NEEDS_REVIEW: 'needs_review',
  READY_FOR_APPROVAL: 'ready_for_approval',
  FINALIZED: 'finalized',
}

export const K1_BADGE_TO_STATUS: Record<
  'uploaded' | 'processing' | 'needs_review' | 'ready_for_approval' | 'finalized',
  K1Status
> = {
  uploaded: 'UPLOADED',
  processing: 'PROCESSING',
  needs_review: 'NEEDS_REVIEW',
  ready_for_approval: 'READY_FOR_APPROVAL',
  finalized: 'FINALIZED',
}

// --- Request helper ----------------------------------------------------------

export class K1ApiError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly payload?: unknown

  constructor(code: string, status: number, payload?: unknown) {
    super(code)
    this.code = code
    this.status = status
    this.payload = payload
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers,
    ...init,
  })
  if (!res.ok) {
    let payload: unknown = undefined
    try {
      payload = await res.json()
    } catch {
      // ignore
    }
    const code =
      payload && typeof payload === 'object' && 'error' in (payload as object)
        ? String((payload as { error: unknown }).error)
        : `HTTP_${res.status}`
    throw new K1ApiError(code, res.status, payload)
  }
  return (await res.json()) as T
}

// --- Filter shape -----------------------------------------------------------

export interface K1Filters {
  taxYear?: number
  entityId?: string
  status?: K1Status
  q?: string
  sort?: 'uploaded_at' | 'partnership' | 'entity' | 'tax_year' | 'status' | 'issues'
  direction?: 'asc' | 'desc'
  limit?: number
  cursor?: string
}

const toQuery = (f: K1Filters) => {
  const p = new URLSearchParams()
  if (f.taxYear) p.set('tax_year', String(f.taxYear))
  if (f.entityId) p.set('entity_id', f.entityId)
  if (f.status) p.set('status', f.status)
  if (f.q) p.set('q', f.q)
  if (f.sort) p.set('sort', f.sort)
  if (f.direction) p.set('direction', f.direction)
  if (f.limit) p.set('limit', String(f.limit))
  if (f.cursor) p.set('cursor', f.cursor)
  return p.toString()
}

// --- Endpoints ---------------------------------------------------------------

export interface EntityLookup { id: string; name: string }

export const k1Client = {
  listDocuments: (f: K1Filters = {}): Promise<K1ListResponse> =>
    request(`/k1-documents?${toQuery(f)}`),

  getDocument: (id: string): Promise<K1DocumentSummary> =>
    request(`/k1-documents/${id}`),

  getKpis: (scope: { taxYear?: number; entityId?: string } = {}): Promise<K1Kpis> => {
    const p = new URLSearchParams()
    if (scope.taxYear) p.set('tax_year', String(scope.taxYear))
    if (scope.entityId) p.set('entity_id', scope.entityId)
    return request(`/k1-documents/kpis?${p.toString()}`)
  },

  upload: async (args: {
    file: File
    entityId: string
    replaceDocumentId?: string
  }): Promise<K1UploadResponse> => {
    const form = new FormData()
    form.append('entityId', args.entityId)
    if (args.replaceDocumentId) form.append('replaceDocumentId', args.replaceDocumentId)
    form.append('file', args.file)

    const res = await fetch(`${API_BASE_URL}/k1-documents`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) {
      let payload: unknown = undefined
      try { payload = await res.json() } catch { /* ignore */ }
      throw new K1ApiError(`HTTP_${res.status}`, res.status, payload)
    }
    return (await res.json()) as K1UploadResponse
  },

  reparse: (id: string): Promise<{ k1DocumentId: string; status: K1Status }> =>
    request(`/k1-documents/${id}/reparse`, { method: 'POST' }),

  exportCsvUrl: (f: K1Filters = {}) => `${API_BASE_URL}/k1-documents/export.csv?${toQuery(f)}`,

  listEntities: (): Promise<{ items: EntityLookup[] }> =>
    request('/k1/lookups/entities'),
}
