import type { FastifyInstance } from 'fastify'
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
  const gated = { preHandler: [withSession, requireAuthenticated, requirePartnershipScope] }
  app.get('/k1-tracker/partnerships', gated, listK1TrackerPartnershipsHandler)
  app.get('/k1-tracker/partnerships/:partnershipId', gated, getK1TrackerPartnershipHandler)
  app.post('/k1-tracker/partnerships/:partnershipId/years', gated, createK1TrackerYearHandler)
  app.get('/k1-tracker/partnerships/:partnershipId/years/:taxYear', gated, getK1TrackerYearHandler)
  app.patch('/k1-tracker/partnerships/:partnershipId/years/:taxYear', gated, updateK1TrackerYearHandler)
  app.delete('/k1-tracker/partnerships/:partnershipId/years/:taxYear', gated, deleteK1TrackerYearHandler)
  app.post('/k1-tracker/partnerships/:partnershipId/years/:taxYear/calculate', gated, calculateK1TrackerYearHandler)
  app.post('/k1-tracker/partnerships/:partnershipId/years/:taxYear/signoffs', gated, signoffK1TrackerYearHandler)
  app.post('/k1-tracker/imports/preview', gated, previewK1TrackerImportHandler)
  app.post('/k1-tracker/imports/:importBatchId/commit', gated, commitK1TrackerImportHandler)
}
