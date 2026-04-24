import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { config } from './config.js'
import { registerRoutes } from './routes/index.js'

export const buildApp = () => {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
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
