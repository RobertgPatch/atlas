import type { K1Status } from '../k1/k1.types.js'

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
  }
  statusCounts: Record<K1Status, number>
  recentK1Activity: Array<{
    id: string
    entity: string
    partnership: string
    taxYear: number | null
    status: K1Status
    uploadedAt: string
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