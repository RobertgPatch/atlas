import type { FastifyInstance } from 'fastify'
import { defaultRouteProtectionPolicy } from '../abuse-protection/policy.defaults.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { withSession } from '../auth/session.middleware.js'
import { requirePartnershipScope } from '../partnerships/partnershipScope.plugin.js'
import {
  calculateK1TrackerYearHandler, commitK1TrackerImportHandler, createK1TrackerYearHandler,
  deleteK1TrackerYearHandler, getK1TrackerPartnershipHandler, getK1TrackerYearHandler,
  listK1TrackerPartnershipsHandler, previewK1TrackerImportHandler, signoffK1TrackerYearHandler,
  updateK1TrackerYearHandler,
} from './k1-tracker.handler.js'

export const registerK1TrackerRoutes = async (app: FastifyInstance): Promise<void> => {
  const gated = (
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST',
    routePattern: string,
  ) => ({
    preHandler: [withSession, requireAuthenticated, requirePartnershipScope],
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, `/v1${routePattern}`),
    },
  })
  app.get(
    '/k1-tracker/partnerships',
    gated('GET', '/k1-tracker/partnerships'),
    listK1TrackerPartnershipsHandler,
  )
  app.get(
    '/k1-tracker/partnerships/:partnershipId',
    gated('GET', '/k1-tracker/partnerships/:partnershipId'),
    getK1TrackerPartnershipHandler,
  )
  app.post(
    '/k1-tracker/partnerships/:partnershipId/years',
    gated('POST', '/k1-tracker/partnerships/:partnershipId/years'),
    createK1TrackerYearHandler,
  )
  app.get(
    '/k1-tracker/partnerships/:partnershipId/years/:taxYear',
    gated('GET', '/k1-tracker/partnerships/:partnershipId/years/:taxYear'),
    getK1TrackerYearHandler,
  )
  app.patch(
    '/k1-tracker/partnerships/:partnershipId/years/:taxYear',
    gated('PATCH', '/k1-tracker/partnerships/:partnershipId/years/:taxYear'),
    updateK1TrackerYearHandler,
  )
  app.delete(
    '/k1-tracker/partnerships/:partnershipId/years/:taxYear',
    gated('DELETE', '/k1-tracker/partnerships/:partnershipId/years/:taxYear'),
    deleteK1TrackerYearHandler,
  )
  app.post(
    '/k1-tracker/partnerships/:partnershipId/years/:taxYear/calculate',
    gated('POST', '/k1-tracker/partnerships/:partnershipId/years/:taxYear/calculate'),
    calculateK1TrackerYearHandler,
  )
  app.post(
    '/k1-tracker/partnerships/:partnershipId/years/:taxYear/signoffs',
    gated('POST', '/k1-tracker/partnerships/:partnershipId/years/:taxYear/signoffs'),
    signoffK1TrackerYearHandler,
  )
  app.post(
    '/k1-tracker/imports/preview',
    gated('POST', '/k1-tracker/imports/preview'),
    previewK1TrackerImportHandler,
  )
  app.post(
    '/k1-tracker/imports/:importBatchId/commit',
    gated('POST', '/k1-tracker/imports/:importBatchId/commit'),
    commitK1TrackerImportHandler,
  )
}
