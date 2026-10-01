import dotenv from 'dotenv'
import { buildLiquidityCsvConfig } from './modules/liquidity-statements/liquidity-statement.config.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The local launcher exports the approved CLI session into the process.
// dotenv must not restore an older AWS_PROFILE from .env: the Node SDK gives
// that profile precedence over the exported access key/session token.
const hasLocalBdaSession = process.env.ATLAS_RUNTIME === 'local'
  && process.env.ATLAS_LOCAL_BDA_ENABLED === 'true'
  && Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SESSION_TOKEN)
dotenv.config()
if (hasLocalBdaSession) {
  delete process.env.AWS_PROFILE
  delete process.env.AWS_DEFAULT_PROFILE
}

// Resolve local evidence storage from the API package, not process.cwd().
// npm workspaces, direct tsx launches, and compiled production launches can
// otherwise point the same relative STORAGE_ROOT at different directories.
const apiPackageRoot = fileURLToPath(new URL('../', import.meta.url))

export const resolveStorageRoot = (configuredRoot: string): string =>
  path.isAbsolute(configuredRoot)
    ? path.normalize(configuredRoot)
    : path.resolve(apiPackageRoot, configuredRoot)

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

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type RuntimeClass = 'local' | 'production'

export interface RuntimeBoundaryConfig {
  runtimeClass: RuntimeClass
  databaseUrl: string
  k1ExtractorBackend: 'stub' | 'aws_bda'
  k1ObjectStore: 'local' | 's3'
  k1Queue: 'local' | 'sqs'
  awsMutationAllowed: false
}

const localDatabaseUrl = 'postgres://postgres:postgres@127.0.0.1:15432/atlas'

const isLoopbackDatabaseUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

interface AwsArnParts {
  service: string
  region: string
  accountId: string
  resource: string
}

const parseAwsArn = (value: string): AwsArnParts | null => {
  const match = /^arn:(?:aws|aws-us-gov|aws-cn):([^:]+):([^:]*):([^:]*):(.+)$/.exec(value)
  return match
    ? {
        service: match[1]!,
        region: match[2]!,
        accountId: match[3]!,
        resource: match[4]!,
      }
    : null
}

const validateLocalBdaArn = (args: {
  name: string
  value: string | undefined
  service: string
  region: string
  accountId: string
  resourcePrefix: string
}): void => {
  const arn = parseAwsArn(args.value?.trim() ?? '')
  if (!arn) throw configurationError(args.name, 'a valid ARN is required for local BDA mode')
  if (arn.service !== args.service || arn.region !== args.region) {
    throw configurationError(args.name, `must be a ${args.service} resource in ${args.region}`)
  }
  if (arn.accountId !== args.accountId) {
    throw configurationError(args.name, 'must belong to the explicitly approved AWS account')
  }
  if (!arn.resource.startsWith(args.resourcePrefix)) {
    throw configurationError(args.name, `must identify ${args.resourcePrefix}`)
  }
}

/**
 * Establishes the hard boundary between developer-owned local processes and
 * the sole remote runtime. This function is intentionally pure so launchers
 * and tests can fail before creating a process or contacting a provider.
 */
