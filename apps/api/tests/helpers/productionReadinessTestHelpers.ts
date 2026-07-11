import type { ProductionReadinessDiagnostic } from '../../../../packages/types/src/plaid.js'

const secretKeyPatterns = [
  /database_url/i,
  /postgres:\/\/.+@/i,
  /plaid_secret/i,
  /access_token/i,
  /scheduler_token/i,
  /persistence_secret/i,
]

export const buildProductionReadinessDiagnosticFixture = (
  overrides: Partial<ProductionReadinessDiagnostic> = {},
): ProductionReadinessDiagnostic => ({
  environment: 'test',
  durablePersistence: {
    databaseConfigured: true,
    mode: 'durable',
  },
  schedulerConfigured: true,
  secretsConfigured: {
    persistenceSecretKey: true,
    sessionSecret: true,
    plaidCredentials: true,
    schedulerToken: true,
  },
  secureCookies: {
    secure: true,
    sameSite: 'lax',
  },
  allowedOrigin: 'https://app.example.com',
  rateLimitConfigured: true,
  apiCachingPolicy: 'no_shared_cache',
  scopingStatus: {
    apiRepositoryScoping: 'required_passed',
    postgresRls: 'deferred_hardening',
  },
  warnings: [],
  checkedAt: '2026-05-11T12:00:00.000Z',
  ...overrides,
})

export const findProductionReadinessWarnings = (
  diagnostic: ProductionReadinessDiagnostic,
  pattern: RegExp,
) => diagnostic.warnings.filter((warning) => pattern.test(warning))

export const findLeakedSecretValues = (payload: unknown): string[] => {
  const serialized = JSON.stringify(payload)
  return secretKeyPatterns
    .filter((pattern) => pattern.test(serialized))
    .map((pattern) => pattern.source)
}

export const hasLaunchBlockingProductionWarning = (
  diagnostic: ProductionReadinessDiagnostic,
) =>
  diagnostic.warnings.some((warning) =>
    /database|secret|cookie|origin|cache|scoping|scheduler/i.test(warning),
  )
