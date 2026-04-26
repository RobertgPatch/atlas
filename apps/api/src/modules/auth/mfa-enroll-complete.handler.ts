import type { FastifyReply, FastifyRequest } from 'fastify'
import { mfaEnrollmentCompleteSchema } from './auth.schemas.js'
import { authRepository } from './auth.repository.js'
import { lockoutService } from './lockout.service.js'
import { totpService } from './totp.service.js'
import { auditRepository } from '../audit/audit.repository.js'
import { config } from '../../config.js'

export const mfaEnrollCompleteHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const payload = mfaEnrollmentCompleteSchema.safeParse(request.body)
  if (!payload.success) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const enrollment = authRepository.getMfaEnrollment(payload.data.enrollmentToken)
  if (!enrollment) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const user = authRepository.getUserById(enrollment.userId)
  if (!user || user.status === 'Inactive') {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const lockout = lockoutService.getLockout(user.email, 'MFA')
  if (lockout) {
    reply.status(423).send({ error: 'ACCOUNT_LOCKED', lockoutUntil: lockout.toISOString() })
    return
  }

  const valid = totpService.verify(payload.data.code, enrollment.secret)
  if (!valid) {
    const lockoutUntil = lockoutService.recordFailure(user.email, 'MFA')

    await auditRepository.record({
      actorUserId: user.id,
      eventName: 'auth.mfa.enroll.failed',
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

  lockoutService.clear(user.email, 'MFA')
  const enrolledUser = authRepository.completeMfaEnrollment(user.id, enrollment.secret)
  if (!enrolledUser) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }
  authRepository.consumeMfaEnrollment(payload.data.enrollmentToken)

  if (enrolledUser.status === 'Invited') {
    authRepository.updateUserStatus(enrolledUser.id, 'Active')
  }

  const { token, session } = authRepository.createSession(user.id)

  reply.setCookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: config.sessionCookieSameSite,
    path: '/',
    maxAge: config.sessionAbsoluteTimeoutSeconds,
  })

  await auditRepository.record({
    actorUserId: user.id,
    eventName: 'auth.mfa.enroll.succeeded',
    objectType: 'user',
    objectId: user.id,
  })

  reply.send({
    user: {
      id: enrolledUser.id,
      email: enrolledUser.email,
      role: enrolledUser.role,
      status: enrolledUser.status === 'Invited' ? 'Active' : enrolledUser.status,
    },
    role: enrolledUser.role,
    session: {
      issuedAt: session.issuedAt.toISOString(),
      idleTimeoutSeconds: config.sessionIdleTimeoutSeconds,
      absoluteTimeoutSeconds: config.sessionAbsoluteTimeoutSeconds,
    },
  })
}