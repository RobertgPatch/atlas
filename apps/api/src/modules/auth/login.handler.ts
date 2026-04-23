import type { FastifyReply, FastifyRequest } from 'fastify'
import { authRepository } from './auth.repository.js'
import { loginSchema } from './auth.schemas.js'
import { lockoutService } from './lockout.service.js'
import { auditRepository } from '../audit/audit.repository.js'
import { totpService } from './totp.service.js'

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
  if (!user || user.status === 'Inactive' || !authRepository.verifyPassword(user, password)) {
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
    eventName: 'auth.login.succeeded',
    objectType: 'user',
    objectId: user.id,
  })

  reply.send({ challengeId: challenge.id, status: 'MFA_REQUIRED' })
}