export const buildRuntimeBoundaryConfig = (
  env: EnvironmentSource,
): RuntimeBoundaryConfig => {
  if (env.ATLAS_SCHEDULER_TOKEN !== undefined) {
    throw configurationError(
      'ATLAS_SCHEDULER_TOKEN',
      'the retired alias is prohibited; use PROJECT_JACKSON_SCHEDULER_TOKEN',
    )
  }

  const nodeEnvironment = env.NODE_ENV ?? 'development'
  const runtimeClass = env.ATLAS_RUNTIME
    ?? (nodeEnvironment === 'production' ? '' : 'local')

  if (runtimeClass !== 'local' && runtimeClass !== 'production') {
    if (nodeEnvironment === 'production') {
      throw configurationError('ATLAS_RUNTIME', 'set ATLAS_RUNTIME=production explicitly')
    }
    throw configurationError('ATLAS_RUNTIME', 'expected local or production')
  }

  const databaseUrl = nodeEnvironment === 'test'
    ? (env.ATLAS_TEST_DATABASE_URL ?? '')
    : (env.DATABASE_URL ?? (runtimeClass === 'local' ? localDatabaseUrl : ''))
  const testRuntime = nodeEnvironment === 'test'
  const k1ExtractorBackend = (testRuntime ? 'stub' : (env.K1_EXTRACTOR ?? 'stub')) as 'stub' | 'aws_bda'
  const k1ObjectStore = (testRuntime ? 'local' : (env.K1_OBJECT_STORE ?? 'local')) as 'local' | 's3'
  const k1Queue = (testRuntime ? 'local' : (env.K1_QUEUE ?? 'local')) as 'local' | 'sqs'

  if (runtimeClass === 'local') {
    if (nodeEnvironment === 'production') {
      throw configurationError('ATLAS_RUNTIME', 'production NODE_ENV cannot use the local runtime')
    }
    if (nodeEnvironment !== 'test' && !isLoopbackDatabaseUrl(databaseUrl)) {
      throw configurationError('DATABASE_URL', 'the local runtime requires loopback PostgreSQL')
    }

    const localBdaEnabled = !testRuntime && env.ATLAS_LOCAL_BDA_ENABLED === 'true'
    if (env.ATLAS_LOCAL_BDA_ENABLED !== undefined
      && !['true', 'false'].includes(env.ATLAS_LOCAL_BDA_ENABLED)) {
      throw configurationError('ATLAS_LOCAL_BDA_ENABLED', 'expected exactly true or false')
    }

    const nonK1RemoteSettings: Array<[string, boolean]> = [
      ['MARKET_DATA_PROVIDER', (env.MARKET_DATA_PROVIDER ?? 'none') !== 'none'],
      ['AWS_APP_DOMAIN', Boolean(env.AWS_APP_DOMAIN?.trim())],
      ['AWS_CLOUDFRONT_DISTRIBUTION_ID', Boolean(env.AWS_CLOUDFRONT_DISTRIBUTION_ID?.trim())],
      ['AWS_WEB_ASSETS_BUCKET', Boolean(env.AWS_WEB_ASSETS_BUCKET?.trim())],
      ['ATLAS_ALLOW_AWS_MUTATION', env.ATLAS_ALLOW_AWS_MUTATION === 'true'],
    ]
    const nonK1Remote = testRuntime
      ? undefined
      : nonK1RemoteSettings.find(([, active]) => active)?.[0]
    if (nonK1Remote) {
      throw configurationError(nonK1Remote, 'the local runtime only permits the scoped K-1 BDA provider mode')
    }

    if (localBdaEnabled) {
      const exactBdaSettings: Array<[string, string | undefined, string]> = [
        ['K1_EXTRACTOR', env.K1_EXTRACTOR, 'aws_bda'],
        ['K1_OBJECT_STORE', env.K1_OBJECT_STORE, 's3'],
        ['K1_QUEUE', env.K1_QUEUE, 'local'],
        ['K1_AWS_INGESTION_ENABLED', env.K1_AWS_INGESTION_ENABLED, 'true'],
        ['K1_UPLOADS_ENABLED', env.K1_UPLOADS_ENABLED, 'true'],
        ['K1_EXTRACTION_ENABLED', env.K1_EXTRACTION_ENABLED, 'true'],
        ['K1_BDA_PROJECT_STAGE', env.K1_BDA_PROJECT_STAGE, 'LIVE'],
        ['AWS_REGION', env.AWS_REGION ?? env.AWS_DEFAULT_REGION, 'us-west-2'],
      ]
      const invalid = exactBdaSettings.find(([, actual, expected]) => actual !== expected)
      if (invalid) {
        throw configurationError(invalid[0], `local BDA mode requires exactly ${invalid[2]}`)
      }
      if (env.K1_WORK_QUEUE_URL?.trim() || env.K1_COMPLETION_QUEUE_URL?.trim()) {
        throw configurationError(
          'K1_QUEUE',
          'local BDA mode requires the PostgreSQL-backed local queue and no SQS URLs',
        )
      }
      const accountId = env.ATLAS_LOCAL_BDA_ACCOUNT_ID?.trim() ?? ''
      if (!/^\d{12}$/.test(accountId)) {
        throw configurationError('ATLAS_LOCAL_BDA_ACCOUNT_ID', 'a 12-digit approved AWS account ID is required')
      }
      if (!env.K1_S3_BUCKET?.trim()) {
        throw configurationError('K1_S3_BUCKET', 'a bucket name is required for local BDA mode')
      }
      const localPaidLimits: Array<[string, number, number]> = [
        ['ABUSE_K1_GLOBAL_FILES_PER_MONTH', 1, 50],
        ['ABUSE_K1_BDA_CALLS_PER_MONTH', 1, 10],
        ['ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS', 640, 25_000],
        ['ABUSE_BDA_MAX_ATTEMPTS', 1, 3],
        ['ABUSE_K1_USER_FILES_PER_DAY', 1, 5],
        ['ABUSE_K1_GLOBAL_FILES_PER_DAY', 1, 5],
        ['ABUSE_K1_USER_DOCUMENTS_PER_DAY', 1, 3],
        ['ABUSE_K1_GLOBAL_DOCUMENTS_PER_DAY', 1, 3],
        ['ABUSE_K1_EXTRACTION_GLOBAL_IN_FLIGHT', 1, 1],
      ]
      const parsedLimits = new Map<string, number>()
      for (const [name, minimum, maximum] of localPaidLimits) {
        const raw = env[name]
        if (!raw || !/^\d+$/.test(raw)) {
          throw configurationError(name, 'an explicit base-10 local BDA ceiling is required')
        }
        const value = Number(raw)
        if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
          throw configurationError(name, `local BDA mode requires ${minimum} through ${maximum}`)
        }
        parsedLimits.set(name, value)
      }
      const maximumReservedCents = parsedLimits.get('ABUSE_K1_BDA_CALLS_PER_MONTH')!
        * parsedLimits.get('ABUSE_BDA_MAX_ATTEMPTS')!
        * 640
      if (parsedLimits.get('ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS')! < maximumReservedCents) {
        throw configurationError(
          'ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS',
          `must cover the declared worst-case BDA reservation of ${maximumReservedCents} cents`,
        )
      }
      validateLocalBdaArn({
        name: 'K1_KMS_KEY_ARN', value: env.K1_KMS_KEY_ARN, service: 'kms',
        region: 'us-west-2', accountId, resourcePrefix: 'key/',
      })
      validateLocalBdaArn({
        name: 'K1_BDA_PROJECT_ARN', value: env.K1_BDA_PROJECT_ARN, service: 'bedrock',
        region: 'us-west-2', accountId, resourcePrefix: 'data-automation-project/',
      })
      validateLocalBdaArn({
        name: 'K1_BDA_PROFILE_ARN', value: env.K1_BDA_PROFILE_ARN, service: 'bedrock',
        region: 'us-west-2', accountId, resourcePrefix: 'data-automation-profile/',
      })
    } else {
      const unsafeProviderSettings: Array<[string, boolean]> = [
        ['K1_EXTRACTOR', k1ExtractorBackend !== 'stub'],
        ['K1_OBJECT_STORE', k1ObjectStore !== 'local'],
        ['K1_QUEUE', k1Queue !== 'local'],
        ['K1_AWS_INGESTION_ENABLED', env.K1_AWS_INGESTION_ENABLED === 'true'],
      ]
      const remoteResourceKeys = [
        'K1_S3_BUCKET',
        'K1_KMS_KEY_ARN',
        'K1_WORK_QUEUE_URL',
        'K1_COMPLETION_QUEUE_URL',
        'K1_BDA_PROFILE_ARN',
        'K1_BDA_PROJECT_ARN',
      ]
      const unsafe = testRuntime
        ? undefined
        : (unsafeProviderSettings.find(([, active]) => active)?.[0]
          ?? remoteResourceKeys.find((key) => Boolean(env[key]?.trim())))
      if (unsafe) {
        throw configurationError(
          unsafe,
          'the local runtime requires explicit ATLAS_LOCAL_BDA_ENABLED=true for remote K-1 providers/resources',
        )
      }
    }
  } else {
    if (nodeEnvironment !== 'production') {
      throw configurationError('NODE_ENV', 'ATLAS_RUNTIME=production requires NODE_ENV=production')
    }
    if (!databaseUrl || isLoopbackDatabaseUrl(databaseUrl)) {
      throw configurationError('DATABASE_URL', 'production requires an explicit non-loopback PostgreSQL endpoint')
    }
    if (env.REQUIRE_DURABLE_PERSISTENCE !== 'true') {
      throw configurationError('REQUIRE_DURABLE_PERSISTENCE', 'production requires exactly true')
    }
    if (!['us-west-1', 'us-west-2'].includes(env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? '')) {
      throw configurationError('AWS_REGION', 'production requires the live us-west-1 or planned us-west-2 target')
    }
  }

  return {
    runtimeClass,
    databaseUrl,
    k1ExtractorBackend,
    k1ObjectStore,
    k1Queue,
    awsMutationAllowed: false,
  }
}

interface IntegerSettingOptions {
  min?: number
  max?: number
  productionExplicit?: boolean
}

const configurationError = (name: string, expectation: string): Error =>
  new Error(`Invalid ${name}: ${expectation}`)

const strictInteger = (
  env: EnvironmentSource,
  environment: string,
  name: string,
  fallback: number,
  options: IntegerSettingOptions = {},
): number => {
  const raw = env[name]
  if (environment === 'production' && options.productionExplicit && raw === undefined) {
    throw configurationError(name, 'an explicit finite production value is required')
  }

  const value = raw === undefined ? fallback : raw
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    throw configurationError(name, 'expected a base-10 integer')
  }

  const parsed = typeof value === 'number' ? value : Number(value)
  const min = options.min ?? 1
  const max = options.max ?? Number.MAX_SAFE_INTEGER
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw configurationError(name, `expected an integer from ${min} through ${max}`)
  }
  return parsed
}

const strictBoolean = (
  env: EnvironmentSource,
  environment: string,
  name: string,
  fallback: boolean,
  productionExplicit = false,
): boolean => {
  const raw = env[name]
  if (environment === 'production' && productionExplicit && raw === undefined) {
    throw configurationError(name, 'an explicit production value is required')
  }
  if (raw === undefined) return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw configurationError(name, 'expected exactly true or false')
}

export const resolveRealTimeEquitiesEnabled = (
  env: EnvironmentSource,
  environment = env.NODE_ENV ?? 'development',
): boolean =>
  strictBoolean(env, environment, 'REAL_TIME_EQUITIES_ENABLED', false)

const strictIdentifier = (
  env: EnvironmentSource,
  environment: string,
  name: string,
  fallback: string,
  productionExplicit = false,
): string => {
  const raw = env[name]
  if (environment === 'production' && productionExplicit && raw === undefined) {
    throw configurationError(name, 'an explicit production value is required')
  }
  const value = raw ?? fallback
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(value)) {
    throw configurationError(name, 'expected 1-64 identifier characters')
  }
  return value
}

const validateHmacKey = (name: string, value: string): string => {
  if (value.length < 32 || value.length > 4096) {
    throw configurationError(name, 'expected secret key material between 32 and 4096 characters')
  }
  return value
}

