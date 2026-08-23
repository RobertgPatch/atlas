import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../../config.js'

const clearInvalidSessionCookie = (reply: FastifyReply) => {
  reply.clearCookie(config.sessionCookieName, { path: '/' })
}

export const requireAuthenticated = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    clearInvalidSessionCookie(reply)
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }
}

export const requireAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    clearInvalidSessionCookie(reply)
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  if (request.authUser.role !== 'Admin') {
    reply.status(403).send({ error: 'FORBIDDEN' })
    return
  }
}
