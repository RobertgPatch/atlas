import type { FastifyInstance } from 'fastify'
import { withSession } from '../auth/session.middleware.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { getDashboardSummaryHandler } from './dashboard.handler.js'

export const registerDashboardRoutes = async (app: FastifyInstance) => {
  app.get('/dashboard', { preHandler: [withSession, requireAuthenticated] }, getDashboardSummaryHandler)
}