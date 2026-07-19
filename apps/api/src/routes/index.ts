import type { FastifyInstance } from 'fastify'
import { registerAuthRoutes } from '../modules/auth/auth.routes.js'
import { registerAdminRoutes } from '../modules/admin/admin.routes.js'
import { registerAdminDevRoutes } from '../modules/admin/admin.dev.routes.js'
import { registerDashboardRoutes } from '../modules/dashboard/dashboard.routes.js'
import { registerK1Routes } from '../modules/k1/k1.routes.js'
import { registerReviewRoutes } from '../modules/review/review.routes.js'
import { registerPartnershipRoutes } from '../modules/partnerships/partnerships.routes.js'
import { registerPlaidRoutes } from '../modules/plaid/plaid.routes.js'
import { registerReportsRoutes } from '../modules/reports/reports.routes.js'
import { registerTicRegistryRoutes } from '../modules/tic-registry/tic-registry.routes.js'
import { registerK1TrackerRoutes } from '../modules/k1-tracker/k1-tracker.routes.js'
import { registerPartnershipTrackerRoutes } from '../modules/partnership-tracker/partnership-tracker.routes.js'

export const registerRoutes = async (app: FastifyInstance) => {
  await registerAuthRoutes(app)
  await registerAdminRoutes(app)
  await registerAdminDevRoutes(app)
  await registerDashboardRoutes(app)
  await registerK1Routes(app)
  await registerReviewRoutes(app)
  await registerPartnershipRoutes(app)
  await registerPlaidRoutes(app)
  await registerReportsRoutes(app)
  await registerTicRegistryRoutes(app)
  await registerK1TrackerRoutes(app)
  await registerPartnershipTrackerRoutes(app)
}
