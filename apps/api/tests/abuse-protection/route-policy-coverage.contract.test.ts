import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import {
  AUTHENTICATION_BOUNDARIES,
  HTTP_METHODS,
  ROUTE_CLASSES,
  type ExternalRouteRegistration,
} from '../../src/modules/abuse-protection/index.js'
import {
  canonicalRouteKey,
  canonicalRoutePattern,
  assertRoutePolicyCoverage,
} from '../../src/modules/abuse-protection/routePolicy.registry.js'
import { defaultRouteProtectionPolicy } from '../../src/modules/abuse-protection/policy.defaults.js'

const EXPECTED_DECLARED_EXTERNAL_ROUTES = 146

interface AuthWafContract {
  readonly schemaVersion: string
  readonly method: string
  readonly routes: readonly string[]
  readonly regex: string
}

const authWafContract = JSON.parse(readFileSync(new URL(
  '../../../../infra/aws/terraform/auth-route-scope.json',
  import.meta.url,
), 'utf8')) as AuthWafContract

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const routeLabel = (route: ExternalRouteRegistration): string =>
  `${route.method} ${route.routePattern}`

describe('external route protection policy coverage', () => {
  const openApps: ReturnType<typeof buildApp>[] = []

  afterEach(async () => {
    await Promise.all(openApps.splice(0).map((app) => app.close()))
  })

  const readyApp = async () => {
    const app = buildApp()
    openApps.push(app)
    await app.ready()
    return app
  }

  it('inventories declared routes without double-counting Fastify auto-HEAD siblings', async () => {
    const app = await readyApp()
    const inventory = app.abuseProtectionRouteInventory
    const routeKeys = inventory.map((route) =>
      canonicalRouteKey(route.method, route.routePattern))

    expect(inventory).toHaveLength(EXPECTED_DECLARED_EXTERNAL_ROUTES)
    expect(new Set(routeKeys).size).toBe(EXPECTED_DECLARED_EXTERNAL_ROUTES)

    const declaredGetPatterns = new Set(
      inventory
        .filter((route) => route.method === 'GET')
        .map((route) => route.routePattern),
    )
    const duplicateAutoHeads = inventory
      .filter((route) => route.method === 'HEAD' && declaredGetPatterns.has(route.routePattern))
      .map(routeLabel)

    expect(duplicateAutoHeads).toEqual([])
    expect(app.hasRoute({ method: 'GET', url: '/health' })).toBe(true)
    expect(app.hasRoute({ method: 'HEAD', url: '/health' })).toBe(true)
  })

  it('registers the retained operational surface without retired development APIs', async () => {
    const app = await readyApp()
    const routeKeys = new Set(app.abuseProtectionRouteInventory.map((route) =>
      canonicalRouteKey(route.method, route.routePattern)))

    for (const retained of [
      { method: 'POST' as const, routePattern: '/v1/k1-documents/:k1DocumentId/apply' },
      { method: 'PATCH' as const, routePattern: '/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear' },
      { method: 'GET' as const, routePattern: '/v1/admin/production-readiness' },
      { method: 'GET' as const, routePattern: '/v1/admin/protection-controls' },
      { method: 'GET' as const, routePattern: '/v1/admin/users' },
      { method: 'GET' as const, routePattern: '/v1/admin/application-logs' },
      { method: 'GET' as const, routePattern: '/v1/liquidity-sectors' },
      { method: 'PUT' as const, routePattern: '/v1/liquidity-sectors/:symbol' },
      { method: 'POST' as const, routePattern: '/v1/auth/password/change' },
    ]) {
      expect(routeKeys.has(canonicalRouteKey(retained.method, retained.routePattern))).toBe(true)
    }

    for (const retired of [
      { method: 'GET' as const, routePattern: '/v1/k1-tracker/partnerships' },
      { method: 'POST' as const, routePattern: '/v1/k1-tracker/imports/preview' },
      { method: 'GET' as const, routePattern: '/v1/admin/users/:userId' },
      { method: 'POST' as const, routePattern: '/v1/admin/dev/seed' },
      { method: 'POST' as const, routePattern: '/v1/plaid/link-token' },
      { method: 'POST' as const, routePattern: '/v1/plaid/exchange-public-token' },
    ]) {
      expect(routeKeys.has(canonicalRouteKey(retired.method, retired.routePattern))).toBe(false)
    }
  })

  it('requires complete canonical policy metadata on every declared external route', async () => {
    const app = await readyApp()
    const issues: string[] = []
    const validMethods = new Set<string>(HTTP_METHODS)
    const validAuthentication = new Set<string>(AUTHENTICATION_BOUNDARIES)
    const validClasses = new Set<string>(ROUTE_CLASSES)

    for (const route of app.abuseProtectionRouteInventory) {
      const label = routeLabel(route)
      if (!validMethods.has(route.method)) issues.push(`${label}:missing_or_invalid_method`)

      try {
        if (canonicalRoutePattern(route.routePattern) !== route.routePattern) {
          issues.push(`${label}:noncanonical_template`)
        }
      } catch {
        issues.push(`${label}:missing_or_invalid_template`)
      }

      const policy = route.policy
      if (!policy) {
        issues.push(`${label}:missing_policy`)
        continue
      }
      if (policy.method !== route.method) issues.push(`${label}:policy_method_mismatch`)
      if (canonicalRoutePattern(policy.routePattern) !== route.routePattern) {
        issues.push(`${label}:policy_template_mismatch`)
      }
      if (!validAuthentication.has(policy.authentication)) {
        issues.push(`${label}:missing_or_invalid_authentication`)
      }
      if (!validClasses.has(policy.routeClass)) {
        issues.push(`${label}:missing_or_invalid_class`)
      }
      if (!policy.owner.trim()) issues.push(`${label}:missing_owner`)
      if (
        policy.costDrivers.length === 0
        || policy.costDrivers.some((driver) => !driver.trim())
      ) {
        issues.push(`${label}:missing_cost_driver`)
      }
    }

    expect(issues.sort()).toEqual([])
  })

  it('protects sector management as authenticated, bounded Admin work', async () => {
    const app = await readyApp()
    const routes = app.abuseProtectionRouteInventory.filter((route) =>
      route.routePattern.startsWith('/v1/liquidity-sectors'))
    expect(routes).toHaveLength(2)
    for (const route of routes) {
      expect(route.policy?.authentication).toBe('admin')
      expect(route.policy?.owner).toBeTruthy()
      expect(route.policy?.localRates.length).toBeGreaterThan(0)
    }
  })

  it('protects every statement-ingestion route as authenticated, bounded Admin work', async () => {
    const app = await readyApp()
    const routes = app.abuseProtectionRouteInventory.filter((route) =>
      route.routePattern.startsWith('/v1/liquidity-statements'))

    expect(routes.length).toBeGreaterThanOrEqual(15)
    for (const route of routes) {
      expect(route.policy?.authentication).toBe('admin')
      expect(route.policy?.owner).toBeTruthy()
      expect(route.policy?.localRates.length).toBeGreaterThan(0)
      expect(route.policy?.payloadLimits.bodyBytes).toBeGreaterThan(0)
    }
  })

  it('keeps every credential-work route synchronized with the exact WAF contract', async () => {
    const app = await readyApp()
    const inventory = app.abuseProtectionRouteInventory
    const authRoutes = inventory
      .filter((route) => route.policy?.routeClass === 'AUTH_ATTEMPT')
      .map((route) => route.routePattern)
      .sort()
    const credentialCandidates = inventory.filter((route) =>
      route.routePattern.startsWith('/v1/auth/')
      && /(login|mfa|password|recovery|recover|reset|forgot|credential)/i.test(route.routePattern))

    expect(authWafContract.schemaVersion).toBe('1.0.0')
    expect(authWafContract.method).toBe('POST')
    expect(authRoutes).toEqual([...authWafContract.routes].sort())
    expect(credentialCandidates.every(
      (route) => route.method === 'POST' && route.policy?.routeClass === 'AUTH_ATTEMPT',
    )).toBe(true)
    expect(authWafContract.regex).toBe(
      `^(?:${authRoutes.map(escapeRegex).join('|')})$`,
    )
  })

  it('declares independent shared-class source and authenticated-principal limits', () => {
    const first = defaultRouteProtectionPolicy('GET', '/v1/entities')
    const second = defaultRouteProtectionPolicy('GET', '/v1/partnerships')

    for (const policy of [first, second]) {
      expect(policy.owner).toBeTruthy()
      expect(policy.localRates.map((rate) => rate.scope)).toEqual([
        'global',
        'source_prefix',
        'user',
        'session',
      ])
      expect(policy.localRates.every((rate) => !rate.limitKey.includes('+'))).toBe(true)
    }
    expect(first.localRates[0]?.limitKey).toBe(second.localRates[0]?.limitKey)
    expect(first.localRates[1]?.limitKey).toBe(second.localRates[1]?.limitKey)
    expect(first.localRates[2]?.limitKey).toBe(second.localRates[2]?.limitKey)
  })

  it('keeps unclassified routes as a startup coverage failure', () => {
    expect(() => assertRoutePolicyCoverage([{
      method: 'GET',
      routePattern: '/v1/new-unclassified-route',
      policy: null,
    }])).toThrow(/ABUSE_PROTECTION_ROUTE_COVERAGE_FAILED/)
  })
})
