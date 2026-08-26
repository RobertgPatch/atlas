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
      timeout: config.abuseProtection.timeouts.plaidProviderMs,
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

const retryablePlaidError = (error: unknown): boolean => {
  const candidate = error as { response?: { status?: number }; code?: string }
  const status = candidate.response?.status
  return status === 429
    || (typeof status === 'number' && status >= 500)
    || ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(candidate.code ?? '')
}

const waitForRetry = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

export const callPlaidWithRetry = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const maximumAttempts = config.abuseProtection.retryBudgets.plaidMaximumAttempts
  const signal = AbortSignal.timeout(config.abuseProtection.timeouts.plaidProviderMs)
  let lastError: unknown
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    if (signal.aborted) throw signal.reason
    try {
      return await operation(signal)
    } catch (error) {
      lastError = error
      if (attempt >= maximumAttempts || !retryablePlaidError(error)) throw error
      if (config.nodeEnv !== 'test') {
        const base = config.abuseProtection.retryBudgets.baseDelayMs * 2 ** (attempt - 1)
        const bounded = Math.min(base, config.abuseProtection.retryBudgets.maximumDelayMs)
        const jittered = Math.max(1, Math.floor(bounded * (0.5 + Math.random() * 0.5)))
        await waitForRetry(jittered, signal)
      }
    }
  }
  throw lastError
}
