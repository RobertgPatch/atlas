import type { FastifyInstance } from 'fastify'
import {
  defaultRouteProtectionPolicy,
  type HttpMethod,
} from '../abuse-protection/index.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { withSession } from '../auth/session.middleware.js'
import { requirePartnershipScope } from '../partnerships/partnershipScope.plugin.js'
import {
  calculateManualYearHandler,
  createCapitalActivitiesHandler,
  createCapitalActivityHandler,
  createCommitmentHandler,
  createManualYearHandler,
  createPartnershipCashFlowHandler,
  createPartnershipCashFlowsHandler,
  createNavHandler,
  createPartnershipTrackerHandler,
  deleteCommitmentHandler,
  deleteCapitalActivityHandler,
  deleteManualYearHandler,
  deletePartnershipTrackerHandler,
  deletePartnershipCashFlowHandler,
  deleteNavHandler,
  getManualYearHandler,
  getManagementFeesHandler,
  getPartnershipAggregationHandler,
  getPartnershipTrackerHandler,
  listCommitmentsHandler,
  listNavHandler,
  listPartnershipTrackerHandler,
  signoffManualYearHandler,
  settleCapitalActivityHandler,
  updateCommitmentHandler,
  updateManualYearHandler,
  updateNavHandler,
  updatePartnershipTrackerHandler,
} from './partnership-tracker.handler.js'

export const registerPartnershipTrackerRoutes = async (app: FastifyInstance): Promise<void> => {
  const gated = (method: HttpMethod, routePattern: string) => ({
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, routePattern),
    },
    preHandler: [withSession, requireAuthenticated, requirePartnershipScope],
  })
  const root = '/partnership-tracker/partnerships'
  const canonicalRoot = '/v1/partnership-tracker/partnerships'
  app.get('/partnership-tracker/aggregation', gated('GET', '/v1/partnership-tracker/aggregation'), getPartnershipAggregationHandler)
  app.get(root, gated('GET', canonicalRoot), listPartnershipTrackerHandler)
  app.post(root, gated('POST', canonicalRoot), createPartnershipTrackerHandler)
  app.get(`${root}/:partnershipId`, gated('GET', `${canonicalRoot}/:partnershipId`), getPartnershipTrackerHandler)
  app.patch(`${root}/:partnershipId`, gated('PATCH', `${canonicalRoot}/:partnershipId`), updatePartnershipTrackerHandler)
  app.delete(`${root}/:partnershipId`, gated('DELETE', `${canonicalRoot}/:partnershipId`), deletePartnershipTrackerHandler)
  app.get(`${root}/:partnershipId/management-fees`, gated('GET', `${canonicalRoot}/:partnershipId/management-fees`), getManagementFeesHandler)
  app.get(`${root}/:partnershipId/commitments`, gated('GET', `${canonicalRoot}/:partnershipId/commitments`), listCommitmentsHandler)
  app.post(`${root}/:partnershipId/commitments`, gated('POST', `${canonicalRoot}/:partnershipId/commitments`), createCommitmentHandler)
  app.patch(`${root}/:partnershipId/commitments/:commitmentId`, gated('PATCH', `${canonicalRoot}/:partnershipId/commitments/:commitmentId`), updateCommitmentHandler)
  app.delete(`${root}/:partnershipId/commitments/:commitmentId`, gated('DELETE', `${canonicalRoot}/:partnershipId/commitments/:commitmentId`), deleteCommitmentHandler)
  app.get(`${root}/:partnershipId/nav`, gated('GET', `${canonicalRoot}/:partnershipId/nav`), listNavHandler)
  app.post(`${root}/:partnershipId/nav`, gated('POST', `${canonicalRoot}/:partnershipId/nav`), createNavHandler)
  app.patch(`${root}/:partnershipId/nav/:navEntryId`, gated('PATCH', `${canonicalRoot}/:partnershipId/nav/:navEntryId`), updateNavHandler)
  app.delete(`${root}/:partnershipId/nav/:navEntryId`, gated('DELETE', `${canonicalRoot}/:partnershipId/nav/:navEntryId`), deleteNavHandler)
  app.post(`${root}/:partnershipId/cash-flows`, gated('POST', `${canonicalRoot}/:partnershipId/cash-flows`), createCapitalActivityHandler)
  app.post(`${root}/:partnershipId/cash-flows/batch`, gated('POST', `${canonicalRoot}/:partnershipId/cash-flows/batch`), createCapitalActivitiesHandler)
  app.patch(`${root}/:partnershipId/cash-flows/:cashFlowId/settlement`, gated('PATCH', `${canonicalRoot}/:partnershipId/cash-flows/:cashFlowId/settlement`), settleCapitalActivityHandler)
  app.delete(`${root}/:partnershipId/cash-flows/:cashFlowId`, gated('DELETE', `${canonicalRoot}/:partnershipId/cash-flows/:cashFlowId`), deleteCapitalActivityHandler)
  app.post(`${root}/:partnershipId/years`, gated('POST', `${canonicalRoot}/:partnershipId/years`), createManualYearHandler)
  app.get(`${root}/:partnershipId/years/:taxYear`, gated('GET', `${canonicalRoot}/:partnershipId/years/:taxYear`), getManualYearHandler)
  app.patch(`${root}/:partnershipId/years/:taxYear`, gated('PATCH', `${canonicalRoot}/:partnershipId/years/:taxYear`), updateManualYearHandler)
  app.post(`${root}/:partnershipId/years/:taxYear/cash-flows`, gated('POST', `${canonicalRoot}/:partnershipId/years/:taxYear/cash-flows`), createPartnershipCashFlowHandler)
  app.post(`${root}/:partnershipId/years/:taxYear/cash-flows/batch`, gated('POST', `${canonicalRoot}/:partnershipId/years/:taxYear/cash-flows/batch`), createPartnershipCashFlowsHandler)
  app.delete(`${root}/:partnershipId/years/:taxYear/cash-flows/:cashFlowId`, gated('DELETE', `${canonicalRoot}/:partnershipId/years/:taxYear/cash-flows/:cashFlowId`), deletePartnershipCashFlowHandler)
  app.delete(`${root}/:partnershipId/years/:taxYear`, gated('DELETE', `${canonicalRoot}/:partnershipId/years/:taxYear`), deleteManualYearHandler)
  app.post(`${root}/:partnershipId/years/:taxYear/calculate`, gated('POST', `${canonicalRoot}/:partnershipId/years/:taxYear/calculate`), calculateManualYearHandler)
  app.post(`${root}/:partnershipId/years/:taxYear/signoffs`, gated('POST', `${canonicalRoot}/:partnershipId/years/:taxYear/signoffs`), signoffManualYearHandler)
}

export const partnershipTrackerRoutes = registerPartnershipTrackerRoutes
