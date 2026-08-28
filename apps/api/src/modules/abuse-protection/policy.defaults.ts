import { createHash } from 'node:crypto'

import { config } from '../../config.js'
import {
  canonicalRoutePattern,
  defineRouteProtectionPolicy,
} from './routePolicy.registry.js'
import type {
  AuthenticationBoundary,
  CostUnitName,
  HttpMethod,
  RouteClass,
  RouteProtectionPolicy,
  ScopeDimension,
} from './protection.types.js'

const routeContains = (routePattern: string, fragments: readonly string[]): boolean =>
  fragments.some((fragment) => routePattern.includes(fragment))

const isReviewFinalizationRoute = (routePattern: string): boolean =>
  routePattern.startsWith('/v1/k1-documents/:k1DocumentId/')
  && (routePattern.endsWith('/approve') || routePattern.endsWith('/finalize'))

const isK1ApplicationAdminRoute = (routePattern: string): boolean =>
  routePattern === '/v1/k1-documents/:k1DocumentId/apply-preview'
  || routePattern === '/v1/k1-documents/:k1DocumentId/apply'

const isAdminManagedMutation = (
  method: HttpMethod,
  routePattern: string,
): boolean => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false
  if (routePattern.endsWith('/calculate')) return false
  return [
    '/v1/entities',
    '/v1/partnerships',
    '/v1/partnership-tracker',
    '/v1/tic-registry',
  ].some((root) => routePattern === root || routePattern.startsWith(`${root}/`))
}

const authenticationFor = (
  method: HttpMethod,
  routePattern: string,
): AuthenticationBoundary => {
  if (routePattern === '/health' || routePattern === '/v1/auth/login') return 'public'
  if (routePattern.startsWith('/v1/auth/mfa/')) return 'public'
  if (routePattern === '/v1/admin/plaid-refresh/run') return 'scheduler'
  if (routePattern.startsWith('/v1/admin/')) return 'admin'
  if (isReviewFinalizationRoute(routePattern)) return 'admin'
  if (isK1ApplicationAdminRoute(routePattern)) return 'admin'
  if (isAdminManagedMutation(method, routePattern)) return 'admin'
  return 'session'
}

const classFor = (
  method: HttpMethod,
  routePattern: string,
): RouteClass => {
  if (routePattern === '/health') return 'PUBLIC_HEALTH'
  if (
    routePattern === '/v1/auth/login'
    || routePattern.startsWith('/v1/auth/mfa/')
  ) return 'AUTH_ATTEMPT'
  if (
    routePattern === '/v1/auth/session'
    || routePattern.startsWith('/v1/auth/session/')
    || routePattern === '/v1/auth/logout'
  ) return 'AUTHENTICATED_READ'
  if (routePattern === '/v1/admin/plaid-refresh/run') return 'INTERNAL_SCHEDULER'
  if (isReviewFinalizationRoute(routePattern)) return 'ADMIN_WRITE'
  if (routePattern === '/v1/k1-documents/:k1DocumentId/apply') return 'ADMIN_WRITE'
  if (isAdminManagedMutation(method, routePattern)) return 'ADMIN_WRITE'
  if (
    method === 'POST'
    && (
      routePattern.endsWith('/calculate')
      || routePattern.endsWith('/apply-preview')
    )
  ) return 'DATABASE_HEAVY_READ'
  if (
    method === 'GET'
    && routeContains(routePattern, ['/export', '/export.csv'])
  ) return 'EXPORT_DOWNLOAD'
  if (method === 'GET' && routePattern.endsWith('/pdf')) return 'DOCUMENT_DOWNLOAD'
  if (
    routeContains(routePattern, [
      '/k1-ingestion-batches',
      '/k1-ingestion-items/:itemId/local-upload',
    ])
    && ['POST', 'PUT'].includes(method)
  ) return 'K1_UPLOAD_ADMISSION'
  if (
    routePattern === '/v1/k1-documents'
    && method === 'POST'
  ) return 'K1_UPLOAD_ADMISSION'
  if (
    routeContains(routePattern, ['/reparse', '/retry-extraction'])
    && method === 'POST'
  ) return 'PAID_EXTRACTION'
  if (
    method === 'POST'
    && routeContains(routePattern, [
      '/plaid/link-token',
      '/plaid/exchange-public-token',
      '/reports/consolidated-holdings/refresh',
    ])
  ) return 'EXTERNAL_PROVIDER'
  if (method === 'GET') {
    if (routeContains(routePattern, [
      '/dashboard',
      '/reports/',
      '/aggregation',
      '/management-fees',
      '/review-session',
      '/kpis',
    ])) return 'DATABASE_HEAVY_READ'
    return 'AUTHENTICATED_READ'
  }
  if (routePattern.startsWith('/v1/admin/')) return 'ADMIN_WRITE'
  return 'BUSINESS_WRITE'
}