const positiveWindow = (
  env: EnvironmentSource,
  environment: string,
  requestsName: string,
  requestsFallback: number,
  secondsName: string,
  secondsFallback: number,
  options: IntegerSettingOptions = {},
) => ({
  requests: strictInteger(env, environment, requestsName, requestsFallback, {
    ...options,
    max: options.max ?? 1_000_000,
  }),
  seconds: strictInteger(env, environment, secondsName, secondsFallback, {
    ...options,
    max: 86_400,
  }),
})

/**
 * Builds the abuse/cost-protection settings without mutating process.env.
 * Exported so startup and focused tests use the same strict validation path.
 */
export const buildAbuseProtectionConfig = (
  env: EnvironmentSource,
  environment = env.NODE_ENV ?? 'development',
) => {
  const productionPaidLimit = { productionExplicit: true, max: 1_000_000 }
  const productionPaidBytes = {
    productionExplicit: true,
    max: Number.MAX_SAFE_INTEGER,
  }
  const localHmacKey = 'atlas-local-abuse-protection-hmac-key-v1'
  const activeHmacKey = validateHmacKey(
    'ABUSE_HMAC_ACTIVE_KEY',
    environment === 'production'
      ? (env.ABUSE_HMAC_ACTIVE_KEY ?? (() => {
          throw configurationError(
            'ABUSE_HMAC_ACTIVE_KEY',
            'an explicit production secret is required',
          )
        })())
      : (env.ABUSE_HMAC_ACTIVE_KEY ?? localHmacKey),
  )
  const previousHmacKeys = (env.ABUSE_HMAC_PREVIOUS_KEYS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value, index) => validateHmacKey(`ABUSE_HMAC_PREVIOUS_KEYS[${index}]`, value))

  if (previousHmacKeys.length > 4) {
    throw configurationError('ABUSE_HMAC_PREVIOUS_KEYS', 'at most four rotation keys are allowed')
  }
  if (new Set([activeHmacKey, ...previousHmacKeys]).size !== previousHmacKeys.length + 1) {
    throw configurationError('ABUSE_HMAC_PREVIOUS_KEYS', 'rotation keys must be unique')
  }
  const previousHmacKeyIds = (env.ABUSE_HMAC_PREVIOUS_KEY_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (previousHmacKeyIds.length !== previousHmacKeys.length) {
    throw configurationError(
      'ABUSE_HMAC_PREVIOUS_KEY_IDS',
      'provide exactly one explicit version ID for every previous HMAC key',
    )
  }
  if (new Set(previousHmacKeyIds).size !== previousHmacKeyIds.length) {
    throw configurationError('ABUSE_HMAC_PREVIOUS_KEY_IDS', 'key version IDs must be unique')
  }
  for (const keyId of previousHmacKeyIds) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) {
      throw configurationError('ABUSE_HMAC_PREVIOUS_KEY_IDS', 'invalid key version ID')
    }
  }

  const generatedHeaderName = environment === 'production' && env.ABUSE_VIEWER_ADDRESS_HEADER === undefined
    ? (() => {
        throw configurationError(
          'ABUSE_VIEWER_ADDRESS_HEADER',
          'production must explicitly require cloudfront-viewer-address',
        )
      })()
    : (env.ABUSE_VIEWER_ADDRESS_HEADER ?? 'cloudfront-viewer-address').trim().toLowerCase()
  if (generatedHeaderName !== 'cloudfront-viewer-address') {
    throw configurationError(
      'ABUSE_VIEWER_ADDRESS_HEADER',
      'expected exactly cloudfront-viewer-address',
    )
  }
  const requireGeneratedHeader = strictBoolean(
    env,
    environment,
    'ABUSE_REQUIRE_GENERATED_VIEWER_ADDRESS',
    false,
    true,
  )
  if (environment === 'production' && !requireGeneratedHeader) {
    throw configurationError(
      'ABUSE_REQUIRE_GENERATED_VIEWER_ADDRESS',
      'production must fail closed on a missing generated viewer address',
    )
  }
  const deploymentTenantId = strictIdentifier(
    env,
    environment,
    'ATLAS_DEPLOYMENT_TENANT_ID',
    'local-family-office',
    true,
  )
  const steadyStateApiTasks = strictInteger(
    env,
    environment,
    'ABUSE_API_STEADY_STATE_TASKS',
    1,
    { min: 1, max: 1, productionExplicit: true },
  )
  const maximumLocalBuckets = strictInteger(
    env,
    environment,
    'ABUSE_LOCAL_MAX_BUCKETS',
    10_000,
    { max: 1_000_000 },
  )
  const localPartitions = {
    pinnedGlobal: strictInteger(
      env,
      environment,
      'ABUSE_LOCAL_PINNED_GLOBAL_BUCKETS',
      64,
      { max: 10_000, productionExplicit: true },
    ),
    authenticated: strictInteger(
      env,
      environment,
      'ABUSE_LOCAL_AUTHENTICATED_BUCKETS',
      2_936,
      { max: 1_000_000, productionExplicit: true },
    ),
    source: strictInteger(
      env,
      environment,
      'ABUSE_LOCAL_SOURCE_BUCKETS',
      7_000,
      { max: 1_000_000, productionExplicit: true },
    ),
  }
  if (Object.values(localPartitions).reduce((sum, value) => sum + value, 0) !== maximumLocalBuckets) {
    throw configurationError(
      'ABUSE_LOCAL_PARTITION_BUCKETS',
      'pinned, authenticated, and source partitions must exactly equal ABUSE_LOCAL_MAX_BUCKETS',
    )
  }
  const authGlobal = positiveWindow(
    env,
    environment,
    'ABUSE_AUTH_GLOBAL_REQUESTS',
    50,
    'ABUSE_AUTH_GLOBAL_WINDOW_SECONDS',
    300,
    { productionExplicit: true },
  )
  const authGlobalDaily = positiveWindow(
    env,
    environment,
    'ABUSE_AUTH_GLOBAL_DAILY_REQUESTS',
    200,
    'ABUSE_AUTH_GLOBAL_DAILY_WINDOW_SECONDS',
    86_400,
    { productionExplicit: true },
  )
  if (authGlobalDaily.seconds !== 86_400 || authGlobalDaily.requests < authGlobal.requests) {
    throw configurationError(
      'ABUSE_AUTH_GLOBAL_DAILY_REQUESTS',
      'daily ceiling must use 86400 seconds and cover at least one short auth window',
    )
  }
  const generalApiSource = positiveWindow(
    env,
    environment,
    'ABUSE_API_SOURCE_REQUESTS',
    300,
    'ABUSE_API_SOURCE_WINDOW_SECONDS',
    300,
    { productionExplicit: true },
  )
  const generalApiGlobal = positiveWindow(
    env,
    environment,
    'ABUSE_API_GLOBAL_REQUESTS',
    500,
    'ABUSE_API_GLOBAL_WINDOW_SECONDS',
    300,
    { productionExplicit: true },
  )
  const uploadTtlSeconds = strictInteger(
    env,
    environment,
    'ABUSE_UPLOAD_CAPABILITY_TTL_SECONDS',
    300,
    { max: 900, productionExplicit: true },
  )
  const uploadSignatureAgeSeconds = strictInteger(
    env,
    environment,
    'ABUSE_UPLOAD_SIGNATURE_AGE_SECONDS',
    300,
    { max: 900, productionExplicit: true },
  )
  if (uploadTtlSeconds > uploadSignatureAgeSeconds) {
    throw configurationError(
      'ABUSE_UPLOAD_CAPABILITY_TTL_SECONDS',
      'must not exceed ABUSE_UPLOAD_SIGNATURE_AGE_SECONDS',
    )
  }

  const config = {
    productionRequiresExplicitPaidLimits: true,
    runtime: { steadyStateApiTasks },
    sourceIdentity: {
      generatedHeaderName,
      requireGeneratedHeader,
    },
    deploymentTenantId,
    capabilities: {
      uploadTtlSeconds,
      signatureAgeSeconds: uploadSignatureAgeSeconds,
    },
    localRates: {
      maximumBuckets: maximumLocalBuckets,
      partitions: localPartitions,
      bucketTtlSeconds: strictInteger(env, environment, 'ABUSE_LOCAL_BUCKET_TTL_SECONDS', 900, {
        max: 86_400,
      }),
      ipv6PrefixLength: strictInteger(env, environment, 'ABUSE_IPV6_PREFIX_LENGTH', 64, {
        min: 32,
        max: 128,
      }),
      authSource: positiveWindow(
        env,
        environment,
        'ABUSE_AUTH_SOURCE_REQUESTS',
        20,
        'ABUSE_AUTH_SOURCE_WINDOW_SECONDS',
        300,
        { productionExplicit: true },
      ),
      generalApiSource,
      generalApiGlobal,
      authGlobal,
      authGlobalDaily,
      authenticatedReadUser: positiveWindow(
        env,
        environment,
        'ABUSE_READ_USER_REQUESTS',
        120,
        'ABUSE_READ_USER_WINDOW_SECONDS',
        60,
      ),
    },
    exactRates: {
      authGlobal,
      authGlobalDaily,
      authSource: positiveWindow(
        env,
        environment,
        'ABUSE_AUTH_DURABLE_SOURCE_REQUESTS',
        20,
        'ABUSE_AUTH_DURABLE_SOURCE_WINDOW_SECONDS',
        300,
        { productionExplicit: true },
      ),
      knownAccount: positiveWindow(
        env,
        environment,
        'ABUSE_AUTH_ACCOUNT_REQUESTS',
        5,
        'ABUSE_AUTH_ACCOUNT_WINDOW_SECONDS',
        900,
      ),
      globalHashConcurrency: strictInteger(
        env,
        environment,
        'ABUSE_AUTH_HASH_GLOBAL_CONCURRENCY',
        4,
        { max: 1_000 },
      ),
      databaseHeavyReadUser: positiveWindow(
        env,
        environment,
        'ABUSE_HEAVY_READ_USER_REQUESTS',
        30,
        'ABUSE_HEAVY_READ_WINDOW_SECONDS',
        60,
      ),
      databaseHeavyReadSessionRequests: strictInteger(
        env,
        environment,
        'ABUSE_HEAVY_READ_SESSION_REQUESTS',
        30,
        { max: 1_000_000 },
      ),
      databaseHeavyReadTenantRequests: strictInteger(
        env,
        environment,
        'ABUSE_HEAVY_READ_TENANT_REQUESTS',
        300,
        { max: 1_000_000 },
      ),
      databaseHeavyReadGlobalRequests: strictInteger(
        env,
        environment,
        'ABUSE_HEAVY_READ_GLOBAL_REQUESTS',
        3_000,
        { max: 1_000_000 },
      ),
      databaseHeavyGlobalConcurrency: strictInteger(
        env,
        environment,
        'ABUSE_HEAVY_READ_GLOBAL_CONCURRENCY',
        8,
        { max: 10_000 },
      ),
      businessWriteUser: positiveWindow(
        env,
        environment,
        'ABUSE_BUSINESS_WRITE_USER_REQUESTS',
        30,
        'ABUSE_BUSINESS_WRITE_WINDOW_SECONDS',
        60,
      ),
      businessWriteSessionRequests: strictInteger(
        env,
        environment,
        'ABUSE_BUSINESS_WRITE_SESSION_REQUESTS',
        30,
        { max: 1_000_000 },
      ),
      businessWriteTenantRequests: strictInteger(
        env,
        environment,
        'ABUSE_BUSINESS_WRITE_TENANT_REQUESTS',
        300,
        { max: 1_000_000 },
      ),
      businessWriteGlobalRequests: strictInteger(
        env,
        environment,
        'ABUSE_BUSINESS_WRITE_GLOBAL_REQUESTS',
        3_000,
        { max: 1_000_000 },
      ),
      adminWriteUser: positiveWindow(
        env,
        environment,
        'ABUSE_ADMIN_WRITE_USER_REQUESTS',
        20,
        'ABUSE_ADMIN_WRITE_WINDOW_SECONDS',
        60,
      ),
      adminWriteSessionRequests: strictInteger(
        env,
        environment,
        'ABUSE_ADMIN_WRITE_SESSION_REQUESTS',
        20,
        { max: 1_000_000 },
      ),
      adminWriteTenantRequests: strictInteger(
        env,
        environment,
        'ABUSE_ADMIN_WRITE_TENANT_REQUESTS',
        200,
        { max: 1_000_000 },
      ),
      adminWriteGlobalRequests: strictInteger(
        env,
        environment,
        'ABUSE_ADMIN_WRITE_GLOBAL_REQUESTS',
        2_000,
        { max: 1_000_000 },
      ),
    },
    quotas: {
      dailyCost: {
        maximumCents: strictInteger(
          env,
          environment,
          'ABUSE_PAID_WORKLOAD_DAILY_BUDGET_CENTS',
          2_000,
          { min: 1, max: 2_000 },
        ),
      },
      monthlyCost: {
        maximumCents: strictInteger(
          env,
          environment,
          'ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS',
          2_500,
          { productionExplicit: true, max: 62_000 },
        ),
        k1UploadFiles: strictInteger(env, environment, 'ABUSE_K1_GLOBAL_FILES_PER_MONTH', 50, productionPaidLimit),
        k1BdaProviderCalls: strictInteger(env, environment, 'ABUSE_K1_BDA_CALLS_PER_MONTH', 1, productionPaidLimit),
        k1CheckboxCalls: strictInteger(env, environment, 'ABUSE_K1_CHECKBOX_CALLS_PER_MONTH', 4, productionPaidLimit),
        marketProviderCalls: strictInteger(env, environment, 'ABUSE_MARKET_PROVIDER_CALLS_PER_MONTH', 25, productionPaidLimit),
        reportExports: strictInteger(env, environment, 'ABUSE_EXPORTS_PER_MONTH', 40, productionPaidLimit),
        backfillRuns: strictInteger(env, environment, 'ABUSE_BACKFILL_RUNS_PER_MONTH', 1, productionPaidLimit),
      },
      documentDownload: {
        userPerHour: strictInteger(env, environment, 'ABUSE_DOWNLOAD_USER_PER_HOUR', 20, {
          max: 100_000,
        }),
        globalConcurrency: strictInteger(
          env,
          environment,
          'ABUSE_DOWNLOAD_GLOBAL_CONCURRENCY',
          8,
          { max: 10_000 },
        ),
        userBytesPerDay: strictInteger(
          env,
          environment,
          'ABUSE_DOWNLOAD_USER_BYTES_PER_DAY',
          512 * 1024 * 1024,
          { max: Number.MAX_SAFE_INTEGER },
        ),
      },
      k1Upload: {
        userBatchesPerHour: strictInteger(env, environment, 'ABUSE_K1_USER_BATCHES_PER_HOUR', 5, productionPaidLimit),
        userFilesPerDay: strictInteger(env, environment, 'ABUSE_K1_USER_FILES_PER_DAY', 100, productionPaidLimit),
        globalFilesPerDay: strictInteger(env, environment, 'ABUSE_K1_GLOBAL_FILES_PER_DAY', 500, productionPaidLimit),
        globalUnacceptedBytes: strictInteger(env, environment, 'ABUSE_K1_GLOBAL_UNACCEPTED_BYTES', 5 * 1024 * 1024 * 1024, productionPaidBytes),
        activeBatchesPerUser: strictInteger(env, environment, 'ABUSE_K1_ACTIVE_BATCHES_PER_USER', 3, productionPaidLimit),
      },
      paidExtraction: {
        userDocumentsPerDay: strictInteger(env, environment, 'ABUSE_K1_USER_DOCUMENTS_PER_DAY', 25, productionPaidLimit),
        globalDocumentsPerDay: strictInteger(env, environment, 'ABUSE_K1_GLOBAL_DOCUMENTS_PER_DAY', 100, productionPaidLimit),
        retriesPerDocumentPerDay: strictInteger(env, environment, 'ABUSE_K1_RETRIES_PER_DOCUMENT_PER_DAY', 2, productionPaidLimit),
        lifetimeRetriesPerDocument: strictInteger(env, environment, 'ABUSE_K1_LIFETIME_RETRIES_PER_DOCUMENT', 5, productionPaidLimit),
        globalInFlight: strictInteger(env, environment, 'ABUSE_K1_EXTRACTION_GLOBAL_IN_FLIGHT', 5, productionPaidLimit),
        globalBacklog: strictInteger(env, environment, 'ABUSE_K1_EXTRACTION_GLOBAL_BACKLOG', 100, productionPaidLimit),
        checkboxCallsGlobalPerDay: strictInteger(env, environment, 'ABUSE_K1_CHECKBOX_CALLS_GLOBAL_PER_DAY', 50, productionPaidLimit),
      },
      externalProvider: {
        marketRefreshRunsGlobalDay: strictInteger(env, environment, 'ABUSE_MARKET_REFRESH_RUNS_GLOBAL_PER_DAY', 24, productionPaidLimit),
        marketProviderCallsGlobalDay: strictInteger(env, environment, 'ABUSE_MARKET_PROVIDER_CALLS_GLOBAL_PER_DAY', 200, productionPaidLimit),
        globalConcurrency: strictInteger(env, environment, 'ABUSE_PROVIDER_GLOBAL_CONCURRENCY', 2, productionPaidLimit),
      },
      reportExport: {
        userExportsPerDay: strictInteger(env, environment, 'ABUSE_EXPORT_USER_PER_DAY', 10, productionPaidLimit),
        globalExportsPerDay: strictInteger(env, environment, 'ABUSE_EXPORT_GLOBAL_PER_DAY', 50, productionPaidLimit),
        globalConcurrency: strictInteger(env, environment, 'ABUSE_EXPORT_GLOBAL_CONCURRENCY', 2, productionPaidLimit),
        userRowsPerDay: strictInteger(env, environment, 'ABUSE_EXPORT_USER_ROWS_PER_DAY', 250_000, { ...productionPaidLimit, max: 100_000_000 }),
        userBytesPerDay: strictInteger(env, environment, 'ABUSE_EXPORT_USER_BYTES_PER_DAY', 512 * 1024 * 1024, productionPaidBytes),
      },
      backfill: {
        globalRunsPerDay: strictInteger(env, environment, 'ABUSE_BACKFILL_GLOBAL_RUNS_PER_DAY', 1, productionPaidLimit),
        globalConcurrency: strictInteger(env, environment, 'ABUSE_BACKFILL_GLOBAL_CONCURRENCY', 1, productionPaidLimit),
        maximumRowsPerRun: strictInteger(env, environment, 'ABUSE_BACKFILL_MAX_ROWS_PER_RUN', 100_000, { ...productionPaidLimit, max: 100_000_000 }),
      },
      scheduler: {
        operationsPerWindow: strictInteger(env, environment, 'ABUSE_SCHEDULER_OPERATIONS_PER_WINDOW', 1, productionPaidLimit),
        windowSeconds: strictInteger(env, environment, 'ABUSE_SCHEDULER_WINDOW_SECONDS', 300, { ...productionPaidLimit, max: 86_400 }),
        globalConcurrency: strictInteger(env, environment, 'ABUSE_SCHEDULER_GLOBAL_CONCURRENCY', 1, productionPaidLimit),
      },
    },
    retryBudgets: {
      bdaMaximumAttempts: strictInteger(env, environment, 'ABUSE_BDA_MAX_ATTEMPTS', 3, { ...productionPaidLimit, max: 10 }),
      bedrockCheckboxMaximumAttempts: strictInteger(env, environment, 'ABUSE_BEDROCK_MAX_ATTEMPTS', 2, { ...productionPaidLimit, max: 10 }),
      marketDataMaximumAttempts: strictInteger(env, environment, 'ABUSE_MARKET_DATA_MAX_ATTEMPTS', 2, { ...productionPaidLimit, max: 10 }),
      sqsMaximumReceives: strictInteger(env, environment, 'ABUSE_SQS_MAX_RECEIVES', 5, { ...productionPaidLimit, max: 100 }),
      baseDelayMs: strictInteger(env, environment, 'ABUSE_RETRY_BASE_DELAY_MS', 200, { max: 60_000 }),
      maximumDelayMs: strictInteger(env, environment, 'ABUSE_RETRY_MAX_DELAY_MS', 2_000, { max: 300_000 }),
    },
    hmac: {
      keyId: strictIdentifier(env, environment, 'ABUSE_HMAC_KEY_ID', 'local-v1', true),
      activeKey: activeHmacKey,
      previousKeys: previousHmacKeys,
      previousKeyIds: previousHmacKeyIds,
      keyring: {
        active: {
          id: strictIdentifier(env, environment, 'ABUSE_HMAC_KEY_ID', 'local-v1', true),
          key: activeHmacKey,
        },
        retained: previousHmacKeys.map((key, index) => ({
          id: previousHmacKeyIds[index]!,
          key,
        })),
      },
      rotationMaxDays: strictInteger(env, environment, 'ABUSE_HMAC_ROTATION_MAX_DAYS', 90, {
        max: 365,
      }),
    },
    killSwitches: {
      k1UploadsEnabled: strictBoolean(env, environment, 'K1_UPLOADS_ENABLED', false, true),
      k1ExtractionEnabled: strictBoolean(env, environment, 'K1_EXTRACTION_ENABLED', false, true),
      k1BedrockCheckboxEnabled: strictBoolean(env, environment, 'K1_BEDROCK_CHECKBOX_ENABLED', false, true),
      marketDataRefreshEnabled: strictBoolean(env, environment, 'MARKET_DATA_REFRESH_ENABLED', false, true),
      reportExportsEnabled: strictBoolean(env, environment, 'REPORT_EXPORTS_ENABLED', false, true),
      backfillsEnabled: strictBoolean(env, environment, 'BACKFILLS_ENABLED', false, true),
    },
    payloadLimits: {
      authJsonBodyBytes: strictInteger(env, environment, 'ABUSE_AUTH_JSON_BODY_BYTES', 16 * 1024, { max: 1024 * 1024 }),
      businessJsonBodyBytes: strictInteger(env, environment, 'ABUSE_BUSINESS_JSON_BODY_BYTES', 256 * 1024, { max: 16 * 1024 * 1024 }),
      maximumJsonDepth: strictInteger(env, environment, 'ABUSE_MAX_JSON_DEPTH', 12, { max: 100 }),
      maximumJsonProperties: strictInteger(env, environment, 'ABUSE_MAX_JSON_PROPERTIES', 500, { max: 100_000 }),
      maximumHeaderBytes: strictInteger(env, environment, 'ABUSE_MAX_HEADER_BYTES', 16 * 1024, { max: 1024 * 1024 }),
      maximumQueryParameters: strictInteger(env, environment, 'ABUSE_MAX_QUERY_PARAMETERS', 30, { max: 1_000 }),
      maximumEmailCharacters: strictInteger(env, environment, 'ABUSE_MAX_EMAIL_CHARACTERS', 254, { max: 1_000 }),
      maximumPasswordCharacters: strictInteger(env, environment, 'ABUSE_MAX_PASSWORD_CHARACTERS', 1_024, { max: 16_384 }),
      maximumMfaCodeCharacters: strictInteger(env, environment, 'ABUSE_MAX_MFA_CODE_CHARACTERS', 16, { max: 128 }),
      maximumIdempotencyKeyCharacters: strictInteger(env, environment, 'ABUSE_MAX_IDEMPOTENCY_KEY_CHARACTERS', 128, { max: 1_024 }),
      multipartFiles: strictInteger(env, environment, 'ABUSE_MULTIPART_MAX_FILES', 1, { max: 100 }),
      multipartFields: strictInteger(env, environment, 'ABUSE_MULTIPART_MAX_FIELDS', 10, { max: 1_000 }),
      multipartParts: strictInteger(env, environment, 'ABUSE_MULTIPART_MAX_PARTS', 12, { max: 1_000 }),
      k1FilesPerBatch: strictInteger(env, environment, 'ABUSE_K1_MAX_FILES_PER_BATCH', 25, { max: 100 }),
      k1FileBytes: strictInteger(env, environment, 'ABUSE_K1_MAX_FILE_BYTES', 25 * 1024 * 1024, { max: 100 * 1024 * 1024 }),
      k1PagesPerFile: strictInteger(env, environment, 'ABUSE_K1_MAX_PAGES_PER_FILE', 100, { max: 10_000 }),
      exportRows: strictInteger(env, environment, 'ABUSE_EXPORT_MAX_ROWS', 100_000, { max: 1_000_000 }),
      reportPageSize: strictInteger(env, environment, 'ABUSE_REPORT_MAX_PAGE_SIZE', 1_000, { max: 10_000 }),
      maximumDateRangeDays: strictInteger(env, environment, 'ABUSE_MAX_DATE_RANGE_DAYS', 3_660, { max: 36_600 }),
      responseBodyBytes: strictInteger(env, environment, 'ABUSE_ERROR_RESPONSE_MAX_BYTES', 1_024, { max: 16_384 }),
    },
    authArtifacts: {
      challengeTtlSeconds: strictInteger(env, environment, 'ABUSE_MFA_CHALLENGE_TTL_SECONDS', 300, { max: 3_600 }),
      enrollmentTtlSeconds: strictInteger(env, environment, 'ABUSE_MFA_ENROLLMENT_TTL_SECONDS', 600, { max: 3_600 }),
      passwordChangeTtlSeconds: strictInteger(env, environment, 'ABUSE_PASSWORD_CHANGE_TTL_SECONDS', 600, { max: 3_600 }),
      maximumChallenges: strictInteger(env, environment, 'ABUSE_MFA_MAX_CHALLENGES', 10_000, { max: 1_000_000 }),
      maximumEnrollments: strictInteger(env, environment, 'ABUSE_MFA_MAX_ENROLLMENTS', 10_000, { max: 1_000_000 }),
      maximumPasswordChanges: strictInteger(env, environment, 'ABUSE_PASSWORD_CHANGE_MAX_TOKENS', 1_000, { max: 100_000 }),
    },
    timeouts: {
      requestMs: strictInteger(env, environment, 'ABUSE_REQUEST_TIMEOUT_MS', 30_000, { max: 300_000 }),
      headersMs: strictInteger(env, environment, 'ABUSE_HEADERS_TIMEOUT_MS', 10_000, { max: 120_000 }),
      keepAliveMs: strictInteger(env, environment, 'ABUSE_KEEP_ALIVE_TIMEOUT_MS', 5_000, { max: 120_000 }),
      databaseHeavyHandlerMs: strictInteger(env, environment, 'ABUSE_HEAVY_HANDLER_TIMEOUT_MS', 15_000, { max: 120_000 }),
      documentDownloadMs: strictInteger(env, environment, 'ABUSE_DOWNLOAD_TIMEOUT_MS', 30_000, { max: 300_000 }),
      bdaProviderMs: strictInteger(env, environment, 'ABUSE_BDA_TIMEOUT_MS', 60_000, { ...productionPaidLimit, max: 300_000 }),
      bedrockProviderMs: strictInteger(env, environment, 'ABUSE_BEDROCK_TIMEOUT_MS', 30_000, { ...productionPaidLimit, max: 300_000 }),
      marketDataProviderMs: strictInteger(env, environment, 'ABUSE_MARKET_DATA_TIMEOUT_MS', 10_000, { ...productionPaidLimit, max: 300_000 }),
      exportMs: strictInteger(env, environment, 'ABUSE_EXPORT_TIMEOUT_MS', 30_000, { ...productionPaidLimit, max: 300_000 }),
      backfillMs: strictInteger(env, environment, 'ABUSE_BACKFILL_TIMEOUT_MS', 60_000, { ...productionPaidLimit, max: 300_000 }),
    },
    overrides: {
      cacheTtlSeconds: strictInteger(env, environment, 'ABUSE_OVERRIDE_CACHE_TTL_SECONDS', 5, { max: 300 }),
      maximumDurationSeconds: strictInteger(env, environment, 'ABUSE_OVERRIDE_MAX_DURATION_SECONDS', 86_400, { max: 604_800 }),
    },
    retention: {
      rateWindowDays: strictInteger(env, environment, 'ABUSE_RATE_WINDOW_RETENTION_DAYS', 2, { max: 30 }),
      quotaDays: strictInteger(env, environment, 'ABUSE_QUOTA_RETENTION_DAYS', 30, { max: 365 }),
      idempotencyDays: strictInteger(env, environment, 'ABUSE_IDEMPOTENCY_RETENTION_DAYS', 90, { max: 365 }),
      leaseDays: strictInteger(env, environment, 'ABUSE_LEASE_RETENTION_DAYS', 7, { max: 90 }),
      overrideDays: strictInteger(env, environment, 'ABUSE_OVERRIDE_RETENTION_DAYS', 365, { max: 3_650 }),
      authAttemptDays: strictInteger(env, environment, 'ABUSE_AUTH_ATTEMPT_RETENTION_DAYS', 30, { max: 365 }),
      cleanupBatchSize: strictInteger(env, environment, 'ABUSE_CLEANUP_BATCH_SIZE', 5_000, { max: 100_000 }),
    },
  }

  if (config.quotas.k1Upload.userFilesPerDay > config.quotas.k1Upload.globalFilesPerDay) {
    throw configurationError('ABUSE_K1_USER_FILES_PER_DAY', 'must not exceed the global daily ceiling')
  }
  if (config.quotas.paidExtraction.userDocumentsPerDay > config.quotas.paidExtraction.globalDocumentsPerDay) {
    throw configurationError('ABUSE_K1_USER_DOCUMENTS_PER_DAY', 'must not exceed the global daily ceiling')
  }
  if (config.quotas.paidExtraction.retriesPerDocumentPerDay > config.quotas.paidExtraction.lifetimeRetriesPerDocument) {
    throw configurationError('ABUSE_K1_RETRIES_PER_DOCUMENT_PER_DAY', 'must not exceed the lifetime retry ceiling')
  }
  if (config.quotas.reportExport.userExportsPerDay > config.quotas.reportExport.globalExportsPerDay) {
    throw configurationError('ABUSE_EXPORT_USER_PER_DAY', 'must not exceed the global daily ceiling')
  }
  if (config.retryBudgets.baseDelayMs > config.retryBudgets.maximumDelayMs) {
    throw configurationError('ABUSE_RETRY_BASE_DELAY_MS', 'must not exceed the maximum retry delay')
  }
  if (config.timeouts.headersMs > config.timeouts.requestMs) {
    throw configurationError('ABUSE_HEADERS_TIMEOUT_MS', 'must not exceed the total request timeout')
  }

  return config
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
export const resolveProcessRole = (role = 'api'): 'api' | 'k1-worker' => {
  if (role !== 'api' && role !== 'k1-worker') throw configurationError('ATLAS_PROCESS_ROLE', 'expected api or k1-worker')
  return role
}
const processRole = resolveProcessRole(process.env.ATLAS_PROCESS_ROLE)
export const requireProcessRole = (actual: 'api' | 'k1-worker', expected: 'api' | 'k1-worker'): void => {
  if (actual !== expected) throw new Error(`Entrypoint requires ATLAS_PROCESS_ROLE=${expected}`)
}
const runtimeBoundary = buildRuntimeBoundaryConfig(process.env)
const sessionCookieSecure = nodeEnv === 'production'
  ? strictBoolean(process.env, nodeEnv, 'SESSION_COOKIE_SECURE', false, true)
  : asBoolean(process.env.SESSION_COOKIE_SECURE)
