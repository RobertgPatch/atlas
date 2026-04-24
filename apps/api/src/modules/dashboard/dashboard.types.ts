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