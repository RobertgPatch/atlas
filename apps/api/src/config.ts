import dotenv from 'dotenv'

dotenv.config()

const asNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: asNumber(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'atlas_session',
  sessionCookieSecure: (process.env.SESSION_COOKIE_SECURE ?? 'false') === 'true',
  sessionIdleTimeoutSeconds: asNumber(process.env.SESSION_IDLE_TIMEOUT_SECONDS, 900),
  sessionAbsoluteTimeoutSeconds: asNumber(
    process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    28800,
  ),
  authLockoutThreshold: asNumber(process.env.AUTH_LOCKOUT_THRESHOLD, 3),
  authLockoutMinutes: asNumber(process.env.AUTH_LOCKOUT_MINUTES, 30),
  totpIssuer: process.env.TOTP_ISSUER ?? 'Atlas',
  storageRoot: process.env.STORAGE_ROOT ?? './.storage',
  k1UploadMaxBytes: asNumber(process.env.K1_UPLOAD_MAX_BYTES, 25 * 1024 * 1024),
  k1ExtractorBackend: (process.env.K1_EXTRACTOR ?? 'stub') as 'stub' | 'azure',
  azureDocumentIntelligence: {
    endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? '',
    key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? '',
    apiVersion: process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? '2024-11-30',
    modelId: process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? 'prebuilt-layout',
  },
}