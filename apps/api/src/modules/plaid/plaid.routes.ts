import type { FastifyInstance } from 'fastify'
import { defaultRouteProtectionPolicy } from '../abuse-protection/policy.defaults.js'
import { requireAuthenticated } from '../auth/rbac.middleware.js'
import { withSession } from '../auth/session.middleware.js'
import {
  createPlaidLinkTokenHandler,
  clearPlaidInvestmentAccountsHandler,
  exchangePlaidPublicTokenHandler,
  listPlaidInvestmentAccountsHandler,
  updatePlaidInvestmentAccountsHandler,
} from './plaid.handler.js'

export const registerPlaidRoutes = async (app: FastifyInstance): Promise<void> => {
  const gated = (method: 'DELETE' | 'GET' | 'PATCH' | 'POST', routePattern: string) => ({
    preHandler: [withSession, requireAuthenticated],
    config: {
      abuseProtection: defaultRouteProtectionPolicy(method, `/v1${routePattern}`),
    },
  })

  app.post(
    '/plaid/link-token',
    gated('POST', '/plaid/link-token'),
    createPlaidLinkTokenHandler,
  )
  app.post(
    '/plaid/exchange-public-token',
    gated('POST', '/plaid/exchange-public-token'),
    exchangePlaidPublicTokenHandler,
  )
  app.get(
    '/plaid/investment-accounts',
    gated('GET', '/plaid/investment-accounts'),
    listPlaidInvestmentAccountsHandler,
  )
  app.delete(
    '/plaid/investment-accounts',
    gated('DELETE', '/plaid/investment-accounts'),
    clearPlaidInvestmentAccountsHandler,
  )
  app.patch(
    '/plaid/investment-accounts',
    gated('PATCH', '/plaid/investment-accounts'),
    updatePlaidInvestmentAccountsHandler,
  )
  app.post(
    '/plaid/investment-accounts/selection',
    gated('POST', '/plaid/investment-accounts/selection'),
    updatePlaidInvestmentAccountsHandler,
  )
}
