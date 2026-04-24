import type { FastifyInstance } from 'fastify'
import { registerAuthRoutes } from '../modules/auth/auth.routes.js'
import { registerAdminRoutes } from '../modules/admin/admin.routes.js'
import { registerK1Routes } from '../modules/k1/k1.routes.js'
import { registerReviewRoutes } from '../modules/review/review.routes.js'

export const registerRoutes = async (app: FastifyInstance) => {
  await registerAuthRoutes(app)
  await registerAdminRoutes(app)
  await registerK1Routes(app)
  await registerReviewRoutes(app)
}
