import type { FastifyReply, FastifyRequest } from 'fastify'
import { withSession } from '../auth/session.middleware.js'
import { requireAdmin, requireSuperAdmin } from '../auth/rbac.middleware.js'

export const requireAdminAccess = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  await withSession(request, reply)
  if (reply.sent) return
  await requireAdmin(request, reply)
}


export const requireSuperAdminAccess = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  await withSession(request, reply)
  if (reply.sent) return
  await requireSuperAdmin(request, reply)
}
