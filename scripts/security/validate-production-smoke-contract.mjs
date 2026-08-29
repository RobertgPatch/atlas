import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const extractRoutes = (source, constant) => {
  const match = new RegExp(`${constant}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(source)
  if (!match) return []
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((entry) => entry[1])
}

const coreSmokeNames = [
  'edge-home', 'auth-login', 'dashboard-read', 'liquidity-holdings-read',
  'liquidity-performance-read', 'investment-aggregation-read',
  'tic-properties-read', 'entities-list-read', 'entity-detail-read', 'auth-logout',
]

export function validateProductionSmokeContract(routeSource, contract) {
  const findings = []
  const routes = [
    ...extractRoutes(routeSource, 'PUBLIC_ROUTE_PATTERNS'),
    ...extractRoutes(routeSource, 'CURRENT_PROTECTED_ROUTE_PATTERNS'),
  ]
  const decisions = Array.isArray(contract?.routeDecisions) ? contract.routeDecisions : []
  const decisionRoutes = decisions.map((entry) => entry.route)
  for (const route of routes) {
    if (decisionRoutes.filter((candidate) => candidate === route).length !== 1) findings.push({ rule: 'missing-route-decision', token: route })
  }
  for (const route of [...new Set(decisionRoutes)].sort()) {
    if (!routes.includes(route)) findings.push({ rule: 'stale-route-decision', token: route })
  }

  const requests = Array.isArray(contract?.requests) ? contract.requests : []
  for (const request of requests) {
    const permittedSessionMutation = request.sessionOnlyMutation === true && request.method === 'POST' && ['/v1/auth/login', '/v1/auth/logout'].includes(request.path)
    if (request.method !== 'GET' && !permittedSessionMutation) findings.push({ rule: 'prohibited-smoke-method', token: `${request.method} ${request.path}` })
    if (/(?:pricingMode=refresh|\/refresh(?:[/?]|$)|plaid\/link-token|k1.*(?:ingest|upload))/i.test(request.path)) findings.push({ rule: 'prohibited-provider-path', token: request.path })
  }
  const requestNames = requests.map((request) => request.name)
  for (const name of coreSmokeNames) {
    if (!requestNames.includes(name)) findings.push({ rule: 'missing-retained-smoke', token: name })
  }
  const allowedDecisions = new Set([...requestNames, 'current-surface-contract'])
  for (const decision of decisions) {
    if (!allowedDecisions.has(decision.decision)) findings.push({ rule: 'unknown-route-decision', token: decision.decision })
  }
  return { valid: findings.length === 0, findings, routes, requestNames }
}

function main() {
  const repoRoot = process.cwd()
  const source = fs.readFileSync(path.join(repoRoot, 'apps/web/src/routeContract.ts'), 'utf8')
  const contract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/deployment/production-smoke-contract.json'), 'utf8'))
  const result = validateProductionSmokeContract(source, contract)
  if (!result.valid) {
    for (const item of result.findings) process.stderr.write(`[${item.rule}] ${item.token}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`PASS production smoke contract covers ${result.routes.length} browser routes and ${result.requestNames.length} named checks.\n`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
