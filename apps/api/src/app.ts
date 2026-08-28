import { createServer } from 'node:http'

import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { config } from './config.js'
import { registerRoutes } from './routes/index.js'
import {
  getLivenessStatus,
  getReadinessStatus,
} from './infra/persistence/persistenceStatus.js'
import {
  admissionService,
  admissionRepository,
  abuseRetentionHealthEnvelope,
  defaultRouteProtectionPolicy,
  registerLocalRateLimiter,
  registerRequestBoundaries,
  registerRoutePolicyCoverage,
  type AdmissionService,
  type ExternalRouteRegistration,
  WorkloadAdmissionError,
  WorkloadDeduplicatedError,
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
} from './modules/abuse-protection/index.js'
import { AuthCostAdmissionService } from './modules/auth/authAdmission.service.js'
import { authRepository } from './modules/auth/auth.repository.js'

declare module 'fastify' {
  interface FastifyInstance {
    abuseProtectionAdmission: AdmissionService
    abuseProtectionRouteInventory: readonly ExternalRouteRegistration[]
    authCostAdmission: AuthCostAdmissionService
  }
}

export const buildApp = () => {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    trustProxy: config.trustedProxyCidrs,
    bodyLimit: config.abuseProtection.payloadLimits.businessJsonBodyBytes,
    requestTimeout: config.abuseProtection.timeouts.requestMs,
    connectionTimeout: config.abuseProtection.timeouts.requestMs,
    keepAliveTimeout: config.abuseProtection.timeouts.keepAliveMs,
    serverFactory: (handler) => {
      const server = createServer({
        maxHeaderSize: config.abuseProtection.payloadLimits.maximumHeaderBytes,
      }, handler)
      server.requestTimeout = config.abuseProtection.timeouts.requestMs
      server.timeout = config.abuseProtection.timeouts.requestMs
      server.headersTimeout = config.abuseProtection.timeouts.headersMs
      server.keepAliveTimeout = config.abuseProtection.timeouts.keepAliveMs
      return server
    },
  })

  const allowedOrigins = config.webOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (config.nodeEnv === 'production' && allowedOrigins.length === 0) {
    throw new Error('WEB_ORIGIN is required in production and must contain an explicit allowlist.')
  }

  registerLocalRateLimiter(app, {
    enabled: config.security.rateLimitEnabled,
    maximumBuckets: config.abuseProtection.localRates.maximumBuckets,
    bucketTtlSeconds: config.abuseProtection.localRates.bucketTtlSeconds,
    cleanupBatchSize: config.abuseProtection.retention.cleanupBatchSize,
    fingerprintKey: config.abuseProtection.hmac.activeKey,
    ipv6PrefixLength: config.abuseProtection.localRates.ipv6PrefixLength,
    sessionCookieName: config.sessionCookieName,
  })
  const routeInventory = registerRoutePolicyCoverage(app, {
    enforceAtStartup: config.nodeEnv === 'production',
    defaultPolicy: defaultRouteProtectionPolicy,
  })
  app.decorate('abuseProtectionAdmission', admissionService)
  app.decorate('abuseProtectionRouteInventory', routeInventory)
  app.decorate('authCostAdmission', new AuthCostAdmissionService({
    fingerprintKey: config.abuseProtection.hmac.activeKey,
    accountRequests: config.abuseProtection.exactRates.knownAccount.requests,
    accountWindowSeconds: config.abuseProtection.exactRates.knownAccount.seconds,
    passwordConcurrency: config.abuseProtection.exactRates.globalHashConcurrency,
    maximumAccounts: config.abuseProtection.localRates.maximumBuckets,
  }))

  app.setErrorHandler(async (error, request, reply) => {
    const httpError = error as { code?: string; statusCode?: number }
    if (error instanceof WorkloadAdmissionError) {
      const response = error.code === 'RATE_LIMITED' || error.code === 'QUOTA_EXCEEDED'
        ? buildRateLimitedResponse({
            code: error.code,
            requestId: request.id,
            retryAfterSeconds: error.retryAfterSeconds,
          })
        : buildProtectionUnavailableResponse({
            code: error.code,
            requestId: request.id,
            retryAfterSeconds: error.retryAfterSeconds,
          })
      reply.status(response.statusCode)
      for (const [name, value] of Object.entries(response.headers)) reply.header(name, value)
      return reply.send(response.body)
    }
    if (error instanceof WorkloadDeduplicatedError) {
      return reply.status(200).send({
        reused: true,
        operationId: error.operationId,
        operationState: error.operationState,
        resultReference: error.resultReference,
      })
    }
    if (request.isMultipart() && httpError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      return reply.status(413).send({
        error: 'PAYLOAD_TOO_LARGE',
        requestId: request.id,
      })
    }
    const statusCode = typeof httpError.statusCode === 'number' && httpError.statusCode >= 400
      ? httpError.statusCode
      : 500
    return reply.status(statusCode).send(error)
  })

  let retentionCleanupTimer: ReturnType<typeof setInterval> | undefined
  const runRetentionCleanup = async (): Promise<void> => {
    try {
      const result = await admissionRepository.cleanupExpired({
        batchSize: config.abuseProtection.retention.cleanupBatchSize,
        leaseRetentionSeconds: config.abuseProtection.retention.leaseDays * 86_400,
        overrideRetentionSeconds: config.abuseProtection.retention.overrideDays * 86_400,
      })
      await authRepository.cleanupAuthAttempts()
      if (config.nodeEnv !== 'test') {
        for (const [store, deletedRows] of Object.entries({
          rate_windows: result.rateWindows,
          quota_counters: result.quotaCounters,
          operations: result.operations,
          leases: result.leases,
          overrides: result.overrides,
        }) as Array<[Parameters<typeof abuseRetentionHealthEnvelope>[0]['store'], number]>) {
          console.info(JSON.stringify(abuseRetentionHealthEnvelope({
            environment: config.nodeEnv,
            store,
            deletedRows,
          })))
        }
      }
    } catch {
      if (config.nodeEnv !== 'test') {
        console.info(JSON.stringify(abuseRetentionHealthEnvelope({
          environment: config.nodeEnv,
          store: 'operations',
          deletedRows: 0,
          failures: 1,
        })))
      }
    }
  }
  app.addHook('onReady', async () => {
    if (config.nodeEnv === 'test') return
    retentionCleanupTimer = setInterval(() => void runRetentionCleanup(), 60 * 60 * 1_000)
    retentionCleanupTimer.unref?.()
  })
  app.addHook('onClose', async () => {
    if (retentionCleanupTimer) clearInterval(retentionCleanupTimer)
  })

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/v1')) {
      const isK1PdfPreview = /^\/v1\/k1-documents\/[^/?]+\/pdf(?:[?#]|$)/.test(
        request.url,
      )

      reply
        .header('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .header('Surrogate-Control', 'no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Referrer-Policy', 'no-referrer')
        .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

      if (isK1PdfPreview) {
        // The authenticated source PDF is intentionally embedded by the review
        // workspace. X-Frame-Options cannot express the production web/API
        // cross-origin allowlist, so constrain it with CSP instead.
        reply
          .header(
            'Content-Security-Policy',
            `frame-ancestors ${["'self'", ...allowedOrigins].join(' ')}`,
          )
          .header('Cross-Origin-Resource-Policy', 'cross-origin')
      } else {
        reply
          .header('X-Frame-Options', 'DENY')
          .header('Cross-Origin-Resource-Policy', 'same-site')
      }
    }

    return payload
  })

  app.register(cors, {
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // Reflect the request origin instead of using `true`, which can emit `*` and
    // break credentialed requests. If WEB_ORIGIN is set, only those origins are
    // allowed; otherwise any origin is reflected (safe-ish for dev/staging since
    // we always require credentials and only the matched origin gets the cookie).
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true)
        return
      }
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        cb(null, origin)
        return
      }
      // Omit CORS headers for disallowed origins. Unsafe cookie-authenticated
      // requests continue to the explicit CSRF hook below, which returns the
      // stable bounded 403 contract instead of surfacing a plugin error as 500.
      cb(null, false)
    },
    credentials: true,
  })

  app.register(cookie)
  app.addHook('onRequest', async (request, reply) => {
    if (config.nodeEnv !== 'production') return
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return
    if (request.url.split('?', 1)[0] === '/v1/admin/plaid-refresh/run') return
    const cookieHeader = request.headers.cookie ?? ''
    const hasSessionCookie = cookieHeader.split(';').some((part) =>
      part.trimStart().startsWith(`${config.sessionCookieName}=`))
    if (!hasSessionCookie || allowedOrigins.length === 0) return
    const origin = request.headers.origin
    if (typeof origin === 'string' && allowedOrigins.includes(origin)) return
    await reply.status(403).send({ error: 'CSRF_ORIGIN_REJECTED' })
  })
  app.register(multipart, {
    limits: {
      fileSize: config.k1UploadMaxBytes,
      files: 1,
    },
  })
  app.addContentTypeParser(
    'application/pdf',
    { parseAs: 'buffer', bodyLimit: config.k1Ingestion.uploadMaxBytes },
    (_request, body, done) => done(null, body),
  )
  registerRequestBoundaries(app)

  app.get('/health', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=30, stale-if-error=30')
    return getLivenessStatus()
  })

  // This endpoint is intentionally outside the externally routed /v1 surface.
  // The internal load balancer and deployment probes can use it when database
  // readiness (rather than process liveness) is required.
  app.get('/internal/readiness', async (_request, reply) => {
    const readiness = await getReadinessStatus()
    if (readiness.status === 'not_ready') reply.code(503)
    return readiness
  })

  app.register(registerRoutes, { prefix: '/v1' })

  return app
}
