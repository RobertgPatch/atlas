import type { FastifyReply, FastifyRequest } from 'fastify'
import { authRepository } from './auth.repository.js'
import { loginSchema } from './auth.schemas.js'
import { lockoutService } from './lockout.service.js'
import { auditRepository } from '../audit/audit.repository.js'
import { config } from '../../config.js'

export const loginHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const payload = loginSchema.safeParse(request.body)
  if (!payload.success) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const { email, password } = payload.data
  const lockout = await lockoutService.getLockout(email, 'PASSWORD')
  if (lockout) {
    reply.status(423).send({ error: 'ACCOUNT_LOCKED', lockoutUntil: lockout.toISOString() })
    return
  }

  const user = authRepository.findUserByEmail(email)
  const passwordValid = await authRepository.verifyPassword(user, password)
  if (!user || user.status === 'Inactive' || !passwordValid) {
    const lockoutUntil = await lockoutService.recordFailure(email, 'PASSWORD')
    await auditRepository.record({
      eventName: 'auth.login.failed',
      objectType: 'user',
      objectId: user?.id,
      after: { email },
    })

    if (lockoutUntil) {
      reply.status(423).send({ error: 'ACCOUNT_LOCKED', lockoutUntil: lockoutUntil.toISOString() })
      return
    }

    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  await lockoutService.clear(email, 'PASSWORD')
  const { token, session } = authRepository.createSession(user.id)

  await auditRepository.record({
    actorUserId: user.id,
    eventName: 'auth.login.succeeded',
    objectType: 'user',
    objectId: user.id,
  })

  reply.setCookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: config.sessionCookieSameSite,
    path: '/',
    maxAge: config.sessionAbsoluteTimeoutSeconds,
  })

  reply.send({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    },
    role: user.role,
    session: {
      issuedAt: session.issuedAt.toISOString(),
      idleTimeoutSeconds: config.sessionIdleTimeoutSeconds,
      absoluteTimeoutSeconds: config.sessionAbsoluteTimeoutSeconds,
    },
  })
}
