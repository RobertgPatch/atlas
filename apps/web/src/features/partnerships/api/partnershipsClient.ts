import type {
  PartnershipDirectoryResponse,
  PartnershipDetail,
  Partnership,
  CreatePartnershipRequest,
  UpdatePartnershipRequest,
  DuplicatePartnershipNameError,
} from '../../../../../../packages/types/src/partnership-management'

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

export class PartnershipsApiError extends Error {
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
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init, headers })
  if (!res.ok) {
    let payload: unknown
    try { payload = await res.json() } catch { /* ignore */ }
    const code =
      payload && typeof payload === 'object' && 'error' in (payload as object)
        ? String((payload as { error: unknown }).error)
        : `HTTP_${res.status}`
    throw new PartnershipsApiError(code, res.status, payload)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export type ListPartnershipsParams = {
  search?: string
  entityId?: string
  assetClass?: string
  status?: string[]
  sort?: string
  page?: number
  pageSize?: number
}

export const partnershipsClient = {
  list(params: ListPartnershipsParams = {}): Promise<PartnershipDirectoryResponse> {
    const qs = new URLSearchParams()
    if (params.search) qs.set('search', params.search)
    if (params.entityId) qs.set('entityId', params.entityId)
    if (params.assetClass) qs.set('assetClass', params.assetClass)
    if (params.status?.length) params.status.forEach((s) => qs.append('status', s))
    if (params.sort) qs.set('sort', params.sort)
    if (params.page != null) qs.set('page', String(params.page))
    if (params.pageSize != null) qs.set('pageSize', String(params.pageSize))
    return request<PartnershipDirectoryResponse>(`/partnerships?${qs}`)
  },

  get(id: string): Promise<PartnershipDetail> {
    return request<PartnershipDetail>(`/partnerships/${id}`)
  },

  exportCsvUrl(params: Omit<ListPartnershipsParams, 'sort' | 'page' | 'pageSize'>): string {
    const qs = new URLSearchParams()
    if (params.search) qs.set('search', params.search)
    if (params.entityId) qs.set('entityId', params.entityId)
    if (params.assetClass) qs.set('assetClass', params.assetClass)
    if (params.status?.length) params.status.forEach((s) => qs.append('status', s))
    return `${API_BASE}/partnerships/export.csv?${qs}`
  },

  async create(
    body: CreatePartnershipRequest,
  ): Promise<Partnership | DuplicatePartnershipNameError> {
    try {
      return await request<Partnership>('/partnerships', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    } catch (err) {
      if (err instanceof PartnershipsApiError && err.status === 409) {
        return { kind: 'duplicate-name', error: 'DUPLICATE_PARTNERSHIP_NAME' }
      }
      throw err
    }
  },

  async update(
    id: string,
    body: UpdatePartnershipRequest,
  ): Promise<Partnership | DuplicatePartnershipNameError> {
    try {
      return await request<Partnership>(`/partnerships/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    } catch (err) {
      if (err instanceof PartnershipsApiError && err.status === 409) {
        return { kind: 'duplicate-name', error: 'DUPLICATE_PARTNERSHIP_NAME' }
      }
      throw err
    }
  },
}