const ownerFor = (routePattern: string): string => {
  if (routePattern === '/health' || routePattern.startsWith('/v1/auth/')) {
    return 'platform-security'
  }
  if (routePattern.startsWith('/v1/admin/')) return 'platform-operations'
  if (routeContains(routePattern, ['/k1-', '/k1/', '/review/'])) return 'tax-documents'
  if (routePattern.startsWith('/v1/plaid/')) return 'financial-integrations'
  if (routePattern.startsWith('/v1/reports/')) return 'reporting'
  if (routePattern.startsWith('/v1/tic-registry/')) return 'tic-registry'
  return 'partnerships'
}

const policyKeyFor = (method: HttpMethod, routePattern: string): string => {
  const readable = `${method}.${routePattern}`
    .toLowerCase()
    .replace(/^\w+\.\/v1\//, `${method.toLowerCase()}.`)
    .replace(/:[a-z0-9_]+/g, 'by-id')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '')
  if (readable.length <= 112) return `route.${readable}`
  const digest = createHash('sha256').update(`${method} ${routePattern}`).digest('hex').slice(0, 12)
  return `route.${readable.slice(0, 96)}.${digest}`
}

const paidSettings = (
  routeClass: RouteClass,
): Pick<
  RouteProtectionPolicy,
  | 'killSwitch'
  | 'idempotency'
  | 'concurrencyLimit'
  | 'backlogLimit'
  | 'costUnits'
  | 'costDrivers'
  | 'durableRates'
> => {
  const quotas = config.abuseProtection.quotas
  if (routeClass === 'K1_UPLOAD_ADMISSION') return {
    killSwitch: 'k1_uploads',
    idempotency: 'server_content',
    concurrencyLimit: quotas.k1Upload.activeBatchesPerUser,
    backlogLimit: quotas.paidExtraction.globalBacklog,
    costUnits: ['file', 'byte', 'storage_byte_day'],
    costDrivers: ['s3_write', 'document_validation'],
    durableRates: [{
      policyLimitKey: 'k1.upload.global', scope: 'global',
      requests: quotas.k1Upload.globalFilesPerDay, windowSeconds: 86_400,
    }],
  }
  if (routeClass === 'PAID_EXTRACTION') return {
    killSwitch: 'k1_extraction',
    idempotency: 'server_content',
    concurrencyLimit: quotas.paidExtraction.globalInFlight,
    backlogLimit: quotas.paidExtraction.globalBacklog,
    costUnits: ['document', 'page', 'provider_call', 'queue_message'],
    costDrivers: ['aws_bda', 'bedrock_checkbox', 'sqs'],
    durableRates: [{
      policyLimitKey: 'k1.extraction.global', scope: 'global',
      requests: quotas.paidExtraction.globalDocumentsPerDay, windowSeconds: 86_400,
    }],
  }
  if (routeClass === 'EXTERNAL_PROVIDER') return {
    killSwitch: 'external_provider',
    idempotency: 'server_content',
    concurrencyLimit: quotas.externalProvider.globalConcurrency,
    backlogLimit: quotas.externalProvider.globalConcurrency * 4,
    costUnits: ['provider_call'],
    costDrivers: ['third_party_provider_request'],
    durableRates: [{
      policyLimitKey: 'external.provider.global', scope: 'global',
      requests: quotas.externalProvider.marketProviderCallsGlobalDay, windowSeconds: 86_400,
    }],
  }
  if (routeClass === 'EXPORT_DOWNLOAD') return {
    killSwitch: 'report_exports',
    idempotency: 'server_content',
    concurrencyLimit: quotas.reportExport.globalConcurrency,
    backlogLimit: quotas.reportExport.globalConcurrency * 4,
    costUnits: ['export_row', 'output_byte'],
    costDrivers: ['database_export', 'response_generation'],
    durableRates: [{
      policyLimitKey: 'report.export.global', scope: 'global',
      requests: quotas.reportExport.globalExportsPerDay, windowSeconds: 86_400,
    }],
  }
  throw new Error(`UNSUPPORTED_PAID_ROUTE_CLASS:${routeClass}`)
}

const ordinarySettings = (
  routeClass: RouteClass,
): Pick<
  RouteProtectionPolicy,
  | 'killSwitch'
  | 'idempotency'
  | 'concurrencyLimit'
  | 'backlogLimit'
  | 'costUnits'
  | 'costDrivers'
  | 'durableRates'
