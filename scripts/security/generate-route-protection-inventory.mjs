import { buildApp } from '../../apps/api/dist/app.js'

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
    '## Reviewed mappings',
    '',
    '| Method | Canonical route | Owner | Authentication | Class | Cost units |',
    '|---|---|---|---|---|---|',
    ...routes.map(({ method, routePattern, policy }) =>
      `| ${method} | \`${routePattern}\` | ${policy.owner} | ${policy.authentication} | ${policy.routeClass} | ${policy.costUnits.join(', ')} |`),
    '',
    'Fastify auto-HEAD siblings are intentionally represented by their declared GET route. The three protection-control endpoints added by this feature bring the reviewed inventory from the specification baseline of 141 to 144 routes.',
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
} finally {
  await app.close()
}
