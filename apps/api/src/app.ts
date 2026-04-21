import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { config } from './config.js'
import { registerRoutes } from './routes/index.js'

export const buildApp = () => {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
  })

  app.register(cookie)

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(registerRoutes, { prefix: '/v1' })

  return app
}
