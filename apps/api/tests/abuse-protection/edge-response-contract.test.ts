import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
} from '../../src/modules/abuse-protection/protection.errors.js'

const edgeTerraform = readFileSync(fileURLToPath(new URL(
  '../../../../infra/aws/terraform/modules/edge/main.tf',
  import.meta.url,
)), 'utf8')

describe('CloudFront API/static response separation', () => {
  const rewriteCode = edgeTerraform.match(/resource "aws_cloudfront_function" "static_spa_rewrite"[\s\S]*?code\s*=\s*<<-EOT\r?\n([\s\S]*?)\r?\n\s*EOT/)?.[1]

  it.each(['/', '/investment-tracker', '/investment-tracker/', '/k1/document-1/review'])('serves the SPA shell for static deep link %s', uri => {
    expect(rewriteCode).toBeTruthy()
    const request = { uri, method: 'GET', querystring: { year: { value: '2025' } } }
    expect(runInNewContext(`${rewriteCode}; handler(event)`, { event: { request } })).toEqual({ ...request, uri: '/index.html' })
  })

  it.each(['/v1', '/v1/partnership-tracker/partnerships/p-1/years/2025', '/health', '/assets/index.js', '/assets/missing', '/favicon.svg'])('does not rewrite API or asset path %s', uri => {
    const request = { uri, method: 'GET' }
    expect(runInNewContext(`${rewriteCode}; handler(event)`, { event: { request } })).toEqual(request)
  })

  it('never applies distribution-wide SPA error substitution to API responses', () => {
    expect(edgeTerraform).not.toMatch(/custom_error_response\s*{/)
    expect(edgeTerraform).toMatch(/resource\s+"aws_cloudfront_function"\s+"static_spa_rewrite"/)
    const defaultBehavior = edgeTerraform.match(/default_cache_behavior\s*{[\s\S]*?\n\s*}/)?.[0] ?? ''
    expect(defaultBehavior).toContain('function_association')

    const apiBehaviorStart = edgeTerraform.indexOf('path_pattern             = "/v1/*"')
    const apiBehaviorEnd = edgeTerraform.indexOf('\n  }', apiBehaviorStart)
    const apiBehavior = edgeTerraform.slice(apiBehaviorStart, apiBehaviorEnd)
    expect(apiBehavior).toContain('origin_request_policy_id')
    expect(apiBehavior).not.toContain('function_association')
  })

  it('preserves bounded 429/503 status, retry, body, and no-store contracts at the edge', () => {
    const rate = buildRateLimitedResponse({
      code: 'RATE_LIMITED',
      requestId: 'request-edge-rate',
      retryAfterSeconds: 17,
    })
    const unavailable = buildProtectionUnavailableResponse({
      code: 'PROTECTION_UNAVAILABLE',
      requestId: 'request-edge-unavailable',
      retryAfterSeconds: 29,
    })
    expect(rate).toMatchObject({
      statusCode: 429,
      headers: { 'Retry-After': '17', 'Cache-Control': 'no-store' },
      body: { error: 'RATE_LIMITED', retryAfterSeconds: 17 },
    })
    expect(unavailable).toMatchObject({
      statusCode: 503,
      headers: { 'Retry-After': '29', 'Cache-Control': 'no-store' },
      body: { error: 'PROTECTION_UNAVAILABLE', retryAfterSeconds: 29 },
    })
  })
})
