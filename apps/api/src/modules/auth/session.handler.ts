import type { FastifyReply, FastifyRequest } from 'fastify'
import { authRepository } from './auth.repository.js'
import { config } from '../../config.js'

export const getSessionHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const authUser = request.authUser
  if (!authUser) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  reply.send({
    user: {
      id: authUser.userId,
      email: authUser.email,
      role: authUser.role,
      status: authUser.status,
    },
    role: authUser.role,
    session: {
      issuedAt: new Date().toISOString(),
      idleTimeoutSeconds: config.sessionIdleTimeoutSeconds,
      absoluteTimeoutSeconds: config.sessionAbsoluteTimeoutSeconds,
    },
  })
}

export const logoutHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const token = request.cookies[config.sessionCookieName]
  if (token) {
    const session = authRepository.getSessionByToken(token)
    if (session) {
      authRepository.revokeSession(session.id, 'sign-out')
    }
  }

  reply.clearCookie(config.sessionCookieName, { path: '/' })
  reply.status(204).send()
}
