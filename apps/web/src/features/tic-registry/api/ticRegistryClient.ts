import type {
  CreateTicInterestRequest,
  CreateTicOwnerRequest,
  CreateTicPropertyRequest,
  TicInterest,
  TicOwner,
  TicProperty,
  TicRegistryQuery,
  TicRegistryResponse,
  UpdateTicInterestRequest,
  UpdateTicOwnerRequest,
  UpdateTicPropertyRequest,
} from '../../../../../../packages/types/src/tic-registry'

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

export class TicRegistryApiError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly payload?: unknown

  constructor(
    code: string,
    status: number,
    payload?: unknown,
  ) {
    super(code)
    this.code = code
    this.status = status
    this.payload = payload
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...init,
  })

  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = undefined
    }

    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP_${response.status}`

    throw new TicRegistryApiError(code, response.status, payload)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function toQueryString(query?: TicRegistryQuery & { expectedUpdatedAt?: string }): string {
  const params = new URLSearchParams()

  if (query?.status) params.set('status', query.status)
  if (query?.propertyType) params.set('propertyType', query.propertyType)
  if (query?.search) params.set('search', query.search)
  if (query?.expectedUpdatedAt) params.set('expectedUpdatedAt', query.expectedUpdatedAt)

  return params.toString()
}

function pathWithQuery(path: string, query?: TicRegistryQuery & { expectedUpdatedAt?: string }) {
  const queryString = toQueryString(query)
  return queryString ? `${path}?${queryString}` : path
}

export const ticRegistryClient = {
  listProperties(query?: TicRegistryQuery): Promise<TicRegistryResponse> {
    return request<TicRegistryResponse>(pathWithQuery('/tic-registry/properties', query))
  },

  getProperty(propertyId: string): Promise<TicProperty> {
    return request<TicProperty>(`/tic-registry/properties/${propertyId}`)
  },

  createProperty(payload: CreateTicPropertyRequest): Promise<TicProperty> {
    return request<TicProperty>('/tic-registry/properties', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updateProperty(propertyId: string, payload: UpdateTicPropertyRequest): Promise<TicProperty> {
    return request<TicProperty>(`/tic-registry/properties/${propertyId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  deleteProperty(propertyId: string, expectedUpdatedAt: string): Promise<void> {
    return request<void>(
      pathWithQuery(`/tic-registry/properties/${propertyId}`, { expectedUpdatedAt }),
      { method: 'DELETE' },
    )
  },

  createInterest(propertyId: string, payload: CreateTicInterestRequest): Promise<TicInterest> {
    return request<TicInterest>(`/tic-registry/properties/${propertyId}/interests`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updateInterest(interestId: string, payload: UpdateTicInterestRequest): Promise<TicInterest> {
    return request<TicInterest>(`/tic-registry/interests/${interestId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  deleteInterest(interestId: string, expectedUpdatedAt: string): Promise<void> {
    return request<void>(
      pathWithQuery(`/tic-registry/interests/${interestId}`, { expectedUpdatedAt }),
      { method: 'DELETE' },
    )
  },

  createOwner(interestId: string, payload: CreateTicOwnerRequest): Promise<TicOwner> {
    return request<TicOwner>(`/tic-registry/interests/${interestId}/owners`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updateOwner(ownerId: string, payload: UpdateTicOwnerRequest): Promise<TicOwner> {
    return request<TicOwner>(`/tic-registry/owners/${ownerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  deleteOwner(ownerId: string, expectedUpdatedAt: string): Promise<void> {
    return request<void>(
      pathWithQuery(`/tic-registry/owners/${ownerId}`, { expectedUpdatedAt }),
      { method: 'DELETE' },
    )
  },
}
