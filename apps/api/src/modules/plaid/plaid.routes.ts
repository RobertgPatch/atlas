import type { FastifyInstance } from 'fastify'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { withSession } from '../auth/session.middleware.js'
import {
  createPlaidLinkTokenHandler,
  exchangePlaidPublicTokenHandler,
  listPlaidInvestmentAccountsHandler,
  updatePlaidInvestmentAccountsHandler,
} from './plaid.handler.js'

export const registerPlaidRoutes = async (app: FastifyInstance): Promise<void> => {
  const gated = { preHandler: [withSession, requireAuthenticated] }

  app.post('/plaid/link-token', gated, createPlaidLinkTokenHandler)
  app.post('/plaid/exchange-public-token', gated, exchangePlaidPublicTokenHandler)
  app.get('/plaid/investment-accounts', gated, listPlaidInvestmentAccountsHandler)
  app.patch('/plaid/investment-accounts', gated, updatePlaidInvestmentAccountsHandler)
  app.post('/plaid/investment-accounts/selection', gated, updatePlaidInvestmentAccountsHandler)
}
