import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { config } from './config.js'
import { registerRoutes } from './routes/index.js'

export const buildApp = () => {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
  })

  const allowedOrigins = config.webOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  app.register(cors, {
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

  app.register(cookie)
  app.register(multipart, {
    limits: {
      fileSize: config.k1UploadMaxBytes,
      files: 1,
    },
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(registerRoutes, { prefix: '/v1' })

  return app
}
