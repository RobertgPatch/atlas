import type { FastifyInstance } from 'fastify'
import { registerAuthRoutes } from '../modules/auth/auth.routes.js'
import { registerAdminRoutes } from '../modules/admin/admin.routes.js'

export const registerRoutes = async (app: FastifyInstance) => {
  await registerAuthRoutes(app)
  await registerAdminRoutes(app)
}