> => {
  const rates = config.abuseProtection.exactRates
  if (routeClass === 'AUTH_ATTEMPT') return {
    killSwitch: null,
    idempotency: 'none',
    concurrencyLimit: rates.globalHashConcurrency,
    backlogLimit: rates.globalHashConcurrency * 2,
    costUnits: ['password_hash'],
    costDrivers: ['argon2_or_totp'],
    durableRates: [{
      policyLimitKey: 'auth.known-account', scope: 'account',
      requests: rates.knownAccount.requests, windowSeconds: rates.knownAccount.seconds,
    }],
  }
  if (routeClass === 'DATABASE_HEAVY_READ') return {
    killSwitch: null,
    idempotency: 'none',
    concurrencyLimit: rates.databaseHeavyGlobalConcurrency,
    backlogLimit: rates.databaseHeavyGlobalConcurrency * 4,
    costUnits: ['request'],
    costDrivers: ['database_aggregation'],
    durableRates: [
      {
        policyLimitKey: 'read.heavy.user', scope: 'user',
        requests: rates.databaseHeavyReadUser.requests,
        windowSeconds: rates.databaseHeavyReadUser.seconds,
      },
      {
        policyLimitKey: 'read.heavy.session', scope: 'session',
        requests: rates.databaseHeavyReadSessionRequests,
        windowSeconds: rates.databaseHeavyReadUser.seconds,
      },
      {
        policyLimitKey: 'read.heavy.tenant', scope: 'tenant',
        requests: rates.databaseHeavyReadTenantRequests,
        windowSeconds: rates.databaseHeavyReadUser.seconds,
      },
      {
        policyLimitKey: 'read.heavy.global', scope: 'global',
        requests: rates.databaseHeavyReadGlobalRequests,
        windowSeconds: rates.databaseHeavyReadUser.seconds,
      },
    ],
  }
  if (routeClass === 'INTERNAL_SCHEDULER') return {
    killSwitch: 'plaid_refresh',
    idempotency: 'server_content',
    concurrencyLimit: config.abuseProtection.quotas.scheduler.globalConcurrency,
    backlogLimit: config.abuseProtection.quotas.scheduler.globalConcurrency,
    costUnits: ['provider_call'],
    costDrivers: ['scheduled_provider_refresh'],
    durableRates: [{
      policyLimitKey: 'scheduler.global', scope: 'global',
      requests: config.abuseProtection.quotas.scheduler.operationsPerWindow,
      windowSeconds: config.abuseProtection.quotas.scheduler.windowSeconds,
    }],
  }
  if (routeClass === 'DOCUMENT_DOWNLOAD') return {
    killSwitch: null,
    idempotency: 'none',
    concurrencyLimit: config.abuseProtection.quotas.documentDownload.globalConcurrency,
    backlogLimit: config.abuseProtection.quotas.documentDownload.globalConcurrency * 4,
    costUnits: ['output_byte'],
    costDrivers: ['object_read', 'response_stream'],
    durableRates: [],
  }
  if (routeClass === 'BUSINESS_WRITE' || routeClass === 'ADMIN_WRITE') return {
    killSwitch: null,
    idempotency: 'optional',
    concurrencyLimit: null,
    backlogLimit: null,
    costUnits: ['request'],
    costDrivers: ['database_write'],
    durableRates: [
      {
        policyLimitKey: routeClass === 'ADMIN_WRITE' ? 'write.admin.user' : 'write.business.user',
        scope: 'user',
        requests: routeClass === 'ADMIN_WRITE'
          ? rates.adminWriteUser.requests
          : rates.businessWriteUser.requests,
        windowSeconds: routeClass === 'ADMIN_WRITE'
          ? rates.adminWriteUser.seconds
          : rates.businessWriteUser.seconds,
      },
      {
        policyLimitKey: routeClass === 'ADMIN_WRITE' ? 'write.admin.session' : 'write.business.session',
        scope: 'session',
        requests: routeClass === 'ADMIN_WRITE'
          ? rates.adminWriteSessionRequests
          : rates.businessWriteSessionRequests,
        windowSeconds: routeClass === 'ADMIN_WRITE'
          ? rates.adminWriteUser.seconds
          : rates.businessWriteUser.seconds,
      },
      {
        policyLimitKey: routeClass === 'ADMIN_WRITE' ? 'write.admin.tenant' : 'write.business.tenant',
        scope: 'tenant',
        requests: routeClass === 'ADMIN_WRITE'
          ? rates.adminWriteTenantRequests
          : rates.businessWriteTenantRequests,
        windowSeconds: routeClass === 'ADMIN_WRITE'
          ? rates.adminWriteUser.seconds
          : rates.businessWriteUser.seconds,
      },
      {
        policyLimitKey: routeClass === 'ADMIN_WRITE' ? 'write.admin.global' : 'write.business.global',
        scope: 'global',
        requests: routeClass === 'ADMIN_WRITE'
          ? rates.adminWriteGlobalRequests
          : rates.businessWriteGlobalRequests,
        windowSeconds: routeClass === 'ADMIN_WRITE'
          ? rates.adminWriteUser.seconds
          : rates.businessWriteUser.seconds,
      },
    ],
  }
  return {
    killSwitch: null,
    idempotency: 'none',
    concurrencyLimit: null,
    backlogLimit: null,
    costUnits: ['request'],
    costDrivers: [routeClass === 'PUBLIC_HEALTH' ? 'process_liveness' : 'database_read'],
    durableRates: [],
  }
}

