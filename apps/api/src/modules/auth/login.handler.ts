import type { FastifyReply, FastifyRequest } from 'fastify'
import { authRepository } from './auth.repository.js'
import { loginSchema } from './auth.schemas.js'
import { lockoutService } from './lockout.service.js'
import { auditRepository } from '../audit/audit.repository.js'
import { config } from '../../config.js'
import { totpService } from './totp.service.js'
import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
} from '../abuse-protection/protection.errors.js'
import { normalizeSourcePrefix } from '../abuse-protection/subjectFingerprint.js'
import { passwordHashSemaphore } from './password.service.js'
import { passwordPolicySummary } from './passwordPolicy.js'

const sourcePrefixFor = (request: FastifyRequest): string =>
  request.abuseProtectionSourcePrefix ?? normalizeSourcePrefix(
    request.ip,
    config.abuseProtection.localRates.ipv6PrefixLength,
  )

const rejectAdmission = (
  request: FastifyRequest,
  reply: FastifyReply,
  rejection: { readonly reasonCode: string; readonly retryAfterSeconds: number },
): void => {
  const response = rejection.reasonCode === 'AUTH_STORE_UNAVAILABLE'
    ? buildProtectionUnavailableResponse({
        code: 'PROTECTION_UNAVAILABLE',
        requestId: request.id,
        retryAfterSeconds: rejection.retryAfterSeconds,
      })
    : buildRateLimitedResponse({
        code: 'RATE_LIMITED',
        requestId: request.id,
        retryAfterSeconds: rejection.retryAfterSeconds,
      })
  reply.status(response.statusCode).headers(response.headers).send(response.body)
}

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
  const admission = await request.server.authCostAdmission.admit({
    sourcePrefix: sourcePrefixFor(request),
    accountIdentifier: email,
  })
  if (!admission.allowed) {
    rejectAdmission(request, reply, admission)
    return
  }

  const user = authRepository.findUserByEmail(email)
  const lockout = await lockoutService.getLockout(email, 'PASSWORD', user?.id)
  if (lockout) {
    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  const hashLease = passwordHashSemaphore.tryAcquire()
  if (!hashLease) {
    const response = buildRateLimitedResponse({
      code: 'RATE_LIMITED',
      requestId: request.id,
      retryAfterSeconds: 1,
    })
    reply.status(response.statusCode).headers(response.headers).send(response.body)
    return
  }
  let passwordValid: boolean
  try {
    passwordValid = await authRepository.verifyPassword(user, password)
  } finally {
    hashLease.release()
  }
  if (!user || user.status === 'Inactive' || !passwordValid) {
    const lockoutUntil = await lockoutService.recordFailure(email, 'PASSWORD', user?.id)
    await auditRepository.record({
      eventName: 'auth.login.failed',
      objectType: 'user',
      objectId: user?.id,
    })

    if (lockoutUntil) {
      reply.status(401).send({ error: 'SIGN_IN_FAILED' })
      return
    }

    reply.status(401).send({ error: 'SIGN_IN_FAILED' })
    return
  }

  await lockoutService.clear(email, 'PASSWORD', user.id)

  if (user.passwordChangeRequired) {
    const change = authRepository.createPasswordChange(user.id)
    await auditRepository.record({
      actorUserId: user.id,
      eventName: 'auth.login.password_change_required',
      objectType: 'user',
      objectId: user.id,
      after: {
        actorDisplayName: user.displayName,
        accessLevel: user.accessLevel,
      },
    })
    reply.send({
      status: 'PASSWORD_CHANGE_REQUIRED',
      changeToken: change.token,
      expiresAt: change.expiresAt.toISOString(),
      policy: passwordPolicySummary,
    })
    return
  }

  if (config.mfaLoginEnabled) {
    if (authRepository.isMfaEnrollmentRequired(user)) {
      const secret = totpService.generateSecret()
      const enrollment = authRepository.createMfaEnrollment(user.id, secret)
      const otpAuthUrl = totpService.buildOtpAuthUrl(user.email, secret)
      const qrCodeDataUrl = await totpService.buildQrCodeDataUrl(otpAuthUrl)

      await auditRepository.record({
        actorUserId: user.id,
        eventName: 'auth.login.mfa_enrollment_required',
        objectType: 'user',
        objectId: user.id,
      })

      reply.send({
        enrollmentToken: enrollment.id,
        status: 'MFA_ENROLL_REQUIRED',
        otpAuthUrl,
        qrCodeDataUrl,
        manualEntryKey: secret,
      })
      return
    }

    const challenge = authRepository.createMfaChallenge(user.id)
    await auditRepository.record({
      actorUserId: user.id,
      eventName: 'auth.login.mfa_required',
      objectType: 'user',
      objectId: user.id,
    })

    reply.send({ challengeId: challenge.id, status: 'MFA_REQUIRED' })
    return
  }

  const { token, session } = authRepository.createSession(user.id)

  await auditRepository.record({
    actorUserId: user.id,
    eventName: 'auth.login.succeeded',
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
