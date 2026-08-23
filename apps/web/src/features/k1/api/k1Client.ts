import type {
  K1DocumentSummary,
  K1ApplicationPreview,
  K1ApplyPreviewRequest,
  K1ApplyRequest,
  K1ApplyResponse,
  K1CompleteBatchUploadsRequest,
  K1CreateIngestionBatchRequest,
  K1IngestionBatch,
  K1IngestionBatchCollection,
  K1IngestionBatchFilters,
  K1IngestionItem,
  K1Kpis,
  K1ListResponse,
  K1Status,
  K1UploadResponse,
} from '../../../../../../packages/types/src/k1-ingestion'
import { authenticatedFetch, reportAuthenticationResponse } from '../../../auth/authenticatedFetch'

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

  const res = await authenticatedFetch(`${API_BASE_URL}${path}`, {
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
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const sha256File = async (file: File): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

const putFileWithProgress = async (args: {
  file: File
  url: string
  headers: Record<string, string>
  onProgress?: (progress: number) => void
}): Promise<string | null> => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest()
  xhr.open('PUT', args.url)
  xhr.withCredentials = args.url.startsWith('/')
  for (const [name, value] of Object.entries(args.headers)) {
    if (name.toLowerCase() === 'content-length') continue
    xhr.setRequestHeader(name, value)
  }
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) args.onProgress?.(Math.round((event.loaded / event.total) * 100))
  }
  xhr.onerror = () => reject(new K1ApiError('UPLOAD_NETWORK_ERROR', 0))
  xhr.onload = () => {
    if (args.url.startsWith('/')) reportAuthenticationResponse(xhr.status)
    if (xhr.status >= 200 && xhr.status < 300) {
      args.onProgress?.(100)
      resolve(xhr.getResponseHeader('x-amz-version-id'))
      return
    }
    let payload: unknown
    try { payload = JSON.parse(xhr.responseText) } catch { payload = undefined }
    const code = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `HTTP_${xhr.status}`
    reject(new K1ApiError(code, xhr.status, payload))
  }
  xhr.send(args.file)
})

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

  previewApplication: (
    id: string,
    body: K1ApplyPreviewRequest,
  ): Promise<K1ApplicationPreview> => request(
    `/k1-documents/${id}/apply-preview`,
    { method: 'POST', body: JSON.stringify(body) },
  ),

  apply: (id: string, body: K1ApplyRequest): Promise<K1ApplyResponse> =>
    request(`/k1-documents/${id}/apply`, { method: 'POST', body: JSON.stringify(body) }),

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

    const res = await authenticatedFetch(`${API_BASE_URL}/k1-documents`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) {
      let payload: unknown = undefined
      try { payload = await res.json() } catch { /* ignore */ }
      const code = payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP_${res.status}`
      throw new K1ApiError(code, res.status, payload)
    }
    return (await res.json()) as K1UploadResponse
  },

  reparse: (id: string): Promise<{ k1DocumentId: string; status: K1Status }> =>
    request(`/k1-documents/${id}/reparse`, { method: 'POST' }),

  exportCsvUrl: (f: K1Filters = {}) => `${API_BASE_URL}/k1-documents/export.csv?${toQuery(f)}`,

  listEntities: (): Promise<{ items: EntityLookup[] }> =>
    request('/k1/lookups/entities'),

  createBatch: (body: K1CreateIngestionBatchRequest): Promise<K1IngestionBatch> =>
    request('/k1-ingestion-batches', { method: 'POST', body: JSON.stringify(body) }),

  getBatch: (batchId: string): Promise<K1IngestionBatch> =>
    request(`/k1-ingestion-batches/${batchId}`),

  listBatches: (filters: K1IngestionBatchFilters = {}): Promise<K1IngestionBatchCollection> => {
    const query = new URLSearchParams()
    if (filters.entityId) query.set('entity_id', filters.entityId)
    if (filters.status) query.set('status', filters.status)
    if (filters.attentionOnly) query.set('attention_only', 'true')
    if (filters.limit) query.set('limit', String(filters.limit))
    if (filters.cursor) query.set('cursor', filters.cursor)
    return request(`/k1-ingestion-batches?${query.toString()}`)
  },

  cancelBatchItem: (itemId: string): Promise<K1IngestionItem> =>
    request(`/k1-ingestion-items/${itemId}/cancel`, { method: 'POST' }),

  deleteBatchItem: (itemId: string): Promise<void> =>
    request(`/k1-ingestion-items/${itemId}`, { method: 'DELETE' }),

  retryExtraction: (k1DocumentId: string, expectedDocumentVersion: number): Promise<{
    k1DocumentId: string; documentVersion: number; attemptId: string; attemptNumber: number; status: 'QUEUED'
  }> => request(`/k1-documents/${k1DocumentId}/retry-extraction`, {
    method: 'POST', body: JSON.stringify({ expectedDocumentVersion }),
  }),

  completeBatchUploads: (
    batchId: string,
    body: K1CompleteBatchUploadsRequest,
  ): Promise<K1IngestionBatch> => request(
    `/k1-ingestion-batches/${batchId}/complete-uploads`,
    { method: 'POST', body: JSON.stringify(body) },
  ),

  uploadBatch: async (args: {
    files: File[]
    entityScopeId: string | null
    onProgress?: (fileName: string, progress: number) => void
  }): Promise<K1IngestionBatch> => {
    const declared = await Promise.all(args.files.map(async (file) => ({
      fileName: file.name,
      sizeBytes: file.size,
      sha256: await sha256File(file),
      mimeType: 'application/pdf' as const,
    })))
    const batch = await k1Client.createBatch({ entityScopeId: args.entityScopeId, files: declared })
    const completionItems = await Promise.all(batch.items.map(async (item, index) => {
      const file = args.files[index]
      if (!file || !item.upload) return { itemId: item.id, sha256: item.sha256 }
      try {
        const objectVersionId = await putFileWithProgress({
          file,
          url: item.upload.url,
          headers: item.upload.headers,
          onProgress: (progress) => args.onProgress?.(file.name, progress),
        })
        return { itemId: item.id, sha256: item.sha256, objectVersionId }
      } catch {
        // Completion verifies every item independently and turns a missing or
        // interrupted PUT into a retryable per-file error.
        return { itemId: item.id, sha256: item.sha256 }
      }
    }))
    return k1Client.completeBatchUploads(batch.id, { items: completionItems })
  },
}
