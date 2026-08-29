import { buildApp } from '../../apps/api/dist/app.js'

const moduleFor = (method, pattern) => {
  if (pattern === '/health') return 'apps/api/src/app.ts'
  if (pattern.startsWith('/v1/auth/')) return 'apps/api/src/modules/auth/auth.routes.ts'
  if (pattern.startsWith('/v1/admin/')) return 'apps/api/src/modules/admin/admin.routes.ts'
  if (pattern === '/v1/dashboard') return 'apps/api/src/modules/dashboard/dashboard.routes.ts'
  if (
    pattern.startsWith('/v1/review/')
    || /\/k1-documents\/:k1DocumentId\/(review-session|corrections|map-entity|map-partnership|match|approve|finalize|issues)/u.test(pattern)
  ) return 'apps/api/src/modules/review/review.routes.ts'
  if (pattern.startsWith('/v1/k1')) return 'apps/api/src/modules/k1/k1.routes.ts'
  if (pattern.startsWith('/v1/partnership-tracker/')) return 'apps/api/src/modules/partnership-tracker/partnership-tracker.routes.ts'
  if (pattern.startsWith('/v1/entities')) {
    if (method === 'GET' && pattern === '/v1/entities/:id') {
      return 'apps/api/src/modules/partnerships/partnerships.routes.ts'
    }
    return 'apps/api/src/modules/partnerships/entities.admin.routes.ts'
  }
  if (pattern.startsWith('/v1/partnerships')) return 'apps/api/src/modules/partnerships/partnerships.routes.ts'
  if (pattern.startsWith('/v1/plaid/')) return 'apps/api/src/modules/plaid/plaid.routes.ts'
  if (pattern.startsWith('/v1/reports/')) return 'apps/api/src/modules/reports/reports.routes.ts'
  if (pattern.startsWith('/v1/tic-registry/')) return 'apps/api/src/modules/tic-registry/tic-registry.routes.ts'
  throw new Error(`UNCLASSIFIED_ROUTE_MODULE:${method} ${pattern}`)
}

const consumersFor = (pattern) => {
  if (pattern === '/health') return { web: '-', system: 'ROOT-HEALTH', decision: 'RETAIN' }
  if (pattern === '/v1/admin/plaid-refresh/run') return { web: '-', system: 'ROOT-PLAID-SCHEDULER', decision: 'RETAIN' }
  if (pattern === '/v1/admin/plaid-refresh-status' || pattern === '/v1/admin/production-readiness') {
    return { web: 'FLOW-LIQUIDITY', system: 'ROOT-PLAID-SCHEDULER', decision: 'RETAIN' }
  }
  if (pattern.startsWith('/v1/admin/protection-controls')) return { web: '-', system: 'ROOT-AUTH-SECURITY', decision: 'RETAIN' }
  if (pattern.startsWith('/v1/auth/')) return { web: 'FLOW-AUTH', system: 'ROOT-AUTH-SECURITY', decision: 'RETAIN' }
  if (pattern === '/v1/dashboard') return { web: 'FLOW-DASHBOARD', system: '-', decision: 'RETAIN' }
  if (pattern.startsWith('/v1/k1') || pattern.startsWith('/v1/review/')) {
    return { web: 'FLOW-K1', system: pattern.includes('ingestion') ? 'ROOT-K1-WORKER' : '-', decision: 'RETAIN' }
  }
  if (pattern.startsWith('/v1/partnership-tracker/')) return { web: 'FLOW-INVESTMENT, FLOW-ESTATE', system: '-', decision: 'RETAIN' }
  if (pattern.startsWith('/v1/entities')) return { web: 'FLOW-ENTITIES, FLOW-ESTATE, FLOW-INVESTMENT', system: '-', decision: 'RETAIN' }
  if (pattern.startsWith('/v1/partnerships')) return { web: 'FLOW-INVESTMENT, FLOW-ENTITIES, FLOW-ESTATE, FLOW-REPORTS', system: '-', decision: 'RETAIN' }
  if (pattern.startsWith('/v1/plaid/')) return { web: 'FLOW-LIQUIDITY', system: 'ROOT-PLAID-SCHEDULER', decision: 'RETAIN' }
  if (pattern.startsWith('/v1/reports/consolidated-holdings')) return { web: 'FLOW-LIQUIDITY, FLOW-DASHBOARD', system: 'ROOT-PLAID-SCHEDULER, ROOT-MARKET-SCHEDULER', decision: 'RETAIN' }
  if (pattern.startsWith('/v1/reports/')) return { web: 'FLOW-REPORTS', system: '-', decision: 'RETAIN' }
  if (pattern.startsWith('/v1/tic-registry/')) return { web: 'FLOW-TIC', system: '-', decision: 'RETAIN' }
  throw new Error(`UNCLASSIFIED_ROUTE_CONSUMER:${pattern}`)
}

const app = buildApp()
try {
  await app.ready()
  const routes = [...app.abuseProtectionRouteInventory].sort((left, right) =>
    `${left.routePattern} ${left.method}`.localeCompare(`${right.routePattern} ${right.method}`))

  const lines = [
    '<!-- BEGIN GENERATED API CONSUMER MATRIX -->',
    '',
    `The ${routes.length} external rows below are generated from Fastify registration after \`npm run build:api\`. All remaining registrations have a retained web or system consumer.`,
    '',
    '| Method | Canonical pattern | Registration module | Spec 027 policy (auth / class / owner / units) | Web consumer(s) | System consumer(s) | Decision | Contract break | Implementation closure / verification |',
    '|---|---|---|---|---|---|---|---|---|',
  ]

  for (const { method, routePattern, policy } of routes) {
    const consumers = consumersFor(routePattern)
    const module = moduleFor(method, routePattern)
    lines.push(`| ${method} | \`${routePattern}\` | \`${module}\` | ${policy.authentication} / ${policy.routeClass} / ${policy.owner} / ${policy.costUnits.join(', ')} | ${consumers.web} | ${consumers.system} | ${consumers.decision} | false | route module plus adjacent handler/service/repository closure; \`BASE-SEC-ROUTES\`, \`FINAL-API-MATRIX\` |`)
  }

  lines.push(
    '| GET | `/internal/readiness` | `apps/api/src/app.ts` | internal-only / not in external Spec 027 inventory | - | ROOT-READINESS | RETAIN | false | readiness status; `FINAL-HEALTH` |',
    '',
    `Matrix totals: ${routes.length} external registrations plus one internal readiness registration; ${routes.length + 1} retained rows and zero deferred rows.`,
    '',
    '<!-- END GENERATED API CONSUMER MATRIX -->',
  )
  process.stdout.write(`${lines.join('\n')}\n`)
} finally {
  await app.close()
}
