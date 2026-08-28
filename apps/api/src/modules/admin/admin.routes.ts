import type { FastifyInstance } from 'fastify'
import {
  defaultRouteProtectionPolicy,
  type HttpMethod,
} from '../abuse-protection/index.js'
import { requireAdminAccess } from './admin.guard.js'
import {
  getPlaidRefreshStatusHandler,
  runPlaidRefreshHandler,
} from './plaid-refresh-status.handler.js'
import { getProductionReadinessHandler } from './production-readiness.handler.js'
import {
  listProtectionControlsHandler,
  revokeProtectionOverrideHandler,
  setProtectionOverrideHandler,
} from './protection-controls.handler.js'

const abuseProtection = (method: HttpMethod, routePattern: string) => ({
  abuseProtection: defaultRouteProtectionPolicy(method, routePattern),
})

export const registerAdminRoutes = async (app: FastifyInstance) => {
  app.get('/admin/plaid-refresh-status', {
    config: abuseProtection('GET', '/v1/admin/plaid-refresh-status'),
    preHandler: [requireAdminAccess],
  }, getPlaidRefreshStatusHandler)
  app.post('/admin/plaid-refresh/run', {
    config: abuseProtection('POST', '/v1/admin/plaid-refresh/run'),
  }, runPlaidRefreshHandler)
  app.get('/admin/production-readiness', {
    config: abuseProtection('GET', '/v1/admin/production-readiness'),
    preHandler: [requireAdminAccess],
  }, getProductionReadinessHandler)
  app.get('/admin/protection-controls', {
    config: abuseProtection('GET', '/v1/admin/protection-controls'),
    preHandler: [requireAdminAccess],
  }, listProtectionControlsHandler)
  app.put('/admin/protection-controls/:controlKey', {
    config: abuseProtection('PUT', '/v1/admin/protection-controls/:controlKey'),
    preHandler: [requireAdminAccess],
  }, setProtectionOverrideHandler)
  app.delete('/admin/protection-controls/:controlKey', {
    config: abuseProtection('DELETE', '/v1/admin/protection-controls/:controlKey'),
    preHandler: [requireAdminAccess],
  }, revokeProtectionOverrideHandler)
}
