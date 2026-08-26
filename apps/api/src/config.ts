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

type EnvironmentSource = Readonly<Record<string, string | undefined>>

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
) => ({
  requests: strictInteger(env, environment, requestsName, requestsFallback, { max: 1_000_000 }),
  seconds: strictInteger(env, environment, secondsName, secondsFallback, { max: 86_400 }),
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

  const config = {
    productionRequiresExplicitPaidLimits: true,
    localRates: {
      maximumBuckets: strictInteger(env, environment, 'ABUSE_LOCAL_MAX_BUCKETS', 10_000, {
        max: 1_000_000,
      }),
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
      ),
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
      monthlyCost: {
        maximumCents: strictInteger(
          env,
          environment,
          'ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS',
          2_500,
          { productionExplicit: true, max: 2_500 },
        ),
        k1UploadFiles: strictInteger(env, environment, 'ABUSE_K1_GLOBAL_FILES_PER_MONTH', 50, productionPaidLimit),
        k1BdaProviderCalls: strictInteger(env, environment, 'ABUSE_K1_BDA_CALLS_PER_MONTH', 1, productionPaidLimit),
        k1CheckboxCalls: strictInteger(env, environment, 'ABUSE_K1_CHECKBOX_CALLS_PER_MONTH', 4, productionPaidLimit),
        plaidLinkTokens: strictInteger(env, environment, 'ABUSE_PLAID_LINK_TOKENS_PER_MONTH', 10, productionPaidLimit),
        plaidExchanges: strictInteger(env, environment, 'ABUSE_PLAID_EXCHANGES_PER_MONTH', 5, productionPaidLimit),
        plaidRefreshes: strictInteger(env, environment, 'ABUSE_PLAID_REFRESHES_PER_MONTH', 2, productionPaidLimit),
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
      workbookImport: {
        userPerDay: strictInteger(env, environment, 'ABUSE_WORKBOOK_USER_PER_DAY', 5, productionPaidLimit),
        globalPerDay: strictInteger(env, environment, 'ABUSE_WORKBOOK_GLOBAL_PER_DAY', 25, productionPaidLimit),
        globalConcurrency: strictInteger(env, environment, 'ABUSE_WORKBOOK_GLOBAL_CONCURRENCY', 2, productionPaidLimit),
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
        plaidLinkTokensPerUserDay: strictInteger(env, environment, 'ABUSE_PLAID_LINK_TOKENS_USER_PER_DAY', 5, productionPaidLimit),
        plaidExchangesPerUserDay: strictInteger(env, environment, 'ABUSE_PLAID_EXCHANGES_USER_PER_DAY', 5, productionPaidLimit),
        plaidRefreshesPerAccountDay: strictInteger(env, environment, 'ABUSE_PLAID_REFRESHES_ACCOUNT_PER_DAY', 4, productionPaidLimit),
        plaidRefreshesGlobalDay: strictInteger(env, environment, 'ABUSE_PLAID_REFRESHES_GLOBAL_PER_DAY', 25, productionPaidLimit),
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
      plaidMaximumAttempts: strictInteger(env, environment, 'ABUSE_PLAID_MAX_ATTEMPTS', 2, { ...productionPaidLimit, max: 10 }),
      marketDataMaximumAttempts: strictInteger(env, environment, 'ABUSE_MARKET_DATA_MAX_ATTEMPTS', 2, { ...productionPaidLimit, max: 10 }),
      sqsMaximumReceives: strictInteger(env, environment, 'ABUSE_SQS_MAX_RECEIVES', 5, { ...productionPaidLimit, max: 100 }),
      baseDelayMs: strictInteger(env, environment, 'ABUSE_RETRY_BASE_DELAY_MS', 200, { max: 60_000 }),
      maximumDelayMs: strictInteger(env, environment, 'ABUSE_RETRY_MAX_DELAY_MS', 2_000, { max: 300_000 }),
    },
    hmac: {
      keyId: strictIdentifier(env, environment, 'ABUSE_HMAC_KEY_ID', 'local-v1', true),
      activeKey: activeHmacKey,
      previousKeys: previousHmacKeys,
      rotationMaxDays: strictInteger(env, environment, 'ABUSE_HMAC_ROTATION_MAX_DAYS', 90, {
        max: 365,
      }),
    },
    killSwitches: {
      k1UploadsEnabled: strictBoolean(env, environment, 'K1_UPLOADS_ENABLED', false, true),
      k1ExtractionEnabled: strictBoolean(env, environment, 'K1_EXTRACTION_ENABLED', false, true),
      k1BedrockCheckboxEnabled: strictBoolean(env, environment, 'K1_BEDROCK_CHECKBOX_ENABLED', false, true),
      plaidRefreshEnabled: strictBoolean(env, environment, 'PLAID_REFRESH_ENABLED', false, true),
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
      workbookFileBytes: strictInteger(env, environment, 'ABUSE_WORKBOOK_MAX_FILE_BYTES', 25 * 1024 * 1024, { max: 100 * 1024 * 1024 }),
      workbookRows: strictInteger(env, environment, 'ABUSE_WORKBOOK_MAX_ROWS', 100_000, { max: 1_000_000 }),
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
      maximumChallenges: strictInteger(env, environment, 'ABUSE_MFA_MAX_CHALLENGES', 10_000, { max: 1_000_000 }),
      maximumEnrollments: strictInteger(env, environment, 'ABUSE_MFA_MAX_ENROLLMENTS', 10_000, { max: 1_000_000 }),
    },
    timeouts: {
      requestMs: strictInteger(env, environment, 'ABUSE_REQUEST_TIMEOUT_MS', 30_000, { max: 300_000 }),
      headersMs: strictInteger(env, environment, 'ABUSE_HEADERS_TIMEOUT_MS', 10_000, { max: 120_000 }),
      keepAliveMs: strictInteger(env, environment, 'ABUSE_KEEP_ALIVE_TIMEOUT_MS', 5_000, { max: 120_000 }),
      databaseHeavyHandlerMs: strictInteger(env, environment, 'ABUSE_HEAVY_HANDLER_TIMEOUT_MS', 15_000, { max: 120_000 }),
      documentDownloadMs: strictInteger(env, environment, 'ABUSE_DOWNLOAD_TIMEOUT_MS', 30_000, { max: 300_000 }),
      workbookImportMs: strictInteger(env, environment, 'ABUSE_WORKBOOK_TIMEOUT_MS', 30_000, { max: 300_000 }),
      bdaProviderMs: strictInteger(env, environment, 'ABUSE_BDA_TIMEOUT_MS', 60_000, { ...productionPaidLimit, max: 300_000 }),
      bedrockProviderMs: strictInteger(env, environment, 'ABUSE_BEDROCK_TIMEOUT_MS', 30_000, { ...productionPaidLimit, max: 300_000 }),
      plaidProviderMs: strictInteger(env, environment, 'ABUSE_PLAID_TIMEOUT_MS', 10_000, { ...productionPaidLimit, max: 300_000 }),
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

  if (config.quotas.workbookImport.userPerDay > config.quotas.workbookImport.globalPerDay) {
    throw configurationError('ABUSE_WORKBOOK_USER_PER_DAY', 'must not exceed the global daily ceiling')
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
  if (config.quotas.externalProvider.plaidRefreshesPerAccountDay > config.quotas.externalProvider.plaidRefreshesGlobalDay) {
    throw configurationError('ABUSE_PLAID_REFRESHES_ACCOUNT_PER_DAY', 'must not exceed the global daily ceiling')
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
const defaultDevelopmentDatabaseUrl = 'postgres://postgres:postgres@127.0.0.1:15432/atlas'
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
  trustedProxyCidrs,
  databaseUrl,
  persistenceSecretKey: process.env.PERSISTENCE_SECRET_KEY ?? '',
  requireDurablePersistence: asBoolean(process.env.REQUIRE_DURABLE_PERSISTENCE),
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@jackson.com',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'password123',
  userEmail: process.env.USER_EMAIL ?? 'user@jackson.com',
  userPassword: process.env.USER_PASSWORD ?? 'password123',
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
  storageRoot: process.env.STORAGE_ROOT ?? './.storage',
  k1UploadMaxBytes: asNumber(process.env.K1_UPLOAD_MAX_BYTES, 25 * 1024 * 1024),
  k1ExtractorBackend: (process.env.K1_EXTRACTOR ?? 'stub') as
    | 'stub'
    | 'aws_bda',
  k1Ingestion: {
    awsEnabled: asBoolean(process.env.K1_AWS_INGESTION_ENABLED),
    batchMaxFiles: asNumber(process.env.K1_BATCH_MAX_FILES, 25),
    uploadMaxBytes: asNumber(process.env.K1_UPLOAD_MAX_BYTES, 25 * 1024 * 1024),
    uploadMaxPages: asNumber(process.env.K1_UPLOAD_MAX_PAGES, 100),
    uploadUrlTtlSeconds: asNumber(process.env.K1_UPLOAD_URL_TTL_SECONDS, 900),
    objectStore: (process.env.K1_OBJECT_STORE ?? 'local') as 'local' | 's3',
    queue: (process.env.K1_QUEUE ?? 'local') as 'local' | 'sqs',
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

export interface ProductionSessionSettings {
  sessionSecret: string
  sessionCookieSecure: boolean
  sessionCookieName: string
  sessionCookieSameSite: string
  sessionIdleTimeoutSeconds: number
  sessionActivityWriteIntervalSeconds: number
  sessionAbsoluteTimeoutSeconds: number
}

export const validateProductionSessionSettings = (
  settings: ProductionSessionSettings,
): void => {
  if (settings.sessionSecret.length < 32 || settings.sessionSecret.length > 4_096) {
    throw new Error('SESSION_SECRET must contain 32 through 4096 characters in production.')
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

if (nodeEnv === 'production') validateProductionSessionSettings(config)
