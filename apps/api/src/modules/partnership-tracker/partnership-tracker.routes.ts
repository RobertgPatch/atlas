import type { FastifyInstance } from 'fastify'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { withSession } from '../auth/session.middleware.js'
import { requirePartnershipScope } from '../partnerships/partnershipScope.plugin.js'
import {
  calculateManualYearHandler,
  createCommitmentHandler,
  createManualYearHandler,
  createNavHandler,
  createPartnershipTrackerHandler,
  deleteCommitmentHandler,
  deleteManualYearHandler,
  deleteNavHandler,
  getManualYearHandler,
  getManagementFeesHandler,
  getPartnershipAggregationHandler,
  getPartnershipTrackerHandler,
  listCommitmentsHandler,
  listNavHandler,
  listPartnershipTrackerHandler,
  signoffManualYearHandler,
  updateCommitmentHandler,
  updateManualYearHandler,
  updateNavHandler,
  updatePartnershipTrackerHandler,
} from './partnership-tracker.handler.js'

export const registerPartnershipTrackerRoutes = async (app: FastifyInstance): Promise<void> => {
  const gated = { preHandler: [withSession, requireAuthenticated, requirePartnershipScope] }
  const root = '/partnership-tracker/partnerships'
  app.get('/partnership-tracker/aggregation', gated, getPartnershipAggregationHandler)
  app.get(root, gated, listPartnershipTrackerHandler)
  app.post(root, gated, createPartnershipTrackerHandler)
  app.get(`${root}/:partnershipId`, gated, getPartnershipTrackerHandler)
  app.patch(`${root}/:partnershipId`, gated, updatePartnershipTrackerHandler)
  app.get(`${root}/:partnershipId/management-fees`, gated, getManagementFeesHandler)
  app.get(`${root}/:partnershipId/commitments`, gated, listCommitmentsHandler)
  app.post(`${root}/:partnershipId/commitments`, gated, createCommitmentHandler)
  app.patch(`${root}/:partnershipId/commitments/:commitmentId`, gated, updateCommitmentHandler)
  app.delete(`${root}/:partnershipId/commitments/:commitmentId`, gated, deleteCommitmentHandler)
  app.get(`${root}/:partnershipId/nav`, gated, listNavHandler)
  app.post(`${root}/:partnershipId/nav`, gated, createNavHandler)
  app.patch(`${root}/:partnershipId/nav/:navEntryId`, gated, updateNavHandler)
  app.delete(`${root}/:partnershipId/nav/:navEntryId`, gated, deleteNavHandler)
  app.post(`${root}/:partnershipId/years`, gated, createManualYearHandler)
  app.get(`${root}/:partnershipId/years/:taxYear`, gated, getManualYearHandler)
  app.patch(`${root}/:partnershipId/years/:taxYear`, gated, updateManualYearHandler)
  app.delete(`${root}/:partnershipId/years/:taxYear`, gated, deleteManualYearHandler)
  app.post(`${root}/:partnershipId/years/:taxYear/calculate`, gated, calculateManualYearHandler)
  app.post(`${root}/:partnershipId/years/:taxYear/signoffs`, gated, signoffManualYearHandler)
}

export const partnershipTrackerRoutes = registerPartnershipTrackerRoutes
