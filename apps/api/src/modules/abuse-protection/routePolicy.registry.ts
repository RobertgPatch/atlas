import type { FastifyContextConfig, FastifyInstance, RouteOptions } from 'fastify'

import {
  AUTHENTICATION_BOUNDARIES,
  FAILURE_MODES,
  HTTP_METHODS,
  IDEMPOTENCY_MODES,
  ROUTE_CLASSES,
  SCOPE_DIMENSIONS,
  type HttpMethod,
  type RouteProtectionPolicy,
} from './protection.types.js'

declare module 'fastify' {
  interface FastifyContextConfig {
    abuseProtection?: RouteProtectionPolicy
  }
}

export interface ExternalRouteRegistration {
  readonly method: HttpMethod
  readonly routePattern: string
  readonly policy: RouteProtectionPolicy | null
}

export interface RoutePolicyCoverageIssue {
  readonly routeKey: string
  readonly reason:
    | 'missing_policy'
    | 'policy_route_mismatch'
    | 'duplicate_route'
}

export interface RoutePolicyCoverageResult {
  readonly routes: readonly ExternalRouteRegistration[]
  readonly issues: readonly RoutePolicyCoverageIssue[]
}

const httpMethods = new Set<string>(HTTP_METHODS)
const routeClasses = new Set<string>(ROUTE_CLASSES)
const authenticationBoundaries = new Set<string>(AUTHENTICATION_BOUNDARIES)
const scopeDimensions = new Set<string>(SCOPE_DIMENSIONS)
const failureModes = new Set<string>(FAILURE_MODES)
const idempotencyModes = new Set<string>(IDEMPOTENCY_MODES)

const failClosedClasses = new Set<RouteProtectionPolicy['routeClass']>([
  'AUTH_ATTEMPT',
  'DATABASE_HEAVY_READ',
  'BUSINESS_WRITE',
  'ADMIN_WRITE',
  'DOCUMENT_DOWNLOAD',
  'WORKBOOK_IMPORT',
  'K1_UPLOAD_ADMISSION',
  'PAID_EXTRACTION',
  'EXTERNAL_PROVIDER',
  'EXPORT_DOWNLOAD',
  'INTERNAL_SCHEDULER',
])

const paidClasses = new Set<RouteProtectionPolicy['routeClass']>([
  'K1_UPLOAD_ADMISSION',
  'PAID_EXTRACTION',
  'EXTERNAL_PROVIDER',
  'EXPORT_DOWNLOAD',
])

const positiveInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`INVALID_ROUTE_POLICY_${name.toUpperCase()}`)
  }
}

export const canonicalRoutePattern = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || /[?#]/.test(trimmed)) {
    throw new Error('INVALID_CANONICAL_ROUTE_PATTERN')
  }
  const normalized = trimmed.replace(/\/{2,}/g, '/').replace(/\/$/, '')
  return normalized || '/'
}

export const canonicalRouteKey = (method: string, routePattern: string): string => {
  const normalizedMethod = method.trim().toUpperCase()
  if (!httpMethods.has(normalizedMethod)) throw new Error('INVALID_HTTP_METHOD')
  return `${normalizedMethod} ${canonicalRoutePattern(routePattern)}`
}

