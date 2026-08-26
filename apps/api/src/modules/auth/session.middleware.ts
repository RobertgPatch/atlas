import type { FastifyReply, FastifyRequest } from 'fastify'
import { authRepository } from './auth.repository.js'
import { config } from '../../config.js'
import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
  fingerprintSubject,
  type ScopeDimension,
} from '../abuse-protection/index.js'

const tenantIdentityFor = (request: FastifyRequest, userId: string): string => {
  const candidates = [request.params, request.query, request.body]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const values = candidate as Record<string, unknown>
    for (const key of ['entityId', 'entityScopeId', 'partnershipId', 'tenantId']) {
      const value = values[key]
      if (typeof value === 'string' && value.length > 0 && value.length <= 128) {
        return `${key}:${value}`
      }
    }
  }
  return `user:${userId}`
}

const sendAdmissionRejection = async (
  request: FastifyRequest,
  reply: FastifyReply,
  decision: Extract<
    Awaited<ReturnType<FastifyRequest['server']['abuseProtectionAdmission']['admit']>>,
    { decision: 'throttled' | 'quota_rejected' | 'disabled' | 'protection_unavailable' }
  >,
): Promise<void> => {
  const response = decision.decision === 'throttled' || decision.decision === 'quota_rejected'
    ? buildRateLimitedResponse({
        code: decision.error === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'QUOTA_EXCEEDED',
        requestId: request.id,
        retryAfterSeconds: decision.retryAfterSeconds,
      })
    : buildProtectionUnavailableResponse({
        code: decision.error === 'WORKLOAD_DISABLED'
          ? 'WORKLOAD_DISABLED'
          : 'PROTECTION_UNAVAILABLE',
        requestId: request.id,
        retryAfterSeconds: decision.retryAfterSeconds,
      })
  reply.status(response.statusCode)
  for (const [name, value] of Object.entries(response.headers)) reply.header(name, value)
  await reply.send(response.body)
}

export const withSession = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const token = request.cookies[config.sessionCookieName]
  if (!token) return

  const session = authRepository.getSessionByToken(token)
  if (!session || !authRepository.isSessionValid(session)) return

  const user = authRepository.getUserById(session.userId)
  if (!user) return

  request.authSession = session
  request.authUser = {
    userId: user.id,
    role: user.role,
    email: user.email,
    status: user.status,
  }

  const policy = request.routeOptions.config?.abuseProtection
  if (policy && policy.durableRates.length > 0 && !policy.killSwitch) {
    const subject = (scope: ScopeDimension, value: string) =>
      fingerprintSubject(config.abuseProtection.hmac.activeKey, { scope, value })
    const tenantIdentity = tenantIdentityFor(request, user.id)
    const decision = await request.server.abuseProtectionAdmission.admit({
      policy,
      requestId: request.id,
      subjectHashes: {
        user: subject('user', user.id),
        session: subject('session', session.id),
        tenant: subject('tenant', tenantIdentity),
        entity: subject('entity', tenantIdentity),
        global: subject('global', 'atlas'),
      },
    })
    if (
      decision.decision === 'protection_unavailable'
      && config.nodeEnv === 'test'
    ) {
      // App-level regression tests intentionally run without PostgreSQL. The
      // AdmissionService itself is tested with failure injection, while every
      // deployed non-test write and heavy read remains fail closed.
    } else if (
      decision.decision !== 'allowed'
      && decision.decision !== 'deduplicated'
    ) {
      await sendAdmissionRejection(request, reply, decision)
      return
    }
  }

  authRepository.touchSession(session.id)
}
