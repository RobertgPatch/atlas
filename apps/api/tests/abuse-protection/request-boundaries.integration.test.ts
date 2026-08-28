import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { config } from '../../src/config.js'
import { defineRouteProtectionPolicy } from '../../src/modules/abuse-protection/routePolicy.registry.js'
import type {
  PayloadLimits,
  RouteClass,
  RouteProtectionPolicy,
} from '../../src/modules/abuse-protection/protection.types.js'
import { buildMultipart } from '../helpers/multipart.js'

const policy = (
  policyKey: string,
  method: 'GET' | 'POST',
  routePattern: string,
  routeClass: RouteClass,
  payloadLimits: PayloadLimits,
): RouteProtectionPolicy => defineRouteProtectionPolicy({
  policyKey,
  method,
  routePattern,
  routeClass,
  authentication: 'public',
  scopeDimensions: ['source_prefix'],
  localRate: null,
  durableRates: [],
  payloadLimits,
  concurrencyLimit: null,
  backlogLimit: null,
  idempotency: 'none',
  killSwitch: null,
  failureMode: 'fail_closed',
  costUnits: ['request'],
  costDrivers: ['test-only boundary probe'],
  owner: 'security',
})

const jsonPolicy = policy(
  'test.boundary.json',
  'POST',
  '/v1/__test/boundary/json',
  'BUSINESS_WRITE',
  { bodyBytes: 64, maxJsonDepth: 2, maxProperties: 3 },
)
const multipartFieldsPolicy = policy(
  'test.boundary.multipart-fields',
  'POST',
  '/v1/__test/boundary/multipart-fields',
  'BUSINESS_WRITE',
  { fileBytes: 32, files: 1, multipartFields: 1, multipartParts: 10 },
)
const multipartPartsPolicy = policy(
  'test.boundary.multipart-parts',
  'POST',
  '/v1/__test/boundary/multipart-parts',
  'BUSINESS_WRITE',
  { fileBytes: 32, files: 2, multipartFields: 5, multipartParts: 2 },
)
const queryPolicy = policy(
  'test.boundary.query',
  'GET',
  '/v1/__test/boundary/query',
  'DATABASE_HEAVY_READ',
  { queryParameters: 3, pageSize: 2, maxDateRangeDays: 7 },
)
const timeoutPolicy = policy(
  'test.boundary.timeout',
  'GET',
  '/v1/__test/boundary/timeout',
  'DATABASE_HEAVY_READ',
  {},
)

const businessCalls = {
  json: vi.fn(),
  multipart: vi.fn(),
  query: vi.fn(),
  timeout: vi.fn(),
}

const consumeMultipart = async (request: FastifyRequest): Promise<void> => {
  for await (const part of request.parts()) {
    if (part.type === 'file') await part.toBuffer()
  }
}

const registerBoundaryRoutes = (app: FastifyInstance): void => {
  app.post(
    jsonPolicy.routePattern,
    { config: { abuseProtection: jsonPolicy } },
    async (_request, reply) => {
      businessCalls.json()
      await reply.status(204).send()
    },
  )

  const multipartHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    await consumeMultipart(request)
    businessCalls.multipart()
    await reply.status(204).send()
  }
  app.post(
    multipartFieldsPolicy.routePattern,
    { config: { abuseProtection: multipartFieldsPolicy } },
    multipartHandler,
  )
  app.post(
    multipartPartsPolicy.routePattern,
    { config: { abuseProtection: multipartPartsPolicy } },
    multipartHandler,
  )

  app.get(
    queryPolicy.routePattern,
    { config: { abuseProtection: queryPolicy } },
    async (_request, reply) => {
      businessCalls.query()
      await reply.status(204).send()
    },
  )

  app.get(
    timeoutPolicy.routePattern,
    { config: { abuseProtection: timeoutPolicy } },
    async (_request, reply) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 75))
      // A request timeout must mark/send the reply before downstream work can begin.
      if (!reply.sent) businessCalls.timeout()
      if (!reply.sent) await reply.status(204).send()
    },
  )
}

const multipartRequest = (
  app: FastifyInstance,
  url: string,
  fields: Array<{ name: string; value: string }>,
  files: Array<{ name: string; filename: string; contentType: string; data: Buffer }>,
) => {
  const multipart = buildMultipart(fields, files)
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': multipart.contentType },
    payload: multipart.body,
  })
}

