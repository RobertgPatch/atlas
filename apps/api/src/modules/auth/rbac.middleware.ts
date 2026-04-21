import type { FastifyReply, FastifyRequest } from 'fastify'

export const requireAuthenticated = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
  }
}

export const requireAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  if (request.authUser.role !== 'Admin') {
    reply.status(403).send({ error: 'FORBIDDEN' })
  }
}
