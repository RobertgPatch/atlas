import type { FastifyInstance } from 'fastify'
import { requireAdminAccess } from './admin.guard.js'
import {
  changeRoleHandler,
  deactivateUserHandler,
  inviteUserHandler,
  listUsersHandler,
  reactivateUserHandler,
  resetMfaHandler,
} from './admin.handlers.js'

export const registerAdminRoutes = async (app: FastifyInstance) => {
  app.get('/admin/users', { preHandler: [requireAdminAccess] }, listUsersHandler)
  app.post('/admin/users/invitations', { preHandler: [requireAdminAccess] }, inviteUserHandler)
  app.patch('/admin/users/:userId/role', { preHandler: [requireAdminAccess] }, changeRoleHandler)
  app.post('/admin/users/:userId/deactivate', { preHandler: [requireAdminAccess] }, deactivateUserHandler)
  app.post('/admin/users/:userId/reactivate', { preHandler: [requireAdminAccess] }, reactivateUserHandler)
  app.post('/admin/users/:userId/mfa-reset', { preHandler: [requireAdminAccess] }, resetMfaHandler)
}
