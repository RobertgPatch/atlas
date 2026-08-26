import type { FastifyInstance } from 'fastify'
import {
  defaultRouteProtectionPolicy,
  type HttpMethod,
} from '../abuse-protection/index.js'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { getDashboardSummaryHandler } from './dashboard.handler.js'

const abuseProtection = (method: HttpMethod, routePattern: string) => ({
  abuseProtection: defaultRouteProtectionPolicy(method, routePattern),
})

export const registerDashboardRoutes = async (app: FastifyInstance) => {
  app.get('/dashboard', {
    config: abuseProtection('GET', '/v1/dashboard'),
    preHandler: [withSession, requireAuthenticated],
  }, getDashboardSummaryHandler)
}
