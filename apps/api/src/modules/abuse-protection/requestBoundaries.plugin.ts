import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { config } from '../../config.js'
import type { PayloadLimits, RouteClass } from './protection.types.js'

const requestTimers = new WeakMap<FastifyRequest, ReturnType<typeof setTimeout>>()

const jsonDepth = (value: unknown, seen = new WeakSet<object>()): number => {
  if (value === null || typeof value !== 'object') return 0
  if (seen.has(value)) return 0
  seen.add(value)
  const values = Array.isArray(value) ? value : Object.values(value)
  return 1 + values.reduce((maximum, child) => Math.max(maximum, jsonDepth(child, seen)), 0)
}

const jsonPropertyCount = (value: unknown, seen = new WeakSet<object>()): number => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0
  seen.add(value)
  if (Array.isArray(value)) {
    return value.reduce((count, child) => count + jsonPropertyCount(child, seen), 0)
  }
  const values = Object.values(value)
  return values.length + values.reduce(
    (count, child) => count + jsonPropertyCount(child, seen),
    0,
  )
}

const sendBoundaryError = async (
  reply: FastifyReply,
  statusCode: 400 | 413,
  error: string,
): Promise<void> => {
  await reply.status(statusCode).send({ error })
}

const finitePositiveQueryInteger = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

const validateQuery = async (
  request: FastifyRequest,
  reply: FastifyReply,
  limits: PayloadLimits,
): Promise<boolean> => {
  const query = request.query && typeof request.query === 'object'
    ? request.query as Record<string, unknown>
    : {}
  if (
    limits.queryParameters !== undefined
    && Object.keys(query).length > limits.queryParameters
  ) {
    await sendBoundaryError(reply, 400, 'QUERY_LIMIT_EXCEEDED')
    return false
  }

  if (limits.pageSize !== undefined && query.pageSize !== undefined) {
    const pageSize = finitePositiveQueryInteger(query.pageSize)
    if (pageSize === null || pageSize > limits.pageSize) {
      await sendBoundaryError(reply, 400, 'PAGE_SIZE_LIMIT_EXCEEDED')
      return false
    }
  }

  if (
    limits.maxDateRangeDays !== undefined
    && typeof query.from === 'string'
    && typeof query.to === 'string'
  ) {
    const from = Date.parse(query.from)
    const to = Date.parse(query.to)
    const rangeDays = (to - from) / 86_400_000
    if (!Number.isFinite(from) || !Number.isFinite(to) || rangeDays < 0 || rangeDays > limits.maxDateRangeDays) {
      await sendBoundaryError(reply, 400, 'DATE_RANGE_LIMIT_EXCEEDED')
      return false
    }
  }
  return true
}

const validateJson = async (
  request: FastifyRequest,
  reply: FastifyReply,
  limits: PayloadLimits,
): Promise<boolean> => {
  if (request.body === undefined) return true
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim()
  if (contentType !== 'application/json') return true
  const serialized = JSON.stringify(request.body)
  if (
    limits.bodyBytes !== undefined
    && Buffer.byteLength(serialized, 'utf8') > limits.bodyBytes
  ) {
    await sendBoundaryError(reply, 413, 'PAYLOAD_TOO_LARGE')
    return false
  }
  if (limits.maxJsonDepth !== undefined && jsonDepth(request.body) > limits.maxJsonDepth) {
    await sendBoundaryError(reply, 400, 'JSON_DEPTH_LIMIT_EXCEEDED')
    return false
  }
  if (
    limits.maxProperties !== undefined
    && jsonPropertyCount(request.body) > limits.maxProperties
  ) {
    await sendBoundaryError(reply, 400, 'JSON_PROPERTY_LIMIT_EXCEEDED')
    return false
  }
  return true
}

const wrapMultipartLimits = (request: FastifyRequest, limits: PayloadLimits): void => {
  if (!request.isMultipart()) return
  const originalParts = request.parts.bind(request)
  request.parts = ((options: Parameters<typeof request.parts>[0] = {}) => originalParts({
    ...options,
    limits: {
      ...options.limits,
      ...(limits.fileBytes === undefined ? {} : { fileSize: limits.fileBytes }),
      ...(limits.files === undefined ? {} : { files: limits.files }),
      ...(limits.multipartFields === undefined ? {} : { fields: limits.multipartFields }),
      ...(limits.multipartParts === undefined ? {} : { parts: limits.multipartParts }),
    },
  })) as typeof request.parts
}

const timeoutFor = (routeClass: RouteClass): number => {
  const timeouts = config.abuseProtection.timeouts
  if (routeClass === 'DATABASE_HEAVY_READ') return timeouts.databaseHeavyHandlerMs
  if (routeClass === 'DOCUMENT_DOWNLOAD') return timeouts.documentDownloadMs
  if (routeClass === 'WORKBOOK_IMPORT') return timeouts.workbookImportMs
  if (routeClass === 'EXPORT_DOWNLOAD') return timeouts.exportMs
  return timeouts.requestMs
}

const clearTimer = (request: FastifyRequest): void => {
  const timer = requestTimers.get(request)
  if (timer) clearTimeout(timer)
  requestTimers.delete(request)
}

export const registerRequestBoundaries = (app: FastifyInstance): void => {
  app.addHook('onRequest', async (request, reply) => {
    const policy = request.routeOptions.config?.abuseProtection
    if (!policy) return
    const timeoutMs = timeoutFor(policy.routeClass)
    const timer = setTimeout(() => {
      if (!reply.sent) {
        void reply.status(503).send({
          error: 'REQUEST_TIMEOUT',
          requestId: request.id,
        })
      }
    }, timeoutMs)
    timer.unref?.()
    requestTimers.set(request, timer)
  })

  app.addHook('preValidation', async (request, reply) => {
    const limits = request.routeOptions.config?.abuseProtection?.payloadLimits
    if (!limits) return
    if (!await validateJson(request, reply, limits)) return reply
    if (!await validateQuery(request, reply, limits)) return reply
    wrapMultipartLimits(request, limits)
  })

  app.addHook('onResponse', async (request) => clearTimer(request))
  app.addHook('onError', async (request) => clearTimer(request))
}
