import type { FastifyInstance } from 'fastify'
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
  const gated = { preHandler: [withSession, requireAuthenticated, requirePartnershipScope] }

  app.get('/tic-registry/properties', gated, listTicPropertiesHandler)
  app.post('/tic-registry/properties', gated, createTicPropertyHandler)
  app.get('/tic-registry/properties/:propertyId', gated, getTicPropertyHandler)
  app.patch('/tic-registry/properties/:propertyId', gated, updateTicPropertyHandler)
  app.delete('/tic-registry/properties/:propertyId', gated, deleteTicPropertyHandler)

  app.post('/tic-registry/properties/:propertyId/interests', gated, createTicInterestHandler)
  app.patch('/tic-registry/interests/:interestId', gated, updateTicInterestHandler)
  app.delete('/tic-registry/interests/:interestId', gated, deleteTicInterestHandler)

  app.post('/tic-registry/interests/:interestId/owners', gated, createTicOwnerHandler)
  app.patch('/tic-registry/owners/:ownerId', gated, updateTicOwnerHandler)
  app.delete('/tic-registry/owners/:ownerId', gated, deleteTicOwnerHandler)
}
