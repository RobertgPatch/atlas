import type { FastifyReply, FastifyRequest } from 'fastify'
import { k1Repository } from '../k1/k1.repository.js'
import { partnershipsRepository } from '../partnerships/partnerships.repository.js'
import { capitalRepository } from '../partnerships/capital.repository.js'
import type { DashboardSummaryResponse } from './dashboard.types.js'
import { pool } from '../../infra/db/client.js'

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
  const durableDashboard = await durableK1Dashboard({
    userId: authUser.userId,
    isAdmin: authUser.role === 'Admin',
    visibleEntityIds,
  })
  const statusCounts = durableDashboard?.statusCounts ?? k1Kpis.counts
  const totalK1Documents = Object.values(statusCounts).reduce((sum, count) => sum + count, 0)

  const recentK1Activity = durableDashboard?.recentK1Activity ??
    k1Repository
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

  const openIssues = durableDashboard?.openIssues ??
    k1Repository
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

  const reviewK1s = durableDashboard?.reviewK1s ?? recentK1Activity
    .filter((item) => item.status === 'NEEDS_REVIEW' || item.status === 'READY_FOR_APPROVAL')
    .map((item) => ({ ...item, openIssueCount: 0 })) as DashboardSummaryResponse['reviewK1s']

  const payload: DashboardSummaryResponse = {
    kpis: {
      totalEntities: visibleEntities.length,
      totalPartnerships: partnershipDirectory.totals.partnershipCount,
      totalK1Documents,
      finalizedK1Documents: statusCounts.FINALIZED,
      openIssuesCount: durableDashboard?.openIssueCount ?? openIssues.length,
      highSeverityOpenIssues:
        durableDashboard?.highSeverityOpenIssues ?? openIssues.filter((issue) => issue.severity === 'HIGH').length,
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
    statusCounts,
    recentK1Activity,
    reviewK1s,
    openIssues: openIssues.slice(0, 5),
  }

  reply.send(payload)
}

const durableK1Dashboard = async (args: {
  userId: string
  isAdmin: boolean
  visibleEntityIds: string[]
}): Promise<(
  Pick<DashboardSummaryResponse, 'statusCounts' | 'recentK1Activity' | 'reviewK1s' | 'openIssues'> & {
    openIssueCount: number
    highSeverityOpenIssues: number
  }
) | null> => {
  if (!pool) return null
  const params: [string, string[], boolean] = [args.userId, args.visibleEntityIds, args.isAdmin]
  const scope = `($3::boolean or kd.uploader_user_id = $1 or p.entity_id = any($2::uuid[]))`
  const counts = await pool.query<{
    processing_status: keyof DashboardSummaryResponse['statusCounts']
    count: string
  }>(
    `select kd.processing_status, count(*)::text as count
       from k1_documents kd left join partnerships p on p.id = kd.partnership_id
      where kd.superseded_by_document_id is null and ${scope}
      group by kd.processing_status`,
    params,
  )
  const statusCounts: DashboardSummaryResponse['statusCounts'] = {
    UPLOADED: 0, PROCESSING: 0, NEEDS_REVIEW: 0, READY_FOR_APPROVAL: 0, FINALIZED: 0,
  }
  for (const row of counts.rows) statusCounts[row.processing_status] = Number(row.count)

  const activity = await pool.query<{
    id: string; entity: string; partnership: string; tax_year: number | null
    processing_status: 'UPLOADED' | 'PROCESSING' | 'NEEDS_REVIEW' | 'READY_FOR_APPROVAL' | 'FINALIZED'
    uploaded_at: Date; open_issue_count: string
  }>(
    `select kd.id, coalesce(e.name, 'Pending entity resolution') as entity,
            coalesce(p.name, extracted.partnership_name, 'Pending partnership resolution') as partnership,
            kd.tax_year, kd.processing_status, kd.uploaded_at,
            (select count(*)::text from k1_issues i where i.k1_document_id = kd.id and i.status = 'OPEN'
              and (i.extraction_attempt_id is null or i.extraction_attempt_id = kd.active_extraction_attempt_id)) as open_issue_count
       from k1_documents kd
       left join partnerships p on p.id = kd.partnership_id
       left join entities e on e.id = p.entity_id
       left join lateral (
         select trim(both '"' from coalesce(f.reviewer_corrected_value_json, f.normalized_value_json, f.raw_value_json)::text) as partnership_name
           from k1_field_values f
          where f.k1_document_id = kd.id and f.extraction_attempt_id = kd.active_extraction_attempt_id
            and f.canonical_path = 'match.partnership_name' limit 1
       ) extracted on true
      where kd.superseded_by_document_id is null and ${scope}
      order by kd.uploaded_at desc limit 20`,
    params,
  )
  const wire = activity.rows.map((row) => ({
    id: row.id, entity: row.entity, partnership: row.partnership, taxYear: row.tax_year,
    status: row.processing_status, uploadedAt: row.uploaded_at.toISOString(),
    openIssueCount: Number(row.open_issue_count),
  }))
  const issues = await pool.query<{
    id: string; entity: string; partnership: string; message: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'; created_at: Date; k1_document_id: string
  }>(
    `select i.id, coalesce(e.name, 'Pending entity resolution') as entity,
            coalesce(p.name, extracted.partnership_name, 'Pending partnership resolution') as partnership,
            i.message, i.severity, i.created_at, i.k1_document_id
       from k1_issues i join k1_documents kd on kd.id = i.k1_document_id
       left join partnerships p on p.id = kd.partnership_id left join entities e on e.id = p.entity_id
       left join lateral (
         select trim(both '"' from coalesce(f.reviewer_corrected_value_json, f.normalized_value_json, f.raw_value_json)::text) as partnership_name
           from k1_field_values f where f.k1_document_id = kd.id
            and f.extraction_attempt_id = kd.active_extraction_attempt_id and f.canonical_path = 'match.partnership_name' limit 1
       ) extracted on true
      where i.status = 'OPEN' and (i.extraction_attempt_id is null or i.extraction_attempt_id = kd.active_extraction_attempt_id)
        and ${scope}
      order by case i.severity when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end, i.created_at desc
      limit 5`,
    params,
  )
  const issueCounts = await pool.query<{ total: string; high: string }>(
    `select count(*)::text as total,
            count(*) filter (where i.severity = 'HIGH')::text as high
       from k1_issues i join k1_documents kd on kd.id = i.k1_document_id
       left join partnerships p on p.id = kd.partnership_id
      where i.status = 'OPEN' and (i.extraction_attempt_id is null or i.extraction_attempt_id = kd.active_extraction_attempt_id)
        and ${scope}`,
    params,
  )
  return {
    statusCounts,
    recentK1Activity: wire.slice(0, 5),
    reviewK1s: wire
      .filter((row) => row.status === 'NEEDS_REVIEW' || row.status === 'READY_FOR_APPROVAL')
      .slice(0, 5) as DashboardSummaryResponse['reviewK1s'],
    openIssues: issues.rows.map((row) => ({
      id: row.id, entity: row.entity, partnership: row.partnership, message: row.message,
      severity: row.severity, createdAt: row.created_at.toISOString(), k1DocumentId: row.k1_document_id,
    })),
    openIssueCount: Number(issueCounts.rows[0]?.total ?? 0),
    highSeverityOpenIssues: Number(issueCounts.rows[0]?.high ?? 0),
  }
}
