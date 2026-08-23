import type { K1Status } from '../../../../../../packages/types/src/k1-ingestion'
import { authenticatedFetch } from '../../../auth/authenticatedFetch'

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1'

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers,
    ...init,
  })

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`)
  }

  return (await response.json()) as T
}

export interface DashboardSummaryResponse {
  kpis: {
    totalEntities: number
    totalPartnerships: number
    totalK1Documents: number
    finalizedK1Documents: number
    openIssuesCount: number
    highSeverityOpenIssues: number
    totalDistributionsUsd: number
    portfolioValueUsd: number | null
    totalCommitmentUsd: number
    totalPaidInUsd: number
    totalUnfundedUsd: number
    portfolioTvpi: number | null
  }
  assetClassSummary: Array<{
    assetClass: string
    partnershipCount: number
    commitmentUsd: number
    paidInUsd: number
    unfundedUsd: number
    reportedDistributionsUsd: number
    residualValueUsd: number
    tvpi: number | null
  }>
  statusCounts: Record<K1Status, number>
  recentK1Activity: Array<{
    id: string
    entity: string
    partnership: string
    taxYear: number | null
    status: K1Status
    uploadedAt: string
  }>
  reviewK1s: Array<{
    id: string
    entity: string
    partnership: string
    taxYear: number | null
    status: Extract<K1Status, 'NEEDS_REVIEW' | 'READY_FOR_APPROVAL'>
    uploadedAt: string
    openIssueCount: number
  }>
  openIssues: Array<{
    id: string
    entity: string
    partnership: string
    message: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    createdAt: string
    k1DocumentId: string
  }>
}

export const dashboardClient = {
  getSummary(): Promise<DashboardSummaryResponse> {
    return request('/dashboard')
  },
}
