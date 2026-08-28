import type { FastifyInstance } from 'fastify'
import { defaultRouteProtectionPolicy } from '../abuse-protection/policy.defaults.js'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { requirePartnershipScope } from '../partnerships/partnershipScope.plugin.js'
import {
  getActivityDetailHandler,
  getAssetClassSummaryHandler,
  getConsolidatedHoldingsExportHandler,
  getConsolidatedHoldingsHandler,
  getLiquidityPerformanceHandler,
  getPortfolioSummaryHandler,
  getReportsExportHandler,
  refreshConsolidatedHoldingsHandler,
  undoActivityDetailHandler,
  updateActivityDetailHandler,
} from './reports.handler.js'

export const registerReportsRoutes = async (app: FastifyInstance): Promise<void> => {
  const gated = (method: 'GET' | 'PATCH' | 'POST', routePattern: string) => ({
    preHandler: [withSession, requireAuthenticated, requirePartnershipScope],
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, `/v1${routePattern}`),
    },
  })

  app.get(
    '/reports/portfolio-summary',
    gated('GET', '/reports/portfolio-summary'),
    getPortfolioSummaryHandler,
  )
  app.get(
    '/reports/asset-class-summary',
    gated('GET', '/reports/asset-class-summary'),
    getAssetClassSummaryHandler,
  )
  app.get(
    '/reports/activity-detail',
    gated('GET', '/reports/activity-detail'),
    getActivityDetailHandler,
  )
  app.get(
    '/reports/consolidated-holdings',
    gated('GET', '/reports/consolidated-holdings'),
    getConsolidatedHoldingsHandler,
  )
  app.get(
    '/reports/consolidated-holdings/performance',
    gated('GET', '/reports/consolidated-holdings/performance'),
    getLiquidityPerformanceHandler,
  )
  app.get(
    '/reports/consolidated-holdings/export',
    gated('GET', '/reports/consolidated-holdings/export'),
    getConsolidatedHoldingsExportHandler,
  )
  app.post(
    '/reports/consolidated-holdings/refresh',
    gated('POST', '/reports/consolidated-holdings/refresh'),
    refreshConsolidatedHoldingsHandler,
  )
  app.patch(
    '/reports/activity-detail/:rowId',
    gated('PATCH', '/reports/activity-detail/:rowId'),
    updateActivityDetailHandler,
  )
  app.post(
    '/reports/activity-detail/:rowId/undo',
    gated('POST', '/reports/activity-detail/:rowId/undo'),
    undoActivityDetailHandler,
  )
  app.get(
    '/reports/export',
    gated('GET', '/reports/export'),
    getReportsExportHandler,
  )
}
