import type { FastifyReply, FastifyRequest } from 'fastify'
import { withSession } from '../auth/session.middleware.js'
import { requireAdmin } from '../auth/rbac.middleware.js'

export const requireAdminAccess = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  await withSession(request, reply)
  await requireAdmin(request, reply)
}
