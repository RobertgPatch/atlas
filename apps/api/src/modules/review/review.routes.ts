import type { FastifyInstance } from 'fastify'
import { defaultRouteProtectionPolicy } from '../abuse-protection/policy.defaults.js'
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
import { resolveK1MatchHandler } from '../k1/matching/k1Match.handler.js'

export const registerReviewRoutes = async (app: FastifyInstance) => {
  const gated = (method: 'GET' | 'POST' | 'PUT', routePattern: string) => ({
    preHandler: [withSession, requireAuthenticated, requireK1Scope],
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, `/v1${routePattern}`),
    },
  })
  const authed = (method: 'GET', routePattern: string) => ({
    preHandler: [withSession, requireAuthenticated],
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, `/v1${routePattern}`),
    },
  })

  // Typeahead lookups (no K1 scope required, just authenticated)
  app.get(
    '/review/entities',
    authed('GET', '/review/entities'),
    entityTypeaheadHandler,
  )
  app.get(
    '/review/partnerships',
    authed('GET', '/review/partnerships'),
    partnershipTypeaheadHandler,
  )

  // Review session
  app.get(
    '/k1-documents/:k1DocumentId/review-session',
    gated('GET', '/k1-documents/:k1DocumentId/review-session'),
    sessionHandler,
  )
  app.get(
    '/k1-documents/:k1DocumentId/pdf',
    gated('GET', '/k1-documents/:k1DocumentId/pdf'),
    pdfHandler,
  )

  // Corrections / mapping
  app.put(
    '/k1-documents/:k1DocumentId/corrections',
    gated('PUT', '/k1-documents/:k1DocumentId/corrections'),
    correctionsHandler,
  )
  app.put(
    '/k1-documents/:k1DocumentId/map-entity',
    gated('PUT', '/k1-documents/:k1DocumentId/map-entity'),
    mapEntityHandler,
  )
  app.put(
    '/k1-documents/:k1DocumentId/map-partnership',
    gated('PUT', '/k1-documents/:k1DocumentId/map-partnership'),
    mapPartnershipHandler,
  )
  app.put(
    '/k1-documents/:k1DocumentId/match',
    gated('PUT', '/k1-documents/:k1DocumentId/match'),
    resolveK1MatchHandler,
  )

  // Approve / finalize
  app.post(
    '/k1-documents/:k1DocumentId/approve',
    gated('POST', '/k1-documents/:k1DocumentId/approve'),
    approveHandler,
  )
  app.post(
    '/k1-documents/:k1DocumentId/finalize',
    gated('POST', '/k1-documents/:k1DocumentId/finalize'),
    finalizeHandler,
  )

  // Issues
  app.post(
    '/k1-documents/:k1DocumentId/issues',
    gated('POST', '/k1-documents/:k1DocumentId/issues'),
    openIssueHandler,
  )
  app.post(
    '/k1-documents/:k1DocumentId/issues/:issueId/resolve',
    gated('POST', '/k1-documents/:k1DocumentId/issues/:issueId/resolve'),
    resolveIssueHandler,
  )
}
