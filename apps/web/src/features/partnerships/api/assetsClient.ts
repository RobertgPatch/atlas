import type {
  AssetFmvSnapshot,
  CreateAssetFmvSnapshotRequest,
  CreatePartnershipAssetRequest,
  DuplicatePartnershipAssetError,
  PartnershipAssetDetail,
  PartnershipAssetsResponse,
} from '../../../../../../packages/types/src/partnership-management'
import { PartnershipsApiError } from './partnershipsClient'

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers, ...init })
  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = undefined
    }
    const code =
      payload && typeof payload === 'object' && 'error' in (payload as object)
        ? String((payload as { error: unknown }).error)
        : `HTTP_${response.status}`
    throw new PartnershipsApiError(code, response.status, payload)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const assetsClient = {
  list(partnershipId: string): Promise<PartnershipAssetsResponse> {
    return request<PartnershipAssetsResponse>(`/partnerships/${partnershipId}/assets`)
  },

  get(partnershipId: string, assetId: string): Promise<PartnershipAssetDetail> {
    return request<PartnershipAssetDetail>(`/partnerships/${partnershipId}/assets/${assetId}`)
  },

  listFmvSnapshots(partnershipId: string, assetId: string): Promise<AssetFmvSnapshot[]> {
    return request<AssetFmvSnapshot[]>(`/partnerships/${partnershipId}/assets/${assetId}/fmv-snapshots`)
  },

  async create(
    partnershipId: string,
    body: CreatePartnershipAssetRequest,
  ): Promise<PartnershipAssetDetail | DuplicatePartnershipAssetError> {
    try {
      return await request<PartnershipAssetDetail>(`/partnerships/${partnershipId}/assets`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    } catch (error) {
      if (error instanceof PartnershipsApiError && error.status === 409) {
        return { kind: 'duplicate-asset', error: 'DUPLICATE_PARTNERSHIP_ASSET' }
      }
      throw error
    }
  },

  createFmvSnapshot(
    partnershipId: string,
    assetId: string,
    body: CreateAssetFmvSnapshotRequest,
  ): Promise<AssetFmvSnapshot> {
    return request<AssetFmvSnapshot>(`/partnerships/${partnershipId}/assets/${assetId}/fmv-snapshots`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}