export const validateRouteProtectionPolicy = (
  policy: RouteProtectionPolicy,
): RouteProtectionPolicy => {
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(policy.policyKey)) {
    throw new Error('INVALID_ROUTE_POLICY_KEY')
  }
  if (!httpMethods.has(policy.method)) throw new Error('INVALID_ROUTE_POLICY_METHOD')
  canonicalRoutePattern(policy.routePattern)
  if (!routeClasses.has(policy.routeClass)) throw new Error('INVALID_ROUTE_CLASS')
  if (!authenticationBoundaries.has(policy.authentication)) {
    throw new Error('INVALID_AUTHENTICATION_BOUNDARY')
  }
  if (!failureModes.has(policy.failureMode)) throw new Error('INVALID_FAILURE_MODE')
  if (!idempotencyModes.has(policy.idempotency)) throw new Error('INVALID_IDEMPOTENCY_MODE')
  if (!policy.owner.trim() || policy.owner.length > 128) {
    throw new Error('INVALID_ROUTE_POLICY_OWNER')
  }
  if (new Set(policy.scopeDimensions).size !== policy.scopeDimensions.length) {
    throw new Error('DUPLICATE_ROUTE_POLICY_SCOPE')
  }
  if (policy.scopeDimensions.some((scope) => !scopeDimensions.has(scope))) {
    throw new Error('INVALID_ROUTE_POLICY_SCOPE')
  }
  if (policy.localRate) {
    positiveInteger(policy.localRate.requests, 'local_rate_requests')
    positiveInteger(policy.localRate.windowSeconds, 'local_rate_window')
  }
  for (const rate of policy.durableRates) {
    if (!rate.policyLimitKey.trim()) throw new Error('INVALID_DURABLE_RATE_KEY')
    positiveInteger(rate.requests, 'durable_rate_requests')
    positiveInteger(rate.windowSeconds, 'durable_rate_window')
    if (rate.units !== undefined) positiveInteger(rate.units, 'durable_rate_units')
  }
  if (policy.concurrencyLimit !== null) {
    positiveInteger(policy.concurrencyLimit, 'concurrency_limit')
  }
  if (policy.backlogLimit !== null) positiveInteger(policy.backlogLimit, 'backlog_limit')
  if (failClosedClasses.has(policy.routeClass) && policy.failureMode !== 'fail_closed') {
    throw new Error('UNSAFE_ROUTE_POLICY_FAILURE_MODE')
  }
  if (paidClasses.has(policy.routeClass)) {
    if (!policy.killSwitch?.trim()) throw new Error('PAID_ROUTE_MISSING_KILL_SWITCH')
    if (policy.idempotency === 'none') throw new Error('PAID_ROUTE_MISSING_IDEMPOTENCY')
    if (policy.costUnits.length === 0) throw new Error('PAID_ROUTE_MISSING_COST_UNITS')
    if (policy.costDrivers.length === 0) throw new Error('PAID_ROUTE_MISSING_COST_DRIVERS')
    if (policy.concurrencyLimit === null) throw new Error('PAID_ROUTE_MISSING_CONCURRENCY')
    if (!policy.durableRates.some((rate) => rate.scope === 'global')) {
      throw new Error('PAID_ROUTE_MISSING_GLOBAL_LIMIT')
    }
  }
  return policy
}

export const defineRouteProtectionPolicy = <T extends RouteProtectionPolicy>(
  policy: T,
): T => {
  validateRouteProtectionPolicy(policy)
  return Object.freeze(policy)
}

export class RoutePolicyRegistry {
  readonly #byPolicyKey = new Map<string, RouteProtectionPolicy>()
  readonly #byRouteKey = new Map<string, RouteProtectionPolicy>()

  register(policy: RouteProtectionPolicy): void {
    validateRouteProtectionPolicy(policy)
    const routeKey = canonicalRouteKey(policy.method, policy.routePattern)
    const existingPolicy = this.#byPolicyKey.get(policy.policyKey)
    const existingRoute = this.#byRouteKey.get(routeKey)
    if (existingPolicy && existingPolicy !== policy) {
      throw new Error(`DUPLICATE_ROUTE_POLICY_KEY:${policy.policyKey}`)
    }
    if (existingRoute && existingRoute.policyKey !== policy.policyKey) {
      throw new Error(`DUPLICATE_ROUTE_POLICY_ROUTE:${routeKey}`)
    }
    this.#byPolicyKey.set(policy.policyKey, policy)
    this.#byRouteKey.set(routeKey, policy)
  }

  getByPolicyKey(policyKey: string): RouteProtectionPolicy | undefined {
    return this.#byPolicyKey.get(policyKey)
  }

  getByRoute(method: string, routePattern: string): RouteProtectionPolicy | undefined {
    return this.#byRouteKey.get(canonicalRouteKey(method, routePattern))
  }

