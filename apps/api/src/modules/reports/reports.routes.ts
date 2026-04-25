import type { FastifyInstance } from 'fastify'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { requirePartnershipScope } from '../partnerships/partnershipScope.plugin.js'
import {
  getActivityDetailHandler,
  getAssetClassSummaryHandler,
  getPortfolioSummaryHandler,
  getReportsExportHandler,
  undoActivityDetailHandler,
  updateActivityDetailHandler,
} from './reports.handler.js'

export const registerReportsRoutes = async (app: FastifyInstance): Promise<void> => {
  const gated = { preHandler: [withSession, requireAuthenticated, requirePartnershipScope] }

  app.get('/reports/portfolio-summary', gated, getPortfolioSummaryHandler)
  app.get('/reports/asset-class-summary', gated, getAssetClassSummaryHandler)
  app.get('/reports/activity-detail', gated, getActivityDetailHandler)
  app.patch('/reports/activity-detail/:rowId', gated, updateActivityDetailHandler)
  app.post('/reports/activity-detail/:rowId/undo', gated, undoActivityDetailHandler)
  app.get('/reports/export', gated, getReportsExportHandler)
}
