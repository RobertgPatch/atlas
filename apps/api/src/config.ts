import dotenv from 'dotenv'

dotenv.config()

const asNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const asBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true'
}

const asList = (value: string | undefined, fallback: string): string[] =>
  (value ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const nodeEnv = process.env.NODE_ENV ?? 'development'
const defaultDevelopmentDatabaseUrl = 'postgres://postgres:postgres@127.0.0.1:55432/atlas'
const databaseUrl =
  nodeEnv === 'test'
    ? (process.env.ATLAS_TEST_DATABASE_URL ?? '')
    : (process.env.DATABASE_URL ??
      (nodeEnv === 'development' ? defaultDevelopmentDatabaseUrl : ''))
const plaidClientId =
  nodeEnv === 'test'
    ? (process.env.ATLAS_TEST_PLAID_CLIENT_ID ?? '')
    : (process.env.PLAID_CLIENT_ID ?? '')
const plaidSecret =
  nodeEnv === 'test'
    ? (process.env.ATLAS_TEST_PLAID_SECRET ?? '')
    : (process.env.PLAID_SECRET ?? '')
const alpacaMarketDataKeyId =
  nodeEnv === 'test'
    ? (process.env.ATLAS_TEST_ALPACA_MARKET_DATA_KEY_ID ?? '')
    : (process.env.ALPACA_MARKET_DATA_KEY_ID ?? '')
const alpacaMarketDataSecret =
  nodeEnv === 'test'
    ? (process.env.ATLAS_TEST_ALPACA_MARKET_DATA_SECRET ?? '')
    : (process.env.ALPACA_MARKET_DATA_SECRET ?? '')
const massiveMarketDataApiKey =
  nodeEnv === 'test'
    ? (process.env.ATLAS_TEST_MASSIVE_MARKET_DATA_API_KEY ?? '')
    : (process.env.MASSIVE_MARKET_DATA_API_KEY ?? '')

export const config = {
  nodeEnv,
  port: asNumber(process.env.PORT, 3000),
  databaseUrl,
  persistenceSecretKey: process.env.PERSISTENCE_SECRET_KEY ?? '',
  requireDurablePersistence: asBoolean(process.env.REQUIRE_DURABLE_PERSISTENCE),
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@jackson.com',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'password123',
  userEmail: process.env.USER_EMAIL ?? 'user@jackson.com',
  userPassword: process.env.USER_PASSWORD ?? 'password123',
  webOrigin: process.env.WEB_ORIGIN ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'atlas_session',
  sessionCookieSecure: asBoolean(process.env.SESSION_COOKIE_SECURE),
  sessionCookieSameSite: (process.env.SESSION_COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none',
  sessionIdleTimeoutSeconds: asNumber(process.env.SESSION_IDLE_TIMEOUT_SECONDS, 900),
  sessionAbsoluteTimeoutSeconds: asNumber(
    process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    28800,
  ),
  authLockoutThreshold: asNumber(process.env.AUTH_LOCKOUT_THRESHOLD, 3),
  authLockoutMinutes: asNumber(process.env.AUTH_LOCKOUT_MINUTES, 30),
  totpIssuer: process.env.TOTP_ISSUER ?? 'Jackson',
  storageRoot: process.env.STORAGE_ROOT ?? './.storage',
  k1UploadMaxBytes: asNumber(process.env.K1_UPLOAD_MAX_BYTES, 25 * 1024 * 1024),
  k1ExtractorBackend: (process.env.K1_EXTRACTOR ?? 'stub') as 'stub' | 'azure',
  plaidRefresh: {
    timeLocal: process.env.PLAID_REFRESH_TIME_LOCAL ?? '05:00',
    timezone: process.env.PLAID_REFRESH_TIMEZONE ?? 'America/Los_Angeles',
    schedulerEnabled: asBoolean(process.env.PLAID_REFRESH_SCHEDULER_ENABLED),
    schedulerMode: (process.env.PLAID_REFRESH_SCHEDULER_MODE ?? 'none') as
      | 'none'
      | 'eventbridge'
      | 'manual',
    schedulerToken: process.env.ATLAS_SCHEDULER_TOKEN ?? '',
  },
  marketData: {
    provider: (process.env.MARKET_DATA_PROVIDER ?? 'none') as 'none' | 'alpaca',
    refreshOnRead: asBoolean(process.env.MARKET_DATA_REFRESH_ON_READ, true),
    maxAgeSeconds: asNumber(process.env.MARKET_DATA_MAX_AGE_SECONDS, 60),
    requestTimeoutMs: asNumber(process.env.MARKET_DATA_REQUEST_TIMEOUT_MS, 4_000),
    alpaca: {
      baseUrl:
        process.env.ALPACA_MARKET_DATA_BASE_URL ?? 'https://data.alpaca.markets',
      keyId: alpacaMarketDataKeyId,
      secret: alpacaMarketDataSecret,
      feed: (process.env.ALPACA_MARKET_DATA_FEED ?? 'sip') as
        | 'sip'
        | 'iex'
        | 'delayed_sip',
    },
    massive: {
      enabled: asBoolean(process.env.MASSIVE_OTC_ENABLED),
      baseUrl:
        process.env.MASSIVE_MARKET_DATA_BASE_URL ?? 'https://api.massive.com',
      apiKey: massiveMarketDataApiKey,
      cacheTtlSeconds: asNumber(
        process.env.MASSIVE_OTC_CACHE_TTL_SECONDS,
        900,
      ),
    },
  },
  security: {
    rateLimitEnabled: asBoolean(process.env.RATE_LIMIT_ENABLED, true),
    rateLimitWindowSeconds: asNumber(process.env.RATE_LIMIT_WINDOW_SECONDS, 60),
    rateLimitMaxRequests: asNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 120),
    apiSharedCachePolicy: (process.env.API_SHARED_CACHE_POLICY ?? 'no_shared_cache') as
      | 'no_shared_cache'
      | 'private_only'
      | 'unknown',
    productionReadinessEnabled: asBoolean(process.env.PRODUCTION_READINESS_ENABLED, true),
  },
  aws: {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-west-2',
    appDomain: process.env.AWS_APP_DOMAIN ?? '',
    cloudFrontDistributionId: process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID ?? '',
    webAssetsBucket: process.env.AWS_WEB_ASSETS_BUCKET ?? '',
  },
  azureDocumentIntelligence: {
    endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? '',
    key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? '',
    apiVersion: process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? '2024-11-30',
    modelId: process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? 'prebuilt-layout',
  },
  plaid: {
    clientId: plaidClientId,
    secret: plaidSecret,
    env: (process.env.PLAID_ENV ?? 'sandbox') as 'sandbox' | 'development' | 'production',
    products: asList(process.env.PLAID_PRODUCTS, 'investments'),
    countryCodes: asList(process.env.PLAID_COUNTRY_CODES, 'US'),
    redirectUri: process.env.PLAID_REDIRECT_URI ?? '',
  },
}
