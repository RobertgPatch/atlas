import process from 'node:process'

const HARD_CAPS = Object.freeze({
  requests: 500,
  durationSeconds: 30,
  concurrency: 10,
})

const SAFE_PATHS = new Set(['/health', '/v1/auth/session'])

const parseArguments = (argv) => Object.fromEntries(argv.map((argument) => {
  const match = /^--([a-z-]+)=(.*)$/.exec(argument)
  if (!match) throw new Error(`Expected --name=value argument, received ${argument}`)
  return [match[1], match[2]]
}))

const finiteInteger = (value, fallback, name, maximum) => {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}.`)
  }
  return parsed
}

export const buildBoundedAbuseSettings = (argv, environment = process.env) => {
  const args = parseArguments(argv)
  const environmentName = (args.environment ?? environment.ATLAS_ABUSE_TEST_ENVIRONMENT ?? 'local').toLowerCase()
  if (!['local', 'staging'].includes(environmentName)) {
    throw new Error('Bounded abuse tests run only against local or staging environments; production is refused.')
  }

  const baseUrl = new URL(args['base-url'] ?? environment.ATLAS_ABUSE_TEST_BASE_URL ?? 'http://127.0.0.1:3000')
  const productionHosts = new Set((environment.ATLAS_PRODUCTION_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean))
  if (productionHosts.has(baseUrl.hostname.toLowerCase()) || /(^|\.)prod(?:uction)?\./i.test(baseUrl.hostname)) {
    throw new Error(`Refusing production host ${baseUrl.hostname}.`)
  }
  if (environmentName === 'local' && !['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)) {
    throw new Error('The local abuse-test environment may target only a loopback host.')
  }

  const fakeProviders = (args['fake-providers'] ?? environment.ATLAS_ABUSE_TEST_FAKE_PROVIDERS ?? '').toLowerCase() === 'true'
  if (!fakeProviders) {
    throw new Error('Set --fake-providers=true; this runner never authorizes live paid providers.')
  }

  const path = args.path ?? '/v1/auth/session'
  if (!SAFE_PATHS.has(path)) {
    throw new Error(`Path ${path} is not in the zero-provider safe-path allowlist.`)
  }

  return {
    environmentName,
    target: new URL(path, baseUrl),
    requests: finiteInteger(args.requests, 100, 'requests', HARD_CAPS.requests),
    durationMs: finiteInteger(args['duration-seconds'], 15, 'durationSeconds', HARD_CAPS.durationSeconds) * 1_000,
    concurrency: finiteInteger(args.concurrency, 5, 'concurrency', HARD_CAPS.concurrency),
  }
}

export const runBoundedAbuseTest = async (settings, fetchImpl = fetch) => {
  const startedAt = Date.now()
  let nextRequest = 0
  const statuses = new Map()
  let transportErrors = 0

  const worker = async () => {
    while (nextRequest < settings.requests && Date.now() - startedAt < settings.durationMs) {
      nextRequest += 1
      const remainingMs = Math.max(1, settings.durationMs - (Date.now() - startedAt))
      try {
        const response = await fetchImpl(settings.target, {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(remainingMs),
          headers: { 'user-agent': 'atlas-bounded-abuse-test/1.0' },
        })
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1)
        await response.body?.cancel()
      } catch {
        transportErrors += 1
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(settings.concurrency, settings.requests) },
    () => worker(),
  ))

  return {
    environment: settings.environmentName,
    target: settings.target.toString(),
    configuredRequestCap: settings.requests,
    configuredDurationMs: settings.durationMs,
    configuredConcurrencyCap: settings.concurrency,
    attemptedRequests: nextRequest,
    elapsedMs: Date.now() - startedAt,
    statuses: Object.fromEntries([...statuses].sort(([left], [right]) => left - right)),
    transportErrors,
    paidProviderCallsAuthorized: 0,
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href
if (isMain) {
  try {
    const settings = buildBoundedAbuseSettings(process.argv.slice(2))
    const result = await runBoundedAbuseTest(settings)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result.transportErrors > 0) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
