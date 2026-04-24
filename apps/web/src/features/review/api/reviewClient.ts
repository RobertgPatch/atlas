import type {
  K1ApproveResponse,
  K1CorrectionsRequest,
  K1CorrectionsResponse,
  K1FinalizeResponse,
  K1MapEntityRequest,
  K1MapPartnershipRequest,
  K1MapResponse,
  K1OpenIssueRequest,
  K1OpenIssueResponse,
  K1ResolveIssueResponse,
  K1ReviewErrorBody,
  K1ReviewSession,
} from '../../../../../../packages/types/src/review-finalization'

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

export class K1ReviewError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly currentVersion?: number
  public readonly payload: K1ReviewErrorBody | undefined

  constructor(status: number, payload: K1ReviewErrorBody | undefined) {
    super(payload?.error ?? `HTTP_${status}`)
    this.status = status
    this.code = payload?.error ?? `HTTP_${status}`
    this.currentVersion = payload?.currentVersion
    this.payload = payload
  }
}

interface RequestOpts {
  method?: string
  body?: unknown
  version?: number
}

/** Response wrapping version + body so callers can update their cached ETag. */
export interface VersionedResponse<T> {
  body: T
  version: number
}

const request = async <T>(
  path: string,
  opts: RequestOpts = {},
): Promise<VersionedResponse<T>> => {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.version != null) headers['If-Match'] = String(opts.version)

  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  if (!res.ok) {
    let payload: K1ReviewErrorBody | undefined
    try {
      payload = (await res.json()) as K1ReviewErrorBody
    } catch {
      payload = undefined
    }
    throw new K1ReviewError(res.status, payload)
  }

  const etag = res.headers.get('etag')
  const parsed = etag != null ? Number.parseInt(etag, 10) : NaN
  const body = (await res.json()) as T
  return {
    body,
    version: Number.isFinite(parsed)
      ? parsed
      : (body as unknown as { version?: number }).version ?? 0,
  }
}

export const reviewClient = {
  async getSession(k1DocumentId: string): Promise<VersionedResponse<K1ReviewSession>> {
    return request<K1ReviewSession>(`/k1-documents/${k1DocumentId}/review-session`)
  },

  async saveCorrections(
    k1DocumentId: string,
    body: K1CorrectionsRequest,
    version: number,
  ): Promise<VersionedResponse<K1CorrectionsResponse>> {
    return request<K1CorrectionsResponse>(`/k1-documents/${k1DocumentId}/corrections`, {
      method: 'PUT',
      body,
      version,
    })
  },

  async mapEntity(
    k1DocumentId: string,
    body: K1MapEntityRequest,
    version: number,
  ): Promise<VersionedResponse<K1MapResponse>> {
    return request<K1MapResponse>(`/k1-documents/${k1DocumentId}/map-entity`, {
      method: 'PUT',
      body,
      version,
    })
  },

  async mapPartnership(
    k1DocumentId: string,
    body: K1MapPartnershipRequest,
    version: number,
  ): Promise<VersionedResponse<K1MapResponse>> {
    return request<K1MapResponse>(`/k1-documents/${k1DocumentId}/map-partnership`, {
      method: 'PUT',
      body,
      version,
    })
  },

  async approve(
    k1DocumentId: string,
    version: number,
  ): Promise<VersionedResponse<K1ApproveResponse>> {
    return request<K1ApproveResponse>(`/k1-documents/${k1DocumentId}/approve`, {
      method: 'POST',
      version,
    })
  },

  async finalize(
    k1DocumentId: string,
    version: number,
  ): Promise<VersionedResponse<K1FinalizeResponse>> {
    return request<K1FinalizeResponse>(`/k1-documents/${k1DocumentId}/finalize`, {
      method: 'POST',
      version,
    })
  },

  async openIssue(
    k1DocumentId: string,
    body: K1OpenIssueRequest,
    version: number,
  ): Promise<VersionedResponse<K1OpenIssueResponse>> {
    return request<K1OpenIssueResponse>(`/k1-documents/${k1DocumentId}/issues`, {
      method: 'POST',
      body,
      version,
    })
  },

  async resolveIssue(
    k1DocumentId: string,
    issueId: string,
    version: number,
  ): Promise<VersionedResponse<K1ResolveIssueResponse>> {
    return request<K1ResolveIssueResponse>(
      `/k1-documents/${k1DocumentId}/issues/${issueId}/resolve`,
      { method: 'POST', version },
    )
  },
}

export type { K1ReviewSession }
