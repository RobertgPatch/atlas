import type { FastifyReply, FastifyRequest } from 'fastify'
import { authRepository } from './auth.repository.js'
import { config } from '../../config.js'
import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
  cloudWatchAbuseObservability,
  createValidatedSubjectContext,
  localConcurrencyClassFor,
} from '../abuse-protection/index.js'

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
  if (!user || user.status !== 'Active') return

  request.authSession = session
  request.authUser = {
    userId: user.id,
    role: user.role,
    email: user.email,
    displayName: user.displayName,
    accessLevel: user.accessLevel,
    status: user.status,
  }

  const policy = request.routeOptions.config?.abuseProtection
  let subjectContext: ReturnType<typeof createValidatedSubjectContext>
  try {
    subjectContext = createValidatedSubjectContext({
      userId: user.id,
      sessionId: session.id,
      deploymentTenantId: config.abuseProtection.deploymentTenantId,
      environment: config.nodeEnv,
      keyring: config.abuseProtection.hmac.keyring,
    })
  } catch {
    cloudWatchAbuseObservability.record({
      decision: 'failed',
      policyKey: policy?.policyKey ?? 'session.subject_context',
      routeClass: policy?.routeClass ?? 'AUTHENTICATED_READ',
      reasonCode: 'HMAC_CONTEXT_FAILURE',
      environment: config.nodeEnv,
      requestId: request.id,
    })
    const response = buildProtectionUnavailableResponse({
      code: 'PROTECTION_UNAVAILABLE',
      requestId: request.id,
      retryAfterSeconds: 30,
    })
    reply.status(response.statusCode)
    for (const [name, value] of Object.entries(response.headers)) reply.header(name, value)
    await reply.send(response.body)
    return
  }
  request.abuseProtectionSubjectContext = subjectContext
  if (policy) {
    const principalDecision = await request.server.abuseProtectionPrincipalRateLimiter.admit(
      policy,
      subjectContext,
    )
    if (!principalDecision.allowed) {
      const response = principalDecision.code === 'RATE_LIMITED'
        ? buildRateLimitedResponse({
            code: 'RATE_LIMITED',
            requestId: request.id,
            retryAfterSeconds: principalDecision.retryAfterSeconds,
          })
        : buildProtectionUnavailableResponse({
            code: 'PROTECTION_UNAVAILABLE',
            requestId: request.id,
            retryAfterSeconds: principalDecision.retryAfterSeconds,
          })
      reply.status(response.statusCode)
      for (const [name, value] of Object.entries(response.headers)) reply.header(name, value)
      await reply.send(response.body)
      return
    }
  }

  if (policy && policy.durableRates.length > 0 && !policy.killSwitch) {
    const decision = await request.server.abuseProtectionAdmission.admit({
      policy,
      requestId: request.id,
      subjectHashes: subjectContext.activeHashes,
      subjectHashAliases: Object.fromEntries(Object.entries(subjectContext.aliases).map(
        ([scope, aliases]) => [scope, aliases?.slice(1).map((alias) => alias.digest)],
      )),
    })
    cloudWatchAbuseObservability.record({
      decision: decision.decision === 'protection_unavailable'
        ? 'failed'
        : decision.decision,
      policyKey: policy.policyKey,
      routeClass: policy.routeClass,
      scopeKind: 'user',
      reasonCode: 'reasonCode' in decision ? decision.reasonCode : 'DURABLE_RATE_ALLOWED',
      environment: config.nodeEnv,
      requestId: request.id,
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

  const concurrencyClass = policy
    ? localConcurrencyClassFor(policy.routeClass)
    : null
  if (concurrencyClass && policy?.concurrencyLimit) {
    const lease = request.server.abuseProtectionLocalConcurrency.acquire(
      concurrencyClass,
      policy.concurrencyLimit,
    )
    cloudWatchAbuseObservability.record({
      decision: lease.admitted ? 'allowed' : 'failed',
      policyKey: policy.policyKey,
      routeClass: policy.routeClass,
      scopeKind: 'global',
      reasonCode: lease.admitted ? 'LOCAL_CONCURRENCY_ALLOWED' : 'LOCAL_CONCURRENCY_SATURATED',
      environment: config.nodeEnv,
      requestId: request.id,
    })
    if (!lease.admitted) {
      const response = buildProtectionUnavailableResponse({
        code: 'PROTECTION_UNAVAILABLE',
        requestId: request.id,
        retryAfterSeconds: lease.retryAfterSeconds,
      })
      reply.status(response.statusCode)
      for (const [name, value] of Object.entries(response.headers)) reply.header(name, value)
      await reply.send(response.body)
      return
    }
    reply.raw.once('finish', lease.release)
    reply.raw.once('close', lease.release)
  }

  authRepository.touchSession(session.id)
}
