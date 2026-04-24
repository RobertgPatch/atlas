import type { FastifyReply, FastifyRequest } from 'fastify'
import { k1Repository } from '../k1/k1.repository.js'
import { partnershipsRepository } from '../partnerships/partnerships.repository.js'
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
      pageSize: 1,
      sort: 'name',
    },
    partnershipScope,
  )

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

  const entityMap = new Map(allEntities.map((e) => [e.id, e]))
  const visibleEntityIdSet = new Set(visibleEntityIds)
  const partnershipMap = new Map(k1Repository.listPartnerships().map((p) => [p.id, p]))

  const openIssues = k1Repository
    .listIssues()
    .filter((issue) => issue.status === 'OPEN')
    .map((issue) => {
      const k1 = k1Repository.getK1Document(issue.k1DocumentId)
      if (!k1 || !visibleEntityIdSet.has(k1.entityId)) return null
      const entity = entityMap.get(k1.entityId)
      const partnership = k1.partnershipId ? partnershipMap.get(k1.partnershipId) : null
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
    },
    statusCounts: k1Kpis.counts,
    recentK1Activity,
    openIssues: openIssues.slice(0, 5),
  }

  reply.send(payload)
}