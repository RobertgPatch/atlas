import { buildApp } from '../../apps/api/dist/app.js'

const AUTH_CONTRACT_SCHEMA_VERSION = '1.0.0'
const defaultAuthContractPath = new URL(
  '../../infra/aws/terraform/auth-route-scope.json',
  import.meta.url,
)

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const authContractFor = (routes) => {
  const authRoutes = routes
    .filter((route) => route.policy.routeClass === 'AUTH_ATTEMPT')
    .map((route) => ({ method: route.method, routePattern: route.routePattern }))
    .sort((left, right) =>
      `${left.method} ${left.routePattern}`.localeCompare(`${right.method} ${right.routePattern}`))

  if (authRoutes.length === 0) throw new Error('AUTH_WAF_CONTRACT_EMPTY')
  if (authRoutes.some((route) => route.method !== 'POST')) {
    throw new Error('AUTH_WAF_CONTRACT_REQUIRES_POST_ONLY_ROUTES')
  }

  const credentialRouteCandidates = routes.filter((route) =>
    route.routePattern.startsWith('/v1/auth/')
    && /(login|mfa|password|recovery|recover|reset|forgot|credential)/i.test(route.routePattern))
  const uncovered = credentialRouteCandidates.filter(
    (route) => route.policy.routeClass !== 'AUTH_ATTEMPT',
  )
  if (uncovered.length > 0) {
    throw new Error(`AUTH_WAF_CREDENTIAL_ROUTE_UNCLASSIFIED:${uncovered
      .map((route) => `${route.method} ${route.routePattern}`)
      .join(',')}`)
  }

  return {
    schemaVersion: AUTH_CONTRACT_SCHEMA_VERSION,
    method: 'POST',
    routes: authRoutes.map((route) => route.routePattern),
    regex: `^(?:${authRoutes.map((route) => escapeRegex(route.routePattern)).join('|')})$`,
  }
}

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`

const app = buildApp()
try {
  await app.ready()
  const routes = [...app.abuseProtectionRouteInventory].sort((left, right) =>
    `${left.routePattern} ${left.method}`.localeCompare(`${right.routePattern} ${right.method}`))
  const counts = Object.fromEntries([...new Set(routes.map((route) => route.policy.routeClass))]
    .sort()
    .map((routeClass) => [
      routeClass,
      routes.filter((route) => route.policy.routeClass === routeClass).length,
    ]))
  const authContract = authContractFor(routes)
  const authContractArgument = process.argv.indexOf('--write-auth-contract')
  if (authContractArgument >= 0) {
    const { writeFile } = await import('node:fs/promises')
    const configuredPath = process.argv[authContractArgument + 1]
    await writeFile(configuredPath ?? defaultAuthContractPath, stableJson(authContract), 'utf8')
  }
  const checkContractArgument = process.argv.indexOf('--check-auth-contract')
  if (checkContractArgument >= 0) {
    const { readFile } = await import('node:fs/promises')
    const configuredPath = process.argv[checkContractArgument + 1]
    const actual = await readFile(configuredPath ?? defaultAuthContractPath, 'utf8')
    if (actual.replace(/\r\n/g, '\n') !== stableJson(authContract)) {
      throw new Error('AUTH_WAF_CONTRACT_STALE')
    }
  }
  const lines = [
    '# Route protection inventory',
    '',
    `Generated from Fastify registration on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    `- Declared external routes: **${routes.length}**`,
    `- Unique canonical route keys: **${new Set(routes.map((route) => `${route.method} ${route.routePattern}`)).size}**`,
    `- Routes missing a protection policy: **${routes.filter((route) => !route.policy).length}**`,
    '',
    '## Class totals',
    '',
    '| Route class | Routes |',
    '|---|---:|',
    ...Object.entries(counts).map(([routeClass, count]) => `| ${routeClass} | ${count} |`),
    '',
    '## Authentication WAF contract',
    '',
    `- Method: \`${authContract.method}\``,
    `- Routes: ${authContract.routes.map((route) => `\`${route}\``).join(', ')}`,
    `- Exact regex: \`${authContract.regex}\``,
    '',
    '## Reviewed mappings',
    '',
    '| Method | Canonical route | Owner | Authentication | Class | Cost units |',
    '|---|---|---|---|---|---|',
    ...routes.map(({ method, routePattern, policy }) =>
      `| ${method} | \`${routePattern}\` | ${policy.owner} | ${policy.authentication} | ${policy.routeClass} | ${policy.costUnits.join(', ')} |`),
    '',
    `Fastify auto-HEAD siblings are intentionally represented by their declared GET route. This generated inventory contains ${routes.length} declared routes and does not use a hand-maintained route total.`,
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
} finally {
  await app.close()
}