const sessionCookieSameSite = (process.env.SESSION_COOKIE_SAMESITE ?? 'lax').toLowerCase()
const sessionIdleTimeoutSeconds = nodeEnv === 'production'
  ? strictInteger(process.env, nodeEnv, 'SESSION_IDLE_TIMEOUT_SECONDS', 1_800, { min: 60, max: 86_400 })
  : asNumber(process.env.SESSION_IDLE_TIMEOUT_SECONDS, 1_800)
const sessionActivityWriteIntervalSeconds = nodeEnv === 'production'
  ? strictInteger(process.env, nodeEnv, 'SESSION_ACTIVITY_WRITE_INTERVAL_SECONDS', 60, { max: 86_400 })
  : asNumber(process.env.SESSION_ACTIVITY_WRITE_INTERVAL_SECONDS, 60)
const sessionAbsoluteTimeoutSeconds = nodeEnv === 'production'
  ? strictInteger(process.env, nodeEnv, 'SESSION_ABSOLUTE_TIMEOUT_SECONDS', 28_800, { min: 60, max: 86_400 })
  : asNumber(process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS, 28_800)
const trustedProxyCidrs = asList(
  process.env.TRUSTED_PROXY_CIDRS,
  nodeEnv === 'production' ? '' : '127.0.0.0/8,::1/128',
)
if (nodeEnv === 'production' && trustedProxyCidrs.length === 0) {
  throw configurationError(
    'TRUSTED_PROXY_CIDRS',
    'at least one exact internal proxy CIDR is required in production',
  )
}
const databaseUrl = runtimeBoundary.databaseUrl
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

