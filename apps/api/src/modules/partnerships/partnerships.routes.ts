import type { FastifyInstance } from 'fastify'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { requirePartnershipScope } from './partnershipScope.plugin.js'
import {
  listPartnershipsHandler,
  exportPartnershipsHandler,
  getPartnershipDetailHandler,
  createPartnershipHandler,
  updatePartnershipHandler,
} from './partnerships.handler.js'
import { getEntityDetailHandler } from './entities.handler.js'
import { registerEntityAdminRoutes } from './entities.admin.routes.js'
import { listFmvSnapshotsHandler, createFmvSnapshotHandler } from './fmv.handler.js'
import {
  listPartnershipAssetsHandler,
  getPartnershipAssetHandler,
  createPartnershipAssetHandler,
} from './assets.handler.js'
import {
  listAssetFmvSnapshotsHandler,
  createAssetFmvSnapshotHandler,
} from './assetFmv.handler.js'
import {
  listCommitmentsHandler,
  createCommitmentHandler,
  updateCommitmentHandler,
  listCapitalActivityHandler,
  createCapitalActivityHandler,
  updateCapitalActivityHandler,
} from './capital.handler.js'

/**
 * Partnership Management routes registration.
 * Full path prefix is /v1 (applied by the routes/index.ts mount).
 */
export const registerPartnershipRoutes = async (app: FastifyInstance): Promise<void> => {
  const gated = { preHandler: [withSession, requireAuthenticated, requirePartnershipScope] }

  // ── US1: Partnership Directory ─────────────────────────────────────────
  app.get('/partnerships', gated, listPartnershipsHandler)
  app.get('/partnerships/export.csv', gated, exportPartnershipsHandler)
  // ── US2: Partnership Detail ────────────────────────────────────────────
  app.get('/partnerships/:id', gated, getPartnershipDetailHandler)
  // ── US3: Entity Detail ─────────────────────────────────────────────────
  app.get('/entities/:id', gated, getEntityDetailHandler)
  // ── US4: Admin writes ──────────────────────────────────────────────────
  app.post('/partnerships', gated, createPartnershipHandler)
  app.patch('/partnerships/:id', gated, updatePartnershipHandler)
  // ── US5: FMV snapshots ─────────────────────────────────────────────────
  app.get('/partnerships/:id/fmv-snapshots', gated, listFmvSnapshotsHandler)
  app.post('/partnerships/:id/fmv-snapshots', gated, createFmvSnapshotHandler)

  // ── Feature 009: partnership assets ────────────────────────────────────
  app.get('/partnerships/:partnershipId/assets', gated, listPartnershipAssetsHandler)
  app.get('/partnerships/:partnershipId/assets/:assetId', gated, getPartnershipAssetHandler)
  app.post('/partnerships/:partnershipId/assets', gated, createPartnershipAssetHandler)
  app.get(
    '/partnerships/:partnershipId/assets/:assetId/fmv-snapshots',
    gated,
    listAssetFmvSnapshotsHandler,
  )
  app.post(
    '/partnerships/:partnershipId/assets/:assetId/fmv-snapshots',
    gated,
    createAssetFmvSnapshotHandler,
  )

  // ── Feature 010: commitments + capital activity ────────────────────────
  app.get('/partnerships/:partnershipId/commitments', gated, listCommitmentsHandler)
  app.post('/partnerships/:partnershipId/commitments', gated, createCommitmentHandler)
  app.patch(
    '/partnerships/:partnershipId/commitments/:commitmentId',
    gated,
    updateCommitmentHandler,
  )
  app.get('/partnerships/:partnershipId/capital-activity', gated, listCapitalActivityHandler)
  app.post('/partnerships/:partnershipId/capital-activity', gated, createCapitalActivityHandler)
  app.patch(
    '/partnerships/:partnershipId/capital-activity/:eventId',
    gated,
    updateCapitalActivityHandler,
  )

  // ── Entity management (list + admin CRUD) ──────────────────────────────
  await registerEntityAdminRoutes(app)
}