  list(): readonly RouteProtectionPolicy[] {
    return [...this.#byRouteKey.values()].sort((a, b) =>
      canonicalRouteKey(a.method, a.routePattern).localeCompare(
        canonicalRouteKey(b.method, b.routePattern),
      ),
    )
  }
}

const methodsFor = (method: RouteOptions['method']): HttpMethod[] => {
  const values = Array.isArray(method) ? method : [method]
  return values.map((value) => {
    const normalized = String(value).toUpperCase()
    if (!httpMethods.has(normalized)) throw new Error(`INVALID_HTTP_METHOD:${normalized}`)
    return normalized as HttpMethod
  })
}

export const inspectRoutePolicyCoverage = (
  routes: readonly ExternalRouteRegistration[],
): RoutePolicyCoverageResult => {
  const issues: RoutePolicyCoverageIssue[] = []
  const seen = new Set<string>()
  for (const route of routes) {
    const routeKey = canonicalRouteKey(route.method, route.routePattern)
    if (seen.has(routeKey)) issues.push({ routeKey, reason: 'duplicate_route' })
    seen.add(routeKey)
    if (!route.policy) {
      issues.push({ routeKey, reason: 'missing_policy' })
      continue
    }
    const policyRouteKey = canonicalRouteKey(
      route.policy.method,
      route.policy.routePattern,
    )
    if (policyRouteKey !== routeKey) {
      issues.push({ routeKey, reason: 'policy_route_mismatch' })
    }
  }
  return { routes, issues }
}

export const assertRoutePolicyCoverage = (
  routes: readonly ExternalRouteRegistration[],
): void => {
  const result = inspectRoutePolicyCoverage(routes)
  if (result.issues.length === 0) return
  const summary = result.issues
    .map((issue) => `${issue.reason}:${issue.routeKey}`)
    .sort()
    .join(',')
  throw new Error(`ABUSE_PROTECTION_ROUTE_COVERAGE_FAILED:${summary}`)
}

export interface RoutePolicyCoveragePluginOptions {
  readonly registry?: RoutePolicyRegistry
  readonly enforceAtStartup: boolean
  readonly includeRoute?: (routePattern: string) => boolean
  readonly defaultPolicy?: (
    method: HttpMethod,
    routePattern: string,
  ) => RouteProtectionPolicy
}

export const registerRoutePolicyCoverage = (
  app: FastifyInstance,
  options: RoutePolicyCoveragePluginOptions,
): readonly ExternalRouteRegistration[] => {
  const registry = options.registry ?? new RoutePolicyRegistry()
  const registrations: ExternalRouteRegistration[] = []
  const getRoutePatterns = new Set<string>()
  const includeRoute =
    options.includeRoute ??
    ((routePattern: string) => routePattern === '/health' || routePattern.startsWith('/v1/'))

  app.addHook('onRoute', (routeOptions) => {
    // Fastify plugins may register internal wildcard routes (for example the
    // CORS OPTIONS handler). They are not externally owned Atlas endpoints.
    if (!routeOptions.url.startsWith('/')) return
    const routePattern = canonicalRoutePattern(routeOptions.url)
    if (!includeRoute(routePattern)) return
    for (const method of methodsFor(routeOptions.method)) {
      // Fastify automatically exposes a HEAD sibling for every GET route. It
      // executes the same route hooks and policy, so inventory the declared GET
      // once while retaining separately declared HEAD-only endpoints.
      if (method === 'HEAD' && getRoutePatterns.has(routePattern)) continue
      if (method === 'GET') getRoutePatterns.add(routePattern)
      const declaredPolicy = (routeOptions.config as FastifyContextConfig | undefined)
        ?.abuseProtection ?? null
      const policy = declaredPolicy ?? options.defaultPolicy?.(method, routePattern) ?? null
      if (policy) {
        registry.register(policy)
        routeOptions.config = {
          ...routeOptions.config,
          abuseProtection: policy,
        }
      }
      registrations.push({ method, routePattern, policy })
    }
  })
  app.addHook('onReady', async () => {
    if (options.enforceAtStartup) assertRoutePolicyCoverage(registrations)
  })
  return registrations
}
