import type { FastifyInstance } from 'fastify'
import { config } from '../../config.js'
import { defaultRouteProtectionPolicy } from '../abuse-protection/policy.defaults.js'
import { withSession } from '../auth/session.middleware.js'
import { requireAdmin } from '../auth/rbac.middleware.js'
import { requirePartnershipScope } from '../partnerships/partnershipScope.plugin.js'
import { csvHandlers } from './liquidity-statement.handler.js'
export async function registerLiquidityStatementRoutes(app:FastifyInstance){
  await app.register(async router=>{
    router.removeContentTypeParser('text/plain')
    router.addContentTypeParser(['text/csv','application/csv','text/plain','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'],{parseAs:'buffer',bodyLimit:config.liquidityCsv.maxBytes},(_r,body,done)=>done(null,body))
    const routes=[['POST','/upload-capability','upload'],['POST','/:statementId/complete','complete'],['GET','','list'],['GET','/:statementId','detail'],['GET','/:statementId/records','records'],['DELETE','/:statementId','cancel'],['POST','/:statementId/archive','archive'],['POST','/:statementId/retry','retry'],['POST','/:statementId/reprocess','reprocess'],['PUT','/:statementId/mapping','mapping'],['PATCH','/:statementId/review','review'],['POST','/:statementId/application-preview','preview'],['POST','/:statementId/apply','apply'],['POST','/:statementId/source-download','download']] as const
    for(const [method,suffix,handler] of routes){
      const path=`/liquidity-statements${suffix}`
      const policy=defaultRouteProtectionPolicy(method,`/v1${path}`)
      const reviewPayload=handler==='review'||handler==='preview'
      router.route({method,url:path,...(reviewPayload?{bodyLimit:config.liquidityCsv.maxBytes}:{}),preHandler:[withSession,requireAdmin,requirePartnershipScope],config:{abuseProtection:reviewPayload?{...policy,payloadLimits:{...policy.payloadLimits,bodyBytes:config.liquidityCsv.maxBytes,maxProperties:config.liquidityCsv.maxRows*3+1000}}:policy},handler:csvHandlers[handler]})
    }
    if(config.liquidityCsv.objectStore==='local')for(const method of ['PUT','GET'] as const){
      const path='/liquidity-statements/:statementId/content',policy=defaultRouteProtectionPolicy(method,`/v1${path}`)
      router.route({method,url:path,logLevel:'silent',bodyLimit:config.liquidityCsv.maxBytes,preHandler:[withSession,requireAdmin,requirePartnershipScope],config:{abuseProtection:{...policy,payloadLimits:{...policy.payloadLimits,bodyBytes:config.liquidityCsv.maxBytes}}},handler:method==='PUT'?csvHandlers.putContent:csvHandlers.getContent})
    }
  })
}
