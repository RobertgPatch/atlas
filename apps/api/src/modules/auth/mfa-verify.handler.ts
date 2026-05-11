import type { FastifyReply, FastifyRequest } from 'fastify'
import { mfaVerifySchema } from './auth.schemas.js'
import { authRepository } from './auth.repository.js'
import { lockoutService } from './lockout.service.js'
import { totpService } from './totp.service.js'
import { auditRepository } from '../audit/audit.repository.js'
import { config } from '../../config.js'

export const mfaVerifyHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const payload = mfaVerifySchema.safeParse(request.body)
  if (!payload.success) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const challenge = authRepository.getChallenge(payload.data.challengeId)
  if (!challenge) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const user = authRepository.getUserById(challenge.userId)
  if (!user || user.status === 'Inactive') {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  if (authRepository.isMfaEnrollmentRequired(user) || !user.mfaSecret) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const lockout = await lockoutService.getLockout(user.email, 'MFA')
  if (lockout) {
    reply.status(423).send({ error: 'ACCOUNT_LOCKED', lockoutUntil: lockout.toISOString() })
    return
  }

  const valid = totpService.verify(payload.data.code, user.mfaSecret)
  if (!valid) {
    const lockoutUntil = await lockoutService.recordFailure(user.email, 'MFA')

    await auditRepository.record({
      actorUserId: user.id,
      eventName: 'auth.mfa.verify.failed',
      objectType: 'user',
      objectId: user.id,
    })

    if (lockoutUntil) {
      reply.status(423).send({ error: 'ACCOUNT_LOCKED', lockoutUntil: lockoutUntil.toISOString() })
      return
    }

    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  await lockoutService.clear(user.email, 'MFA')
  authRepository.consumeChallenge(payload.data.challengeId)
  const { token, session } = authRepository.createSession(user.id)

  await auditRepository.record({
    actorUserId: user.id,
    eventName: 'auth.mfa.verify.succeeded',
    objectType: 'user',
    objectId: user.id,
  })

  reply.setCookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: 'lax',
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
