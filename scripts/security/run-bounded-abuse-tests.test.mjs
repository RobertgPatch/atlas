import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBoundedAbuseSettings,
  runBoundedAbuseTest,
} from './run-bounded-abuse-tests.mjs'

test('refuses every remote environment and non-loopback host', () => {
  assert.throws(
    () => buildBoundedAbuseSettings(['--environment=production', '--fake-providers=true']),
    /only in the local environment/,
  )
  assert.throws(
    () => buildBoundedAbuseSettings([
      '--environment=staging',
      '--fake-providers=true',
    ]),
    /only in the local environment/,
  )
  assert.throws(
    () => buildBoundedAbuseSettings([
      '--environment=local',
      '--base-url=https://api.example.com',
      '--fake-providers=true',
    ]),
    /only a loopback host/,
  )
})

test('enforces hard request, duration, and concurrency caps', () => {
  for (const argument of ['--requests=501', '--duration-seconds=31', '--concurrency=11']) {
    assert.throws(
      () => buildBoundedAbuseSettings(['--fake-providers=true', argument]),
      /must be an integer/,
    )
  }
})

test('requires fake providers and a zero-provider path', () => {
  assert.throws(() => buildBoundedAbuseSettings([]), /fake-providers=true/)
  assert.throws(
    () => buildBoundedAbuseSettings(['--fake-providers=true', '--path=/v1/plaid/link-token']),
    /zero-provider safe-path allowlist/,
  )
})

test('never exceeds the configured request or concurrency cap', async () => {
  const settings = buildBoundedAbuseSettings([
    '--fake-providers=true',
    '--requests=20',
    '--duration-seconds=2',
    '--concurrency=3',
    '--path=/health',
  ])
  let active = 0
  let maximumActive = 0
  const result = await runBoundedAbuseTest(settings, async () => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    return new Response('{}', { status: 200 })
  })

  assert.equal(result.attemptedRequests, 20)
  assert.ok(maximumActive <= 3)
  assert.equal(result.paidProviderCallsAuthorized, 0)
})
