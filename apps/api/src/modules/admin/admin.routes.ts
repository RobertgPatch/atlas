import type { FastifyInstance } from 'fastify'
import { requireAdminAccess } from './admin.guard.js'
import {
  changeRoleHandler,
  deactivateUserHandler,
  getUserDetailHandler,
  inviteUserHandler,
  listUsersHandler,
  reactivateUserHandler,
  resetMfaHandler,
} from './admin.handlers.js'
import {
  getPlaidRefreshStatusHandler,
  runPlaidRefreshHandler,
} from './plaid-refresh-status.handler.js'
import { getProductionReadinessHandler } from './production-readiness.handler.js'

export const registerAdminRoutes = async (app: FastifyInstance) => {
  app.get('/admin/users', { preHandler: [requireAdminAccess] }, listUsersHandler)
  app.get('/admin/users/:userId', { preHandler: [requireAdminAccess] }, getUserDetailHandler)
  app.post('/admin/users/invitations', { preHandler: [requireAdminAccess] }, inviteUserHandler)
  app.patch('/admin/users/:userId/role', { preHandler: [requireAdminAccess] }, changeRoleHandler)
  app.post('/admin/users/:userId/deactivate', { preHandler: [requireAdminAccess] }, deactivateUserHandler)
  app.post('/admin/users/:userId/reactivate', { preHandler: [requireAdminAccess] }, reactivateUserHandler)
  app.post('/admin/users/:userId/mfa-reset', { preHandler: [requireAdminAccess] }, resetMfaHandler)
  app.get('/admin/plaid-refresh-status', { preHandler: [requireAdminAccess] }, getPlaidRefreshStatusHandler)
  app.post('/admin/plaid-refresh/run', runPlaidRefreshHandler)
  app.get('/admin/production-readiness', { preHandler: [requireAdminAccess] }, getProductionReadinessHandler)
}
