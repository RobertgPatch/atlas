const baseUrl = process.argv[2]
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl ?? '')) {
  console.error('Production-shape smoke requires a loopback HTTP base URL.')
  process.exit(2)
}

const login = await fetch(`${baseUrl}/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'shape-admin@example.invalid',
    password: 'shape-local-password',
  }),
})
if (!login.ok) throw new Error(`Production-shape login failed with HTTP ${login.status}.`)
const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
if (!cookie?.startsWith('atlas_session=')) {
  throw new Error('Production-shape login returned no bounded session cookie.')
}

const routes = [
  '/v1/dashboard',
  '/v1/reports/consolidated-holdings',
  '/v1/reports/consolidated-holdings/performance',
  '/v1/partnership-tracker/partnerships',
  '/v1/partnership-tracker/aggregation',
  '/v1/tic-registry/properties',
  '/v1/entities',
]
for (const route of routes) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { cookie } })
  if (!response.ok) {
    throw new Error(`Production-shape retained read failed: ${route} (HTTP ${response.status}).`)
  }
}

console.log(`PASS production-shape retained reads (${routes.length}).`)
