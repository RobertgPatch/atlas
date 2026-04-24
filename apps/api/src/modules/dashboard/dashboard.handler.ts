import type { FastifyReply, FastifyRequest } from 'fastify'
import { k1Repository } from '../k1/k1.repository.js'
import { partnershipsRepository } from '../partnerships/partnerships.repository.js'
import { capitalRepository } from '../partnerships/capital.repository.js'
import type { DashboardSummaryResponse } from './dashboard.types.js'

const issueSeverityRank: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
}

export const getDashboardSummaryHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const authUser = request.authUser
  if (!authUser) {
    reply.code(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  const allEntities = k1Repository.listEntities()
  const visibleEntityIds =
    authUser.role === 'Admin'
      ? allEntities.map((entity) => entity.id)
      : k1Repository.listEntitiesForUser(authUser.userId)

  const visibleEntities = allEntities.filter((entity) => visibleEntityIds.includes(entity.id))
  const partnershipScope = {
    isAdmin: authUser.role === 'Admin',
    entityIds: visibleEntityIds,
  }

  const partnershipDirectory = await partnershipsRepository.listPartnerships(
    {
      page: 1,
      pageSize: 200,
      sort: 'name',
    },
    partnershipScope,
  )

  const allPartnershipRows = [...partnershipDirectory.rows]
  if (allPartnershipRows.length < partnershipDirectory.page.total) {
    let page = 2
    while (allPartnershipRows.length < partnershipDirectory.page.total) {
      const next = await partnershipsRepository.listPartnerships(
        {
          page,
          pageSize: 200,
          sort: 'name',
        },
        partnershipScope,
      )
      allPartnershipRows.push(...next.rows)
      if (next.rows.length === 0) break
      page += 1
    }
  }

  const rowMetrics = await Promise.all(
    allPartnershipRows.map(async (row) => ({
      row,
      overview: await capitalRepository.calculateCapitalOverview(row.id),
    })),
  )

  const assetClassSummaryMap = new Map<
    string,
    {
      assetClass: string
      partnershipCount: number
      commitmentUsd: number
      paidInUsd: number
      unfundedUsd: number
      reportedDistributionsUsd: number
      residualValueUsd: number
    }
  >()

  for (const item of rowMetrics) {
    const assetClass = item.row.assetClass ?? 'Unclassified'
    const existing = assetClassSummaryMap.get(assetClass) ?? {
      assetClass,
      partnershipCount: 0,
      commitmentUsd: 0,
      paidInUsd: 0,
      unfundedUsd: 0,
      reportedDistributionsUsd: 0,
      residualValueUsd: 0,
    }

    existing.partnershipCount += 1
    existing.commitmentUsd += item.overview.originalCommitmentUsd ?? 0
    existing.paidInUsd += item.overview.paidInUsd
    existing.unfundedUsd += item.overview.unfundedUsd ?? 0
    existing.reportedDistributionsUsd += item.overview.reportedDistributionsUsd
    existing.residualValueUsd += item.overview.residualValueUsd ?? 0
    assetClassSummaryMap.set(assetClass, existing)
  }

  const assetClassSummary = [...assetClassSummaryMap.values()]
    .map((row) => ({
      ...row,
      tvpi:
        row.paidInUsd > 0
          ? (row.reportedDistributionsUsd + row.residualValueUsd) / row.paidInUsd
          : null,
    }))
    .sort((left, right) => right.commitmentUsd - left.commitmentUsd || left.assetClass.localeCompare(right.assetClass))

  const k1Kpis = k1Repository.getKpis(authUser.userId, {})
  const totalK1Documents = Object.values(k1Kpis.counts).reduce((sum, count) => sum + count, 0)

  const recentK1Activity = k1Repository
    .listK1s(authUser.userId, {
      sort: 'uploaded_at',
      direction: 'desc',
      limit: 5,
    })
    .items.map((item) => ({
      id: item.id,
      entity: item.entity.name,
      partnership: item.partnership.name ?? 'Pending partnership resolution',
      taxYear: item.taxYear,
      status: item.status,
      uploadedAt: item.uploadedAt,
    }))

  const openIssues = k1Repository
    .listIssues()
    .filter((issue) => issue.status === 'OPEN')
    .map((issue) => {
      const k1 = k1Repository.getK1Document(issue.k1DocumentId)
      if (!k1 || !visibleEntityIds.includes(k1.entityId)) return null
      const entity = allEntities.find((row) => row.id === k1.entityId)
      const partnership = k1.partnershipId
        ? k1Repository.listPartnerships().find((row) => row.id === k1.partnershipId)
        : null
      return {
        id: issue.id,
        entity: entity?.name ?? 'Unknown Entity',
        partnership: partnership?.name ?? k1.partnershipNameRaw ?? 'Pending partnership resolution',
        message: issue.message,
        severity: issue.severity,
        createdAt: issue.createdAt.toISOString(),
        k1DocumentId: issue.k1DocumentId,
      }
    })
    .filter((issue): issue is NonNullable<typeof issue> => issue !== null)
    .sort(
      (a, b) =>
        issueSeverityRank[a.severity] - issueSeverityRank[b.severity] ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const payload: DashboardSummaryResponse = {
    kpis: {
      totalEntities: visibleEntities.length,
      totalPartnerships: partnershipDirectory.totals.partnershipCount,
      totalK1Documents,
      finalizedK1Documents: k1Kpis.counts.FINALIZED,
      openIssuesCount: openIssues.length,
      highSeverityOpenIssues: openIssues.filter((issue) => issue.severity === 'HIGH').length,
      totalDistributionsUsd: partnershipDirectory.totals.totalDistributionsUsd,
      portfolioValueUsd:
        partnershipDirectory.totals.totalFmvUsd > 0
          ? partnershipDirectory.totals.totalFmvUsd
          : null,
      totalCommitmentUsd: partnershipDirectory.totals.totalCommitmentUsd,
      totalPaidInUsd: partnershipDirectory.totals.totalPaidInUsd,
      totalUnfundedUsd: partnershipDirectory.totals.totalUnfundedUsd,
      portfolioTvpi:
        partnershipDirectory.totals.totalPaidInUsd > 0
          ? (
              partnershipDirectory.totals.totalDistributionsUsd +
              partnershipDirectory.totals.totalFmvUsd
            ) / partnershipDirectory.totals.totalPaidInUsd
          : null,
    },
    assetClassSummary,
    statusCounts: k1Kpis.counts,
    recentK1Activity,
    openIssues: openIssues.slice(0, 5),
  }

  reply.send(payload)
}