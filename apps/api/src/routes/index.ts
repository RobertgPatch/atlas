import type { FastifyInstance } from 'fastify'
import { registerLiquidityStatementRoutes } from '../modules/liquidity-statements/liquidity-statement.routes.js'
import { registerLiquiditySourceRoutes } from '../modules/liquidity-sources/liquidity-source.routes.js'
import { registerLiquiditySectorRoutes } from '../modules/liquidity-sectors/liquidity-sector.routes.js'
import { registerAuthRoutes } from '../modules/auth/auth.routes.js'
import { registerAdminRoutes } from '../modules/admin/admin.routes.js'
import { registerDashboardRoutes } from '../modules/dashboard/dashboard.routes.js'
import { registerK1Routes } from '../modules/k1/k1.routes.js'
import { registerReviewRoutes } from '../modules/review/review.routes.js'
import { registerPartnershipRoutes } from '../modules/partnerships/partnerships.routes.js'
import { registerReportsRoutes } from '../modules/reports/reports.routes.js'
import { registerTicRegistryRoutes } from '../modules/tic-registry/tic-registry.routes.js'
import { registerPartnershipTrackerRoutes } from '../modules/partnership-tracker/partnership-tracker.routes.js'

export const registerRoutes = async (app: FastifyInstance) => {
  await registerLiquidityStatementRoutes(app)
  await registerLiquiditySourceRoutes(app)
  await registerLiquiditySectorRoutes(app)
  await registerAuthRoutes(app)
  await registerAdminRoutes(app)
  await registerDashboardRoutes(app)
  await registerK1Routes(app)
  await registerReviewRoutes(app)
  await registerPartnershipRoutes(app)
  await registerReportsRoutes(app)
  await registerTicRegistryRoutes(app)
  await registerPartnershipTrackerRoutes(app)
}
