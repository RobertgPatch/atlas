import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { config } from './config.js'
import { registerRoutes } from './routes/index.js'
import { getPersistenceStatus } from './infra/persistence/persistenceStatus.js'

interface RateLimitBucket {
  resetAt: number
  count: number
}

const apiRateLimitBuckets = new Map<string, RateLimitBucket>()

export const buildApp = () => {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
  })

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/v1')) return
    if (!config.security.rateLimitEnabled || config.nodeEnv !== 'production') return

    const now = Date.now()
    const windowMs = config.security.rateLimitWindowSeconds * 1000
    const key = `${request.ip}:${request.method}:${request.url.split('?')[0]}`
    const existing = apiRateLimitBuckets.get(key)
    const bucket =
      existing && existing.resetAt > now
        ? existing
        : {
            resetAt: now + windowMs,
            count: 0,
          }

    bucket.count += 1
    apiRateLimitBuckets.set(key, bucket)

    if (bucket.count > config.security.rateLimitMaxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      await reply
        .status(429)
        .header('Retry-After', String(retryAfterSeconds))
        .send({ error: 'RATE_LIMIT_EXCEEDED' })
    }
  })

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/v1')) {
      reply
        .header('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .header('Surrogate-Control', 'no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('X-Frame-Options', 'DENY')
        .header('Referrer-Policy', 'no-referrer')
        .header('Cross-Origin-Resource-Policy', 'same-site')
        .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    }

    return payload
  })

  const allowedOrigins = config.webOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

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
      cb(new Error('Origin not allowed'), false)
    },
    credentials: true,
  })

  app.register(cookie, {
    secret: config.sessionSecret || undefined,
  })
  app.register(multipart, {
    limits: {
      fileSize: config.k1UploadMaxBytes,
      files: 1,
    },
  })

  app.get('/health', async () => ({
    status: 'ok',
    persistence: await getPersistenceStatus(),
  }))

  app.register(registerRoutes, { prefix: '/v1' })

  return app
}
