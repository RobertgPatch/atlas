import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdminAccess } from './admin.guard.js'
import { k1Repository } from '../k1/k1.repository.js'
import { reviewRepository } from '../review/review.repository.js'
import { auditRepository } from '../audit/audit.repository.js'

/**
 * Dev-only maintenance endpoints exposed on the Admin page. These let an Admin
 * wipe the in-memory dataset ("Clear all data") or reload the demo fixtures
 * ("Populate demo data"). They are intentionally no-ops in a production DB
 * deployment — see `process.env.DATABASE_URL` in routes that use them.
 */

const clearHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  k1Repository._debugClearAll()
  reviewRepository._debugReset()
  auditRepository.getInMemoryEvents().length = 0
  return reply.send({ ok: true, action: 'cleared' })
}

const seedHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  k1Repository._debugSeedAll()
  reviewRepository._debugReset()
  return reply.send({ ok: true, action: 'seeded' })
}

export const registerAdminDevRoutes = async (app: FastifyInstance) => {
  app.post('/admin/dev/clear', { preHandler: [requireAdminAccess] }, clearHandler)
  app.post('/admin/dev/seed', { preHandler: [requireAdminAccess] }, seedHandler)
}
