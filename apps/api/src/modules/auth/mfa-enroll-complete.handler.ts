import type { FastifyReply, FastifyRequest } from 'fastify'
import { mfaEnrollmentCompleteSchema } from './auth.schemas.js'
import { authRepository } from './auth.repository.js'
import { lockoutService } from './lockout.service.js'
import { totpService } from './totp.service.js'
import { auditRepository } from '../audit/audit.repository.js'
import { config } from '../../config.js'
import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
} from '../abuse-protection/protection.errors.js'
import { normalizeSourcePrefix } from '../abuse-protection/subjectFingerprint.js'

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
  const user = enrollment ? authRepository.getUserById(enrollment.userId) : undefined
  const admission = await request.server.authCostAdmission.admit({
    sourcePrefix: request.abuseProtectionSourcePrefix ?? normalizeSourcePrefix(
      request.ip,
      config.abuseProtection.localRates.ipv6PrefixLength,
    ),
    ...(user ? { accountIdentifier: user.email } : {}),
  })
  if (!admission.allowed) {
    const response = admission.reasonCode === 'AUTH_STORE_UNAVAILABLE'
      ? buildProtectionUnavailableResponse({
          code: 'PROTECTION_UNAVAILABLE',
          requestId: request.id,
          retryAfterSeconds: admission.retryAfterSeconds,
        })
      : buildRateLimitedResponse({
          code: 'RATE_LIMITED',
          requestId: request.id,
          retryAfterSeconds: admission.retryAfterSeconds,
        })
    reply.status(response.statusCode).headers(response.headers).send(response.body)
    return
  }
  if (!enrollment || !user || !['Active', 'Invited'].includes(user.status)) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const lockout = await lockoutService.getLockout(user.email, 'MFA', user.id)
  if (lockout) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const valid = totpService.verify(payload.data.code, enrollment.secret)
  if (!valid) {
    const lockoutUntil = await lockoutService.recordFailure(user.email, 'MFA', user.id)

    await auditRepository.record({
      actorUserId: user.id,
      eventName: 'auth.mfa.enroll.failed',
      objectType: 'user',
      objectId: user.id,
    })

    if (lockoutUntil) {
      reply.status(401).send({ error: 'SIGN_IN_FAILED' })
      return
    }

    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  await lockoutService.clear(user.email, 'MFA', user.id)
  const currentEnrollment = authRepository.getMfaEnrollment(payload.data.enrollmentToken)
  const currentUser = currentEnrollment
    ? authRepository.getUserById(currentEnrollment.userId)
    : undefined
  if (!currentEnrollment || !currentUser || !['Active', 'Invited'].includes(currentUser.status)) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }
  if (currentUser.status === 'Invited') {
    authRepository.updateUserStatus(currentUser.id, 'Active')
  }
  const enrolledUser = authRepository.completeMfaEnrollment(currentUser.id, currentEnrollment.secret)
  if (!enrolledUser) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }
  authRepository.consumeMfaEnrollment(payload.data.enrollmentToken)

  const { token, session } = authRepository.createSession(user.id)

  await auditRepository.record({
    actorUserId: user.id,
    eventName: 'auth.mfa.enroll.succeeded',
    objectType: 'user',
    objectId: user.id,
    after: {
      actorDisplayName: enrolledUser.displayName,
      accessLevel: enrolledUser.accessLevel,
    },
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
      id: enrolledUser.id,
      email: enrolledUser.email,
      displayName: enrolledUser.displayName,
      role: enrolledUser.role,
      accessLevel: enrolledUser.accessLevel,
      status: enrolledUser.status,
    },
    role: enrolledUser.role,
    session: {
      issuedAt: session.issuedAt.toISOString(),
      idleTimeoutSeconds: config.sessionIdleTimeoutSeconds,
      absoluteTimeoutSeconds: config.sessionAbsoluteTimeoutSeconds,
    },
  })
}
