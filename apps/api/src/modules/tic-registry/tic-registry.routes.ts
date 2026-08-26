import type { FastifyInstance } from 'fastify'
import {
  defaultRouteProtectionPolicy,
  type HttpMethod,
} from '../abuse-protection/index.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { withSession } from '../auth/session.middleware.js'
import { requirePartnershipScope } from '../partnerships/partnershipScope.plugin.js'
import {
  createTicInterestHandler,
  createTicOwnerHandler,
  createTicPropertyHandler,
  deleteTicInterestHandler,
  deleteTicOwnerHandler,
  deleteTicPropertyHandler,
  getTicPropertyHandler,
  listTicPropertiesHandler,
  updateTicInterestHandler,
  updateTicOwnerHandler,
  updateTicPropertyHandler,
} from './tic-registry.handler.js'

export const registerTicRegistryRoutes = async (
  app: FastifyInstance,
): Promise<void> => {
  const gated = (method: HttpMethod, routePattern: string) => ({
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, routePattern),
    },
    preHandler: [withSession, requireAuthenticated, requirePartnershipScope],
  })

  app.get('/tic-registry/properties', gated('GET', '/v1/tic-registry/properties'), listTicPropertiesHandler)
  app.post('/tic-registry/properties', gated('POST', '/v1/tic-registry/properties'), createTicPropertyHandler)
  app.get('/tic-registry/properties/:propertyId', gated('GET', '/v1/tic-registry/properties/:propertyId'), getTicPropertyHandler)
  app.patch('/tic-registry/properties/:propertyId', gated('PATCH', '/v1/tic-registry/properties/:propertyId'), updateTicPropertyHandler)
  app.delete('/tic-registry/properties/:propertyId', gated('DELETE', '/v1/tic-registry/properties/:propertyId'), deleteTicPropertyHandler)

  app.post('/tic-registry/properties/:propertyId/interests', gated('POST', '/v1/tic-registry/properties/:propertyId/interests'), createTicInterestHandler)
  app.patch('/tic-registry/interests/:interestId', gated('PATCH', '/v1/tic-registry/interests/:interestId'), updateTicInterestHandler)
  app.delete('/tic-registry/interests/:interestId', gated('DELETE', '/v1/tic-registry/interests/:interestId'), deleteTicInterestHandler)

  app.post('/tic-registry/interests/:interestId/owners', gated('POST', '/v1/tic-registry/interests/:interestId/owners'), createTicOwnerHandler)
  app.patch('/tic-registry/owners/:ownerId', gated('PATCH', '/v1/tic-registry/owners/:ownerId'), updateTicOwnerHandler)
  app.delete('/tic-registry/owners/:ownerId', gated('DELETE', '/v1/tic-registry/owners/:ownerId'), deleteTicOwnerHandler)
}