const canonicalTonyEmail = 'tpatch@jspllc.com'
const configuredTonyEmail = (process.env.ADMIN_EMAIL ?? canonicalTonyEmail).trim().toLowerCase()
const adminEmail = ['admin@atlas.com', 'admin@jackson.com'].includes(configuredTonyEmail)
  ? canonicalTonyEmail
  : configuredTonyEmail
const adminPassword = process.env.ADMIN_PASSWORD ?? 'password123'
const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? 'rpatch@jspllc.com').trim().toLowerCase()
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD
  ?? process.env.USER_PASSWORD
  ?? 'password123'

export const config = {
  liquidityCsv: buildLiquidityCsvConfig(nodeEnv === 'test' ? {
    LIQUIDITY_XLSX_ENABLED:process.env.LIQUIDITY_XLSX_ENABLED,
    LIQUIDITY_CSV_FILES_PER_30_DAYS:process.env.LIQUIDITY_CSV_FILES_PER_30_DAYS,
    LIQUIDITY_CSV_CAPABILITIES_PER_HOUR:process.env.LIQUIDITY_CSV_CAPABILITIES_PER_HOUR,
    LIQUIDITY_CSV_MAX_OUTSTANDING_CAPABILITIES:process.env.LIQUIDITY_CSV_MAX_OUTSTANDING_CAPABILITIES,
  } : process.env, runtimeBoundary.runtimeClass === 'production'),
  nodeEnv,
  processRole,
  runtimeClass: runtimeBoundary.runtimeClass,
  port: asNumber(process.env.PORT, 3000),
  trustedProxyCidrs,
  databaseUrl,
  persistenceSecretKey: process.env.PERSISTENCE_SECRET_KEY ?? '',
  requireDurablePersistence: asBoolean(process.env.REQUIRE_DURABLE_PERSISTENCE),
  adminEmail,
  adminDisplayName: process.env.ADMIN_DISPLAY_NAME?.trim() || 'Tony Patch',
  adminPassword,
  superAdminEmail,
  superAdminDisplayName: process.env.SUPER_ADMIN_DISPLAY_NAME?.trim() || 'Robert Patch',
  superAdminPassword,
  userEmail: process.env.USER_EMAIL ?? 'user@jackson.com',
  userPassword: process.env.USER_PASSWORD ?? 'password123',
  passwordPolicy: {
    minimumCharacters: 15,
    maximumCharacters: 128,
  },
  passwordHash: {
    memoryCostKiB: Math.max(
      19 * 1024,
      asNumber(process.env.PASSWORD_HASH_MEMORY_KIB, 64 * 1024),
    ),
    timeCost: Math.max(2, asNumber(process.env.PASSWORD_HASH_TIME_COST, 3)),
    parallelism: Math.max(1, asNumber(process.env.PASSWORD_HASH_PARALLELISM, 1)),
  },
  webOrigin: process.env.WEB_ORIGIN ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'atlas_session',
  sessionCookieSecure,
  sessionCookieSameSite: sessionCookieSameSite as 'lax' | 'strict' | 'none',
  sessionIdleTimeoutSeconds,
  sessionActivityWriteIntervalSeconds,
  sessionAbsoluteTimeoutSeconds,
  authLockoutThreshold: asNumber(process.env.AUTH_LOCKOUT_THRESHOLD, 3),
  authLockoutMinutes: asNumber(process.env.AUTH_LOCKOUT_MINUTES, 30),
  mfaLoginEnabled: asBoolean(process.env.MFA_LOGIN_ENABLED),
  totpIssuer: process.env.TOTP_ISSUER ?? 'Jackson',
  storageRoot: resolveStorageRoot(process.env.STORAGE_ROOT ?? './.storage'),
  k1UploadMaxBytes: asNumber(process.env.K1_UPLOAD_MAX_BYTES, 25 * 1024 * 1024),
  k1ExtractorBackend: runtimeBoundary.k1ExtractorBackend,
  k1Ingestion: {
    awsEnabled: asBoolean(process.env.K1_AWS_INGESTION_ENABLED),
    batchMaxFiles: asNumber(process.env.K1_BATCH_MAX_FILES, 25),
    uploadMaxBytes: asNumber(process.env.K1_UPLOAD_MAX_BYTES, 25 * 1024 * 1024),
    uploadMaxPages: asNumber(process.env.K1_UPLOAD_MAX_PAGES, 100),
    uploadUrlTtlSeconds: asNumber(process.env.K1_UPLOAD_URL_TTL_SECONDS, 900),
    objectStore: runtimeBoundary.k1ObjectStore,
    queue: runtimeBoundary.k1Queue,
    workerConcurrency: asNumber(process.env.K1_WORKER_CONCURRENCY, 10),
    reconciliationStaleSeconds: asNumber(
      process.env.K1_RECONCILIATION_STALE_SECONDS,
      300,
    ),
    reconciliationIntervalSeconds: asNumber(
      process.env.K1_RECONCILIATION_INTERVAL_SECONDS,
      15,
    ),
    s3: {
      region: process.env.K1_S3_REGION ?? process.env.AWS_REGION ?? 'us-west-2',
      bucket: process.env.K1_S3_BUCKET ?? '',
      kmsKeyArn: process.env.K1_KMS_KEY_ARN ?? '',
      inputPrefix: process.env.K1_S3_INPUT_PREFIX ?? 'originals',
      outputPrefix: process.env.K1_S3_OUTPUT_PREFIX ?? 'extraction-results',
    },
    sqs: {
      workQueueUrl: process.env.K1_WORK_QUEUE_URL ?? '',
      completionQueueUrl: process.env.K1_COMPLETION_QUEUE_URL ?? '',
    },
    bda: {
      region: process.env.K1_BDA_REGION ?? process.env.AWS_REGION ?? 'us-west-2',
      profileArn: process.env.K1_BDA_PROFILE_ARN ?? '',
      projectArn: process.env.K1_BDA_PROJECT_ARN ?? '',
      projectStage: (process.env.K1_BDA_PROJECT_STAGE ?? 'DEVELOPMENT') as
        | 'DEVELOPMENT'
        | 'LIVE',
      blueprintArn: process.env.K1_BDA_BLUEPRINT_ARN ?? '',
      blueprintVersion: process.env.K1_BDA_BLUEPRINT_VERSION ?? '',
      mappingSchemaVersion:
        process.env.K1_MAPPING_SCHEMA_VERSION ?? 'k1-form-1065-v1',
    },
    bedrockReview: {
      modelId: process.env.K1_BEDROCK_CHECKBOX_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0',
      maxDocumentBytes: asNumber(process.env.K1_BEDROCK_CHECKBOX_MAX_BYTES, 5 * 1024 * 1024),
    },
  },
  marketData: {
    realTimeEquitiesEnabled: resolveRealTimeEquitiesEnabled(process.env, nodeEnv),
    provider: (process.env.MARKET_DATA_PROVIDER ?? 'none') as 'none' | 'alpaca',
    // Production reads must serve durable observations only. Refreshes run
    // through the separately admitted scheduler/manual mutation paths.
    refreshOnRead:
      nodeEnv === 'production'
        ? false
        : asBoolean(process.env.MARKET_DATA_REFRESH_ON_READ, true),
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
  abuseProtection: buildAbuseProtectionConfig(process.env, nodeEnv),
  aws: {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-west-2',
    appDomain: process.env.AWS_APP_DOMAIN ?? '',
    cloudFrontDistributionId: process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID ?? '',
    webAssetsBucket: process.env.AWS_WEB_ASSETS_BUCKET ?? '',
    marketPriceSchedulerEnabled: asBoolean(process.env.MARKET_PRICE_SCHEDULER_ENABLED),
    k1WorkerDesiredCount: asNumber(process.env.K1_WORKER_DESIRED_COUNT, 0),
    logRetentionDays: asNumber(process.env.PRODUCTION_LOG_RETENTION_DAYS, 30),
    alarmsConfigured: asBoolean(process.env.PRODUCTION_ALARMS_CONFIGURED),
    applicationLogGroups: asList(process.env.AWS_APPLICATION_LOG_GROUPS, ''),
    applicationLogViewEnabled: asBoolean(process.env.AWS_APPLICATION_LOG_VIEW_ENABLED),
  },
}

export interface ProductionSessionSettings {
  persistenceSecretKey: string
  sessionSecret: string
  sessionCookieSecure: boolean
  sessionCookieName: string
  sessionCookieSameSite: string
  sessionIdleTimeoutSeconds: number
  sessionActivityWriteIntervalSeconds: number
  sessionAbsoluteTimeoutSeconds: number
  mfaLoginEnabled: boolean
}

export interface ProductionIdentitySettings {
  adminEmail: string
  adminDisplayName: string
  adminPassword: string
  superAdminEmail: string
  superAdminDisplayName: string
  superAdminPassword: string
}

export const validateProductionIdentitySettings = (
  settings: ProductionIdentitySettings,
): void => {
  if (settings.adminEmail === settings.superAdminEmail) {
    throw new Error('Production human identities must use distinct email addresses.')
  }
  if (settings.adminEmail !== 'tpatch@jspllc.com' || settings.adminDisplayName !== 'Tony Patch') {
    throw new Error('Production primary admin must be Tony Patch <tpatch@jspllc.com>.')
  }
  if (settings.superAdminEmail !== 'rpatch@jspllc.com' || settings.superAdminDisplayName !== 'Robert Patch') {
    throw new Error('Production super admin must be Robert Patch <rpatch@jspllc.com>.')
  }
  for (const [name, value] of [
    ['ADMIN_PASSWORD', settings.adminPassword],
    ['SUPER_ADMIN_PASSWORD', settings.superAdminPassword],
  ] as const) {
    if (value.length < 15 || value.length > 128) {
      throw new Error(`${name} must contain 15 through 128 characters in production.`)
    }
  }
  if (settings.adminPassword === settings.superAdminPassword) {
    throw new Error('Tony Patch and Robert Patch must not share a bootstrap password.')
  }
}

export const validateProductionSessionSettings = (
  settings: ProductionSessionSettings,
): void => {
  if (settings.persistenceSecretKey.length < 32 || settings.persistenceSecretKey.length > 4_096) {
    throw new Error('PERSISTENCE_SECRET_KEY must contain 32 through 4096 characters in production.')
  }
  if (settings.sessionSecret.length < 32 || settings.sessionSecret.length > 4_096) {
    throw new Error('SESSION_SECRET must contain 32 through 4096 characters in production.')
  }
  if (settings.persistenceSecretKey === settings.sessionSecret) {
    throw new Error('PERSISTENCE_SECRET_KEY and SESSION_SECRET must be distinct in production.')
  }
  if (!settings.sessionCookieSecure) {
    throw new Error('SESSION_COOKIE_SECURE must be true in production.')
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(settings.sessionCookieName)) {
    throw new Error('SESSION_COOKIE_NAME must be a bounded cookie-safe identifier.')
  }
  if (!['lax', 'strict', 'none'].includes(settings.sessionCookieSameSite)) {
    throw new Error('SESSION_COOKIE_SAMESITE must be lax, strict, or none in production.')
  }
  if (!settings.mfaLoginEnabled) {
    throw new Error('MFA_LOGIN_ENABLED must be true in production.')
  }
  if (
    !Number.isSafeInteger(settings.sessionIdleTimeoutSeconds)
    || settings.sessionIdleTimeoutSeconds < 60
    || !Number.isSafeInteger(settings.sessionAbsoluteTimeoutSeconds)
    || settings.sessionAbsoluteTimeoutSeconds < settings.sessionIdleTimeoutSeconds
    || settings.sessionAbsoluteTimeoutSeconds > 86_400
  ) {
    throw new Error('Production session idle/absolute timeouts must be finite and ordered.')
  }
  if (
    !Number.isSafeInteger(settings.sessionActivityWriteIntervalSeconds)
    || settings.sessionActivityWriteIntervalSeconds < 1
    || settings.sessionActivityWriteIntervalSeconds > settings.sessionIdleTimeoutSeconds
  ) {
    throw new Error('SESSION_ACTIVITY_WRITE_INTERVAL_SECONDS must be finite and no longer than the idle timeout.')
  }
}

// Background workers do not consume human bootstrap credentials or sessions.
// The API entrypoint separately enforces its process role before serving HTTP.
export const validateProductionProcessSettings = (
  settings: ProductionSessionSettings & ProductionIdentitySettings,
  role: 'api' | 'k1-worker',
): void => {
  if (role === 'api') {
    validateProductionSessionSettings(settings)
    validateProductionIdentitySettings(settings)
  }
}
if (nodeEnv === 'production') validateProductionProcessSettings(config, processRole)
