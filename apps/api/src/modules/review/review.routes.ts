import type { FastifyInstance } from 'fastify'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { requireK1Scope } from '../k1/k1Scope.plugin.js'
import { sessionHandler, pdfHandler } from './session.handler.js'
import { correctionsHandler } from './corrections.handler.js'
import { mapEntityHandler, mapPartnershipHandler } from './map.handler.js'
import { approveHandler } from './approve.handler.js'
import { finalizeHandler } from './finalize.handler.js'
import { openIssueHandler, resolveIssueHandler } from './issue.handler.js'
import { entityTypeaheadHandler, partnershipTypeaheadHandler } from './typeahead.handler.js'

export const registerReviewRoutes = async (app: FastifyInstance) => {
  const gated = { preHandler: [withSession, requireAuthenticated, requireK1Scope] }
  const authed = { preHandler: [withSession, requireAuthenticated] }

  // Typeahead lookups (no K1 scope required, just authenticated)
  app.get('/review/entities', authed, entityTypeaheadHandler)
  app.get('/review/partnerships', authed, partnershipTypeaheadHandler)

  // Review session
  app.get('/k1-documents/:k1DocumentId/review-session', gated, sessionHandler)
  app.get('/k1-documents/:k1DocumentId/pdf', gated, pdfHandler)

  // Corrections / mapping
  app.put('/k1-documents/:k1DocumentId/corrections', gated, correctionsHandler)
  app.put('/k1-documents/:k1DocumentId/map-entity', gated, mapEntityHandler)
  app.put('/k1-documents/:k1DocumentId/map-partnership', gated, mapPartnershipHandler)

  // Approve / finalize
  app.post('/k1-documents/:k1DocumentId/approve', gated, approveHandler)
  app.post('/k1-documents/:k1DocumentId/finalize', gated, finalizeHandler)

  // Issues
  app.post('/k1-documents/:k1DocumentId/issues', gated, openIssueHandler)
  app.post('/k1-documents/:k1DocumentId/issues/:issueId/resolve', gated, resolveIssueHandler)
}
