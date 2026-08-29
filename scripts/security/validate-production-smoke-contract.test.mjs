import assert from 'node:assert/strict'
import test from 'node:test'

import { validateProductionSmokeContract } from './validate-production-smoke-contract.mjs'

const routeSource = `
export const PUBLIC_ROUTE_PATTERNS = ['/', '/mfa/setup', '/mfa'] as const
export const CURRENT_PROTECTED_ROUTE_PATTERNS = [
  '/dashboard', '/investment-tracker', '/liquidity', '/entities', '/entities/:id',
  '/estate-maps', '/tic-registry', '/reports', '/k1', '/k1/:id/review',
] as const
`

const contract = {
  schemaVersion: '1.0.0',
  routeDecisions: [
    ['/', 'edge-home'], ['/mfa/setup', 'auth-login'], ['/mfa', 'auth-login'],
    ['/dashboard', 'dashboard-read'], ['/investment-tracker', 'investment-aggregation-read'],
    ['/liquidity', 'liquidity-holdings-read'], ['/entities', 'entities-list-read'],
    ['/entities/:id', 'entity-detail-read'], ['/estate-maps', 'current-surface-contract'],
    ['/tic-registry', 'tic-properties-read'], ['/reports', 'current-surface-contract'],
    ['/k1', 'current-surface-contract'], ['/k1/:id/review', 'current-surface-contract'],
  ].map(([route, decision]) => ({ route, decision })),
  requests: [
    { name: 'edge-home', method: 'GET', path: '/' },
    { name: 'auth-login', method: 'POST', path: '/v1/auth/login', sessionOnlyMutation: true },
    { name: 'dashboard-read', method: 'GET', path: '/v1/dashboard' },
    { name: 'liquidity-holdings-read', method: 'GET', path: '/v1/reports/consolidated-holdings?pricingMode=saved&page=1&pageSize=1' },
    { name: 'liquidity-performance-read', method: 'GET', path: '/v1/reports/consolidated-holdings/performance' },
    { name: 'investment-aggregation-read', method: 'GET', path: '/v1/partnership-tracker/aggregation?page=1&pageSize=25' },
    { name: 'tic-properties-read', method: 'GET', path: '/v1/tic-registry/properties' },
    { name: 'entities-list-read', method: 'GET', path: '/v1/entities' },
    { name: 'entity-detail-read', method: 'GET', path: '/v1/entities/{id}' },
    { name: 'auth-logout', method: 'POST', path: '/v1/auth/logout', sessionOnlyMutation: true },
  ],
}

test('requires an explicit decision for every browser route and all retained production reads', () => {
  const result = validateProductionSmokeContract(routeSource, contract)
  assert.equal(result.valid, true, JSON.stringify(result.findings))
})

test('rejects route drift, refresh/provider calls, and business-data mutations deterministically', () => {
  const changed = structuredClone(contract)
  changed.routeDecisions = changed.routeDecisions.filter((entry) => entry.route !== '/liquidity')
  changed.routeDecisions.push({ route: '/removed-route', decision: 'current-surface-contract' })
  changed.requests.push({ name: 'bad-refresh', method: 'POST', path: '/v1/reports/consolidated-holdings/refresh' })
  const result = validateProductionSmokeContract(routeSource, changed)
  assert.equal(result.valid, false)
  assert.deepEqual(result.findings.map(({ rule }) => rule), [
    'missing-route-decision',
    'stale-route-decision',
    'prohibited-smoke-method',
    'prohibited-provider-path',
  ])
})
