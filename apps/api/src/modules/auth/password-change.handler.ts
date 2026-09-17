import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../../config.js'
import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
} from '../abuse-protection/protection.errors.js'
import { normalizeSourcePrefix } from '../abuse-protection/subjectFingerprint.js'
import { auditRepository } from '../audit/audit.repository.js'
import { authRepository } from './auth.repository.js'
import { passwordChangeSchema } from './auth.schemas.js'
import { evaluatePassword, passwordPolicySummary } from './passwordPolicy.js'
import { passwordHashSemaphore, passwordService } from './password.service.js'

export const passwordChangeHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const payload = passwordChangeSchema.safeParse(request.body)
  if (!payload.success) {
    reply.status(400).send({ error: 'PASSWORD_CHANGE_INVALID' })
    return
  }

  const change = authRepository.getPasswordChange(payload.data.changeToken)
  const user = change ? authRepository.getUserById(change.userId) : undefined
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

  if (!change || !user || user.status === 'Inactive' || !user.passwordChangeRequired) {
    reply.status(401).send({ error: 'PASSWORD_CHANGE_INVALID' })
    return
  }

  const policy = evaluatePassword({
    password: payload.data.newPassword,
    email: user.email,
    displayName: user.displayName,
  })
  if (!policy.valid) {
    reply.status(400).send({
      error: 'PASSWORD_POLICY_FAILED',
      code: policy.code,
      policy: passwordPolicySummary,
    })
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

  try {
    const samePassword = await passwordService.verify(
      user.passwordHash,
      policy.normalizedPassword,
    )
    if (samePassword.valid) {
      reply.status(400).send({
        error: 'PASSWORD_POLICY_FAILED',
        code: 'PASSWORD_REUSE',
        policy: passwordPolicySummary,
      })
      return
    }
    await authRepository.changePassword(user.id, policy.normalizedPassword)
  } finally {
    hashLease.release()
  }

  authRepository.consumePasswordChange(payload.data.changeToken)
  await auditRepository.record({
    actorUserId: user.id,
    eventName: 'auth.password.changed',
    objectType: 'user',
    objectId: user.id,
    after: {
      actorDisplayName: user.displayName,
      accessLevel: user.accessLevel,
      forcedFirstLoginChange: true,
    },
  })

  reply.send({ status: 'PASSWORD_CHANGED' })
}
