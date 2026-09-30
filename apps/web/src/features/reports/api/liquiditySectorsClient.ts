import type { SaveSectorAssignment, SectorAssignment } from '../../../../../../packages/types/src/liquidity-sectors'
import { authenticatedFetch } from '../../../auth/authenticatedFetch'

const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'
async function request<T>(path: string, body?: SaveSectorAssignment): Promise<T> {
  const response = await authenticatedFetch(`${base}${path}`, {
    method: body ? 'PUT' : 'GET', credentials: 'include',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message ?? 'Unable to load or save sector assignments. Please try again.')
  }
  return response.json() as Promise<T>
}

export const liquiditySectorsClient = {
  list: () => request<{ items: SectorAssignment[] }>('/liquidity-sectors'),
  save: (symbol: string, body: SaveSectorAssignment) =>
    request<SectorAssignment>(`/liquidity-sectors/${encodeURIComponent(symbol)}`, body),
}
