import type { FastifyReply, FastifyRequest } from 'fastify'
import { authRepository } from './auth.repository.js'
import { config } from '../../config.js'

export const withSession = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const token = request.cookies[config.sessionCookieName]
  if (!token) return

  const session = authRepository.getSessionByToken(token)
  if (!session || !authRepository.isSessionValid(session)) return

  authRepository.touchSession(session.id)
  const user = authRepository.getUserById(session.userId)
  if (!user) return

  request.authUser = {
    userId: user.id,
    role: user.role,
    email: user.email,
    status: user.status,
  }
}
