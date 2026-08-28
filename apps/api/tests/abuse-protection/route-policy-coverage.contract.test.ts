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
} from '../../src/modules/abuse-protection/routePolicy.registry.js'

const EXPECTED_DECLARED_EXTERNAL_ROUTES = 125

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

  it('inventories all 125 declared routes without double-counting Fastify auto-HEAD siblings', async () => {
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

  it('registers the retained operational surface without retired direct-management APIs', async () => {
    const app = await readyApp()
    const routeKeys = new Set(app.abuseProtectionRouteInventory.map((route) =>
      canonicalRouteKey(route.method, route.routePattern)))

    for (const retained of [
      { method: 'POST' as const, routePattern: '/v1/k1-documents/:k1DocumentId/apply' },
      { method: 'PATCH' as const, routePattern: '/v1/partnership-tracker/partnerships/:partnershipId/years/:taxYear' },
      { method: 'GET' as const, routePattern: '/v1/admin/production-readiness' },
      { method: 'GET' as const, routePattern: '/v1/admin/protection-controls' },
      { method: 'POST' as const, routePattern: '/v1/admin/plaid-refresh/run' },
    ]) {
      expect(routeKeys.has(canonicalRouteKey(retained.method, retained.routePattern))).toBe(true)
    }

    for (const retired of [
      { method: 'GET' as const, routePattern: '/v1/k1-tracker/partnerships' },
      { method: 'POST' as const, routePattern: '/v1/k1-tracker/imports/preview' },
      { method: 'GET' as const, routePattern: '/v1/admin/users' },
      { method: 'GET' as const, routePattern: '/v1/admin/users/:userId' },
      { method: 'POST' as const, routePattern: '/v1/admin/dev/seed' },
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
})
