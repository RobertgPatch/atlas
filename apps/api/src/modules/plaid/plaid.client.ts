import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from 'plaid'
import { config } from '../../config.js'

const environment =
  PlaidEnvironments[config.plaid.env as keyof typeof PlaidEnvironments] ??
  PlaidEnvironments.sandbox

export const plaidApi = new PlaidApi(
  new Configuration({
    basePath: environment,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': config.plaid.clientId,
        'PLAID-SECRET': config.plaid.secret,
      },
    },
  }),
)

export const plaidClientConfig = {
  products: config.plaid.products as Products[],
  countryCodes: config.plaid.countryCodes as CountryCode[],
  redirectUri: config.plaid.redirectUri || undefined,
}

export const isPlaidConfigured = (): boolean =>
  Boolean(config.plaid.clientId && config.plaid.secret)
