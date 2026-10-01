import type { FastifyReply, FastifyRequest } from 'fastify'
import { mfaVerifySchema } from './auth.schemas.js'
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
  const user = challenge ? authRepository.getUserById(challenge.userId) : undefined
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
  if (
    !challenge
    || !user
    || user.status !== 'Active'
    || authRepository.isMfaEnrollmentRequired(user)
    || !user.mfaSecret
  ) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const lockout = await lockoutService.getLockout(user.email, 'MFA', user.id)
  if (lockout) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const valid = totpService.verify(payload.data.code, user.mfaSecret)
  if (!valid) {
    const lockoutUntil = await lockoutService.recordFailure(user.email, 'MFA', user.id)

    await auditRepository.record({
      actorUserId: user.id,
      eventName: 'auth.mfa.verify.failed',
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
  const consumedChallenge = authRepository.consumeChallenge(payload.data.challengeId)
  const currentUser = consumedChallenge
    ? authRepository.getUserById(consumedChallenge.userId)
    : undefined
  if (!consumedChallenge || !currentUser || currentUser.status !== 'Active') {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }
  const { token, session } = authRepository.createSession(currentUser.id)

  await auditRepository.record({
    actorUserId: user.id,
    eventName: 'auth.mfa.verify.succeeded',
    objectType: 'user',
    objectId: user.id,
    after: {
      actorDisplayName: user.displayName,
      accessLevel: user.accessLevel,
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
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      accessLevel: user.accessLevel,
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
