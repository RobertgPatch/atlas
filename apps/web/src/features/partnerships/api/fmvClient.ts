import type {
  FmvSnapshot,
  CreateFmvSnapshotRequest,
} from '../../../../../../packages/types/src/partnership-management'

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

export class FmvApiError extends Error {
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
    throw new FmvApiError(code, res.status, payload)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const fmvClient = {
  list(partnershipId: string): Promise<FmvSnapshot[]> {
    return request<FmvSnapshot[]>(`/partnerships/${partnershipId}/fmv-snapshots`)
  },

  create(partnershipId: string, body: CreateFmvSnapshotRequest): Promise<FmvSnapshot> {
    return request<FmvSnapshot>(`/partnerships/${partnershipId}/fmv-snapshots`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}