describe('request resource boundaries', () => {
  let app: FastifyInstance
  const originalHeavyHandlerTimeoutMs = config.abuseProtection.timeouts.databaseHeavyHandlerMs

  beforeEach(async () => {
    Object.assign(config.abuseProtection.timeouts, { databaseHeavyHandlerMs: 20 })
    for (const spy of Object.values(businessCalls)) spy.mockReset()
    app = buildApp()
    registerBoundaryRoutes(app)
    await app.ready()
  })

  afterEach(async () => {
    Object.assign(config.abuseProtection.timeouts, {
      databaseHeavyHandlerMs: originalHeavyHandlerTimeoutMs,
    })
    await app.close()
  })

  it('rejects malformed JSON before the handler', async () => {
    const response = await app.inject({
      method: 'POST',
      url: jsonPolicy.routePattern,
      headers: { 'content-type': 'application/json' },
      payload: '{"broken":',
    })

    expect(response.statusCode).toBe(400)
    expect(businessCalls.json).not.toHaveBeenCalled()
  })

  it('rejects a policy-oversized JSON body before the handler', async () => {
    const response = await app.inject({
      method: 'POST',
      url: jsonPolicy.routePattern,
      payload: { value: 'x'.repeat(128) },
    })

    expect(response.statusCode).toBe(413)
    expect(businessCalls.json).not.toHaveBeenCalled()
  })

  it('rejects JSON depth and property amplification before the handler', async () => {
    const tooDeep = await app.inject({
      method: 'POST',
      url: jsonPolicy.routePattern,
      payload: { first: { second: { third: true } } },
    })
    const tooManyProperties = await app.inject({
      method: 'POST',
      url: jsonPolicy.routePattern,
      payload: { first: 1, second: 2, third: 3, fourth: 4 },
    })

    expect(tooDeep.statusCode).toBe(400)
    expect(tooManyProperties.statusCode).toBe(400)
    expect(businessCalls.json).not.toHaveBeenCalled()
  })

  it('rejects an oversized multipart file before the handler business call', async () => {
    const response = await multipartRequest(
      app,
      multipartFieldsPolicy.routePattern,
      [],
      [{
        name: 'file',
        filename: 'too-large.pdf',
        contentType: 'application/pdf',
        data: Buffer.alloc(33),
      }],
    )

    expect(response.statusCode).toBe(413)
    expect(businessCalls.multipart).not.toHaveBeenCalled()
  })

  it('rejects multipart file, field, and total-part cardinality before business calls', async () => {
    const tooManyFiles = await multipartRequest(
      app,
      multipartPartsPolicy.routePattern,
      [],
      [
        { name: 'first', filename: 'first.pdf', contentType: 'application/pdf', data: Buffer.from('a') },
        { name: 'second', filename: 'second.pdf', contentType: 'application/pdf', data: Buffer.from('b') },
        { name: 'third', filename: 'third.pdf', contentType: 'application/pdf', data: Buffer.from('c') },
      ],
    )
    const tooManyFields = await multipartRequest(
      app,
      multipartFieldsPolicy.routePattern,
      [
        { name: 'first', value: 'a' },
        { name: 'second', value: 'b' },
      ],
      [],
    )
    const tooManyParts = await multipartRequest(
      app,
      multipartPartsPolicy.routePattern,
      [
        { name: 'first', value: 'a' },
        { name: 'second', value: 'b' },
      ],
      [{ name: 'file', filename: 'one.pdf', contentType: 'application/pdf', data: Buffer.from('c') }],
    )

    expect(tooManyFiles.statusCode).toBe(413)
    expect(tooManyFields.statusCode).toBe(413)
    expect(tooManyParts.statusCode).toBe(413)
    expect(businessCalls.multipart).not.toHaveBeenCalled()
  })

  it('rejects excessive query parameters and page size before the handler', async () => {
    const tooManyParameters = await app.inject({
      method: 'GET',
      url: `${queryPolicy.routePattern}?a=1&b=2&c=3&d=4`,
    })
    const oversizedPage = await app.inject({
      method: 'GET',
      url: `${queryPolicy.routePattern}?pageSize=3`,
    })

    expect(tooManyParameters.statusCode).toBe(400)
    expect(oversizedPage.statusCode).toBe(400)
    expect(businessCalls.query).not.toHaveBeenCalled()
  })

  it('rejects an excessive date range before the handler', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${queryPolicy.routePattern}?from=2026-01-01&to=2026-01-09`,
    })

    expect(response.statusCode).toBe(400)
    expect(businessCalls.query).not.toHaveBeenCalled()
  })

  it('times out a slow handler before its business call', async () => {
    const response = await app.inject({
      method: 'GET',
      url: timeoutPolicy.routePattern,
    })

    expect([408, 503, 504]).toContain(response.statusCode)
    await new Promise<void>((resolve) => setTimeout(resolve, 90))
    expect(businessCalls.timeout).not.toHaveBeenCalled()
  })
})
