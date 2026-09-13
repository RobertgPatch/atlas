import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'

describe('unhandled error redaction', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
  })

  it('does not return internal exception details to the client', async () => {
    app = buildApp()
    app.get('/__security-audit/error', async () => {
      throw new Error('database-url-with-secret-password')
    })

    const response = await app.inject({
      method: 'GET',
      url: '/__security-audit/error',
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      requestId: expect.any(String),
    })
    expect(response.body).not.toContain('database-url-with-secret-password')
  })
})
