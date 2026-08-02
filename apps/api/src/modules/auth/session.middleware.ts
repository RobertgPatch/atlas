import type { FastifyReply, FastifyRequest } from 'fastify'
import { authRepository } from './auth.repository.js'
import { readSessionToken } from './session-cookie.js'

export const withSession = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const token = readSessionToken(request)
  if (!token) return

  const session = authRepository.getSessionByToken(token)
  if (!session || !authRepository.isSessionValid(session)) return

  const user = authRepository.getUserById(session.userId)
  if (!user || user.status !== 'Active') return
  authRepository.touchSession(session.id)

  request.authUser = {
    userId: user.id,
    role: user.role,
    email: user.email,
    status: user.status,
  }
}
