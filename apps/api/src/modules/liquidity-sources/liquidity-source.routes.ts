import type { FastifyInstance } from 'fastify'
import { withSession } from '../auth/session.middleware.js'
import { requireAdmin,requireAuthenticated } from '../auth/rbac.middleware.js'
import { requirePartnershipScope } from '../partnerships/partnershipScope.plugin.js'
import { defaultRouteProtectionPolicy } from '../abuse-protection/policy.defaults.js'
import { sourceHandlers } from './liquidity-source.handler.js'
export async function registerLiquiditySourceRoutes(app:FastifyInstance){
  for(const [method,suffix,handler] of [['GET','','list'],['POST','','create'],['PATCH','/:accountId','update']] as const){
    const path=`/liquidity-source-accounts${suffix}`
    app.route({method,url:path,preHandler:[withSession,method==='GET'?requireAuthenticated:requireAdmin,requirePartnershipScope],config:{abuseProtection:defaultRouteProtectionPolicy(method,`/v1${path}`)},handler:sourceHandlers[handler]})
  }
}
