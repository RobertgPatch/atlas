import type { FastifyInstance } from 'fastify'
import {
  defaultRouteProtectionPolicy,
  type HttpMethod,
} from '../abuse-protection/index.js'
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
  updatePartnershipAssetHandler,
  deletePartnershipAssetHandler,
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
  const gated = (method: HttpMethod, routePattern: string) => ({
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, routePattern),
    },
    preHandler: [withSession, requireAuthenticated, requirePartnershipScope],
  })

  // ── US1: Partnership Directory ─────────────────────────────────────────
  app.get('/partnerships', gated('GET', '/v1/partnerships'), listPartnershipsHandler)
  app.get('/partnerships/export.csv', gated('GET', '/v1/partnerships/export.csv'), exportPartnershipsHandler)
  // ── US2: Partnership Detail ────────────────────────────────────────────
  app.get('/partnerships/:id', gated('GET', '/v1/partnerships/:id'), getPartnershipDetailHandler)
  // ── US3: Entity Detail ─────────────────────────────────────────────────
  app.get('/entities/:id', gated('GET', '/v1/entities/:id'), getEntityDetailHandler)
  // ── US4: Admin writes ──────────────────────────────────────────────────
  app.post('/partnerships', gated('POST', '/v1/partnerships'), createPartnershipHandler)
  app.patch('/partnerships/:id', gated('PATCH', '/v1/partnerships/:id'), updatePartnershipHandler)
  // ── US5: FMV snapshots ─────────────────────────────────────────────────
  app.get('/partnerships/:id/fmv-snapshots', gated('GET', '/v1/partnerships/:id/fmv-snapshots'), listFmvSnapshotsHandler)
  app.post('/partnerships/:id/fmv-snapshots', gated('POST', '/v1/partnerships/:id/fmv-snapshots'), createFmvSnapshotHandler)

  // ── Feature 009: partnership assets ────────────────────────────────────
  app.get('/partnerships/:partnershipId/assets', gated('GET', '/v1/partnerships/:partnershipId/assets'), listPartnershipAssetsHandler)
  app.get('/partnerships/:partnershipId/assets/:assetId', gated('GET', '/v1/partnerships/:partnershipId/assets/:assetId'), getPartnershipAssetHandler)
  app.post('/partnerships/:partnershipId/assets', gated('POST', '/v1/partnerships/:partnershipId/assets'), createPartnershipAssetHandler)
  app.patch('/partnerships/:partnershipId/assets/:assetId', gated('PATCH', '/v1/partnerships/:partnershipId/assets/:assetId'), updatePartnershipAssetHandler)
  app.delete('/partnerships/:partnershipId/assets/:assetId', gated('DELETE', '/v1/partnerships/:partnershipId/assets/:assetId'), deletePartnershipAssetHandler)
  app.get(
    '/partnerships/:partnershipId/assets/:assetId/fmv-snapshots',
    gated('GET', '/v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots'),
    listAssetFmvSnapshotsHandler,
  )
  app.post(
    '/partnerships/:partnershipId/assets/:assetId/fmv-snapshots',
    gated('POST', '/v1/partnerships/:partnershipId/assets/:assetId/fmv-snapshots'),
    createAssetFmvSnapshotHandler,
  )

  // ── Feature 010: commitments + capital activity ────────────────────────
  app.get('/partnerships/:partnershipId/commitments', gated('GET', '/v1/partnerships/:partnershipId/commitments'), listCommitmentsHandler)
  app.post('/partnerships/:partnershipId/commitments', gated('POST', '/v1/partnerships/:partnershipId/commitments'), createCommitmentHandler)
  app.patch(
    '/partnerships/:partnershipId/commitments/:commitmentId',
    gated('PATCH', '/v1/partnerships/:partnershipId/commitments/:commitmentId'),
    updateCommitmentHandler,
  )
  app.get('/partnerships/:partnershipId/capital-activity', gated('GET', '/v1/partnerships/:partnershipId/capital-activity'), listCapitalActivityHandler)
  app.post('/partnerships/:partnershipId/capital-activity', gated('POST', '/v1/partnerships/:partnershipId/capital-activity'), createCapitalActivityHandler)
  app.patch(
    '/partnerships/:partnershipId/capital-activity/:eventId',
    gated('PATCH', '/v1/partnerships/:partnershipId/capital-activity/:eventId'),
    updateCapitalActivityHandler,
  )

  // ── Entity management (list + admin CRUD) ──────────────────────────────
  await registerEntityAdminRoutes(app)
}
