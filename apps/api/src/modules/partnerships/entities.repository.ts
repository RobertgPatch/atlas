import { pool } from '../../infra/db/client.js'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import type { EntityDetail } from '../../../../../packages/types/src/partnership-management.js'

export const entitiesRepository = {
  async getEntityDetail(
    entityId: string,
    scope: { isAdmin: boolean; entityIds: string[] },
  ): Promise<EntityDetail | null> {
    // Scope check: non-Admin must have this entity in their memberships
    if (!scope.isAdmin && !scope.entityIds.includes(entityId)) return null

    if (!pool) {
      // In-memory fallback (local dev without DATABASE_URL).
      const entity = k1Repository.listEntities().find((e) => e.id === entityId)
      if (!entity) return null

      const partnershipRecords = k1Repository
        .listPartnerships()
        .filter((p) => p.entityId === entityId)

      const partnerships = partnershipRecords.map((p) => {
        // Latest K-1 (any status) with a distribution value, newest first.
        const candidates = k1Repository
          .listK1sForPartnership(p.id)
          .filter((k) => k.taxYear != null)
          .sort(
            (a, b) =>
              (b.taxYear as number) - (a.taxYear as number) ||
              b.uploadedAt.getTime() - a.uploadedAt.getTime(),
          )
        let latest: { k1: (typeof candidates)[number]; amount: string | null } | null = null
        for (const k of candidates) {
          const dist = reviewRepository.getEffectiveReportedDistribution(k.id)
          const amt = dist?.reportedDistributionAmount ?? null
          if (amt != null) {
            latest = { k1: k, amount: amt }
            break
          }
        }
        if (!latest && candidates[0]) latest = { k1: candidates[0], amount: null }
        return {
          id: p.id,
          name: p.name,
          entity: { id: entityId, name: entity.name },
          assetClass: null,
          status: 'ACTIVE' as const,
          latestK1Year: latest?.k1.taxYear ?? null,
          latestDistributionUsd: latest?.amount != null ? Number(latest.amount) : null,
          latestFmv: null,
        }
      })

      const latestK1Year = partnerships.reduce<number | null>((acc, p) => {
        if (p.latestK1Year == null) return acc
        return acc == null || p.latestK1Year > acc ? p.latestK1Year : acc
      }, null)
      const totalDistributionsUsd = partnerships.reduce(
        (sum, p) => sum + (p.latestDistributionUsd ?? 0),
        0,
      )

      return {
        entity: {
          id: entity.id,
          name: entity.name,
          entityType: 'UNKNOWN',
          status: 'ACTIVE',
          notes: null,
        },
        partnerships,
        rollup: {
          partnershipCount: partnerships.length,
          totalDistributionsUsd,
          totalFmvUsd: 0,
          latestK1Year,
        },
      }
    }

    // Fetch entity row
    const entityResult = await pool.query(
      `select id, name, entity_type, status, notes from entities where id = $1`,
      [entityId],
    )
    if (!entityResult.rows[0]) return null
    const e = entityResult.rows[0]

    // Fetch scoped partnerships with derived KPIs (mirrors the list CTE)
    const partnershipsSql = `
      with
      latest_k1 as (
        select distinct on (krd.partnership_id)
          krd.partnership_id,
          kd.tax_year               as latest_k1_year,
          krd.reported_distribution_amount as latest_distribution_usd
        from k1_reported_distributions krd
        join k1_documents kd
          on kd.id = krd.k1_document_id
         and kd.processing_status = 'FINALIZED'
        order by krd.partnership_id, kd.tax_year desc, kd.finalized_at desc nulls last
      ),
      latest_fmv as (
        select distinct on (fmv.partnership_id)
          fmv.partnership_id,
          fmv.fmv_amount,
          fmv.valuation_date as as_of_date,
          fmv.created_at
        from partnership_fmv_snapshots fmv
        order by fmv.partnership_id, fmv.created_at desc, fmv.valuation_date desc, fmv.id desc
      )
      select
        p.id, p.name, p.asset_class, p.status,
        kpi.latest_k1_year,
        kpi.latest_distribution_usd,
        fmv.fmv_amount          as fmv_amount_usd,
        fmv.as_of_date          as fmv_as_of_date,
        fmv.created_at          as fmv_created_at
      from partnerships p
      left join latest_k1 kpi on kpi.partnership_id = p.id
      left join latest_fmv fmv on fmv.partnership_id = p.id
      where p.entity_id = $1
      order by p.name asc, p.id asc
    `
    const partnershipsResult = await pool.query(partnershipsSql, [entityId])

    // Build rollup
    let partnershipCount = 0
    let totalDistributionsUsd = 0
    let totalFmvUsd = 0
    let latestK1Year: number | null = null

    const partnerships = partnershipsResult.rows.map((r) => {
      partnershipCount++
      if (r.latest_distribution_usd != null) totalDistributionsUsd += Number(r.latest_distribution_usd)
      if (r.fmv_amount_usd != null) totalFmvUsd += Number(r.fmv_amount_usd)
      if (r.latest_k1_year != null) {
        const year = Number(r.latest_k1_year)
        if (latestK1Year === null || year > latestK1Year) latestK1Year = year
      }
      return {
        id: r.id,
        name: r.name,
        entity: { id: entityId, name: e.name },
        assetClass: r.asset_class ?? null,
        status: r.status,
        latestK1Year: r.latest_k1_year ?? null,
        latestDistributionUsd: r.latest_distribution_usd ?? null,
        latestFmv: r.fmv_amount_usd != null
          ? { amountUsd: Number(r.fmv_amount_usd), asOfDate: r.fmv_as_of_date, createdAt: r.fmv_created_at }
          : null,
      }
    })

    return {
      entity: {
        id: e.id,
        name: e.name,
        entityType: e.entity_type,
        status: e.status,
        notes: e.notes ?? null,
      },
      partnerships,
      rollup: {
        partnershipCount,
        totalDistributionsUsd,
        totalFmvUsd,
        latestK1Year,
      },
    }
  },
}