const costUnitsFor = (routeClass: RouteClass): readonly CostUnitName[] => {
  const paid = new Set<RouteClass>([
    'K1_UPLOAD_ADMISSION', 'PAID_EXTRACTION', 'EXTERNAL_PROVIDER', 'EXPORT_DOWNLOAD',
  ])
  return paid.has(routeClass)
    ? paidSettings(routeClass).costUnits
    : ordinarySettings(routeClass).costUnits
}

export const defaultRouteProtectionPolicy = (
  method: HttpMethod,
  rawRoutePattern: string,
): RouteProtectionPolicy => {
  const routePattern = canonicalRoutePattern(rawRoutePattern)
  const routeClass = classFor(method, routePattern)
  const authentication = authenticationFor(method, routePattern)
  const localWindow = routeClass === 'AUTH_ATTEMPT'
    ? config.abuseProtection.localRates.authSource
    : config.abuseProtection.localRates.authenticatedReadUser
  const scopeDimensions: readonly ScopeDimension[] = authentication === 'public'
    ? ['source_prefix', ...(routeClass === 'AUTH_ATTEMPT' ? ['account'] as const : [])]
    : authentication === 'scheduler'
      ? ['global'] as const
      : ['user', 'session', 'tenant', 'global'] as const
  const classSettings = new Set<RouteClass>([
    'K1_UPLOAD_ADMISSION', 'PAID_EXTRACTION', 'EXTERNAL_PROVIDER', 'EXPORT_DOWNLOAD',
  ]).has(routeClass)
    ? paidSettings(routeClass)
    : ordinarySettings(routeClass)
  const routeKillSwitch = routeClass === 'EXTERNAL_PROVIDER'
    ? (routePattern.startsWith('/v1/plaid/') ? 'plaid_refresh' : 'market_data_refresh')
    : classSettings.killSwitch

  return defineRouteProtectionPolicy({
    policyKey: policyKeyFor(method, routePattern),
    routeClass,
    method,
    routePattern,
    authentication,
    scopeDimensions,
    localRate: routeClass === 'PUBLIC_HEALTH'
      ? { scope: 'source_prefix', requests: 120, windowSeconds: 60 }
      : { scope: authentication === 'public' ? 'source_prefix' : 'user', requests: localWindow.requests, windowSeconds: localWindow.seconds },
    payloadLimits: {
      bodyBytes: routeClass === 'AUTH_ATTEMPT'
        ? config.abuseProtection.payloadLimits.authJsonBodyBytes
        : config.abuseProtection.payloadLimits.businessJsonBodyBytes,
      queryParameters: config.abuseProtection.payloadLimits.maximumQueryParameters,
      pageSize: config.abuseProtection.payloadLimits.reportPageSize,
      maxDateRangeDays: config.abuseProtection.payloadLimits.maximumDateRangeDays,
      maxJsonDepth: config.abuseProtection.payloadLimits.maximumJsonDepth,
      maxProperties: config.abuseProtection.payloadLimits.maximumJsonProperties,
      responseBytes: config.abuseProtection.payloadLimits.responseBodyBytes,
      ...(routeClass === 'K1_UPLOAD_ADMISSION' ? {
        files: config.abuseProtection.payloadLimits.k1FilesPerBatch,
        fileBytes: config.abuseProtection.payloadLimits.k1FileBytes,
        multipartFields: config.abuseProtection.payloadLimits.multipartFields,
        multipartParts: config.abuseProtection.payloadLimits.multipartParts,
      } : {}),
      ...(routeClass === 'EXPORT_DOWNLOAD' ? {
        rows: config.abuseProtection.payloadLimits.exportRows,
      } : {}),
    },
    failureMode:
      routeClass === 'PUBLIC_HEALTH' || routeClass === 'AUTHENTICATED_READ'
        ? 'low_cost_degraded_read'
        : 'fail_closed',
    owner: ownerFor(routePattern),
    ...classSettings,
    killSwitch: routeKillSwitch,
    costUnits: costUnitsFor(routeClass),
  })
}
