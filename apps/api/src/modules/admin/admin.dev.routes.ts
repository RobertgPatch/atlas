import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdminAccess } from './admin.guard.js'
import { authRepository } from '../auth/auth.repository.js'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import { partnershipsRepository } from '../partnerships/partnerships.repository.js'
import { capitalRepository } from '../partnerships/capital.repository.js'
import { fmvRepository } from '../partnerships/fmv.repository.js'
import { assetsRepository } from '../partnerships/assets.repository.js'
import {
  createInMemoryCommitment,
  createInMemoryCapitalActivity,
} from '../partnerships/capital.store.js'

/**
 * Dev-only maintenance endpoints exposed on the Admin page. These let an Admin
 * wipe the in-memory dataset ("Clear all data") or reload the demo fixtures
 * ("Populate demo data"). They are intentionally no-ops in a production DB
 * deployment — see `process.env.DATABASE_URL` in routes that use them.
 */

const clearAllInMemoryData = (): void => {
  // Order matters: clear partnership-management overlays + side stores first
  // (they reference partnership IDs from k1Repository), then K-1 data, then
  // review state and audit trail. After this completes, the only state left
  // is the auth users so an Admin can still sign in.
  partnershipsRepository._debugReset()
  capitalRepository._debugReset()
  fmvRepository._debugReset()
  assetsRepository._debugReset()
  k1Repository._debugClearAll()
  reviewRepository._debugReset()
  auditRepository.getInMemoryEvents().length = 0
}

const clearHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  clearAllInMemoryData()
  return reply.send({ ok: true, action: 'cleared' })
}

const PARTNERSHIP_DEMO_OVERLAY: Record<
  string,
  { assetClass: string; commitmentUsd: number; commitmentDate: string }
> = {
  'Blackstone Capital Partners VII': {
    assetClass: 'Private Equity',
    commitmentUsd: 5_000_000,
    commitmentDate: '2022-03-15',
  },
  'Sequoia Heritage Fund': {
    assetClass: 'Venture Capital',
    commitmentUsd: 3_000_000,
    commitmentDate: '2021-11-01',
  },
  'KKR Americas Fund XII': {
    assetClass: 'Private Equity',
    commitmentUsd: 4_000_000,
    commitmentDate: '2023-06-30',
  },
  'Carlyle Realty Partners IX': {
    assetClass: 'Real Estate',
    commitmentUsd: 2_500_000,
    commitmentDate: '2022-09-10',
  },
  'Apollo Investment Fund IX': {
    assetClass: 'Credit',
    commitmentUsd: 3_500_000,
    commitmentDate: '2023-01-20',
  },
}

/**
 * Populate the partnership-management slice (asset class, commitments,
 * capital activity, FMV) so the demo dataset exposes the current data model
 * instead of just the legacy K-1 surface.
 */
const seedPartnershipManagementDemo = async (): Promise<void> => {
  const adminUser = authRepository.listUsers().find((u) => u.role === 'Admin')
  const actorUserId = adminUser?.id ?? authRepository.listUsers()[0]?.id ?? ''
  const actorEmail = adminUser?.email ?? null

  for (const partnership of k1Repository.listPartnerships()) {
    const overlay = PARTNERSHIP_DEMO_OVERLAY[partnership.name]
    if (!overlay) continue

    partnershipsRepository._debugSetOverlay(partnership.id, {
      assetClass: overlay.assetClass,
      status: 'ACTIVE',
    })

    // Active commitment
    const commitment = createInMemoryCommitment({
      partnershipId: partnership.id,
      entityId: partnership.entityId,
      actorUserId,
      actorEmail,
      body: {
        commitmentAmountUsd: overlay.commitmentUsd,
        commitmentDate: overlay.commitmentDate,
        commitmentStartDate: overlay.commitmentDate,
        commitmentEndDate: null,
        status: 'ACTIVE',
        sourceType: 'manual',
        notes: 'Seeded demo commitment',
      },
    })

    // ~30% paid-in across 2 funded contributions in the year after commitment.
    const paidInTotal = Math.round(commitment.commitmentAmountUsd * 0.3)
    const contributionAmount = Math.round(paidInTotal / 2)
    const commitmentYear = Number(overlay.commitmentDate.slice(0, 4))

    createInMemoryCapitalActivity({
      partnershipId: partnership.id,
      entityId: partnership.entityId,
      actorUserId,
      actorEmail,
      body: {
        activityDate: `${commitmentYear}-06-15`,
        eventType: 'funded_contribution',
        amountUsd: contributionAmount,
        sourceType: 'manual',
        notes: 'Seeded capital call',
      },
    })

    createInMemoryCapitalActivity({
      partnershipId: partnership.id,
      entityId: partnership.entityId,
      actorUserId,
      actorEmail,
      body: {
        activityDate: `${commitmentYear + 1}-03-20`,
        eventType: 'funded_contribution',
        amountUsd: contributionAmount,
        sourceType: 'manual',
        notes: 'Seeded capital call',
      },
    })

    // Latest FMV snapshot — slightly above paid-in to produce non-trivial RVPI/TVPI.
    await fmvRepository.insertFmvSnapshot(
      partnership.id,
      {
        asOfDate: '2024-12-31',
        amountUsd: Math.round(paidInTotal * 1.15),
        source: 'manual',
        note: 'Seeded year-end FMV',
      },
      actorUserId,
      null,
    )

    // Recompute Activity Detail rows so the Reports page reflects the new state.
    await capitalRepository.syncActivityDetail(partnership.id, partnership.entityId)
  }
}

const seedHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  // Wipe first so seeding is idempotent; otherwise repeat presses pile up
  // overlays/commitments/activity rows.
  clearAllInMemoryData()
  k1Repository._debugSeedAll()
  await seedPartnershipManagementDemo()
  return reply.send({ ok: true, action: 'seeded' })
}

export const registerAdminDevRoutes = async (app: FastifyInstance) => {
  app.post('/admin/dev/clear', { preHandler: [requireAdminAccess] }, clearHandler)
  app.post('/admin/dev/seed', { preHandler: [requireAdminAccess] }, seedHandler)
}
