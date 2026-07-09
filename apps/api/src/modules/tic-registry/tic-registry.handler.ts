import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError, type ZodType } from 'zod'
import { ticRegistryRepository } from './tic-registry.repository.js'
import { TicRegistryError } from './tic-registry.types.js'
import {
  createTicInterestBodySchema,
  createTicOwnerBodySchema,
  createTicPropertyBodySchema,
  expectedUpdatedAtQuerySchema,
  ticInterestParamsSchema,
  ticOwnerParamsSchema,
  ticPropertyParamsSchema,
  ticRegistryListQuerySchema,
  updateTicInterestBodySchema,
  updateTicOwnerBodySchema,
  updateTicPropertyBodySchema,
} from './tic-registry.zod.js'

const parseOrReply = <T>(
  schema: ZodType<T>,
  value: unknown,
  reply: FastifyReply,
): T | null => {
  try {
    return schema.parse(value)
  } catch (error) {
    if (error instanceof ZodError) {
      void reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })
      return null
    }
    throw error
  }
}

const requireAdmin = (request: FastifyRequest, reply: FastifyReply): boolean => {
  if (request.authUser?.role !== 'Admin') {
    void reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
    return false
  }
  return true
}

const sendRepositoryError = (reply: FastifyReply, error: unknown): boolean => {
  if (!(error instanceof TicRegistryError)) return false

  switch (error.code) {
    case 'DATABASE_REQUIRED':
      void reply.status(503).send({ error: 'DATABASE_REQUIRED' })
      return true
    case 'TIC_PROPERTY_NOT_FOUND':
      void reply.status(404).send({ error: 'TIC_PROPERTY_NOT_FOUND' })
      return true
    case 'TIC_INTEREST_NOT_FOUND':
      void reply.status(404).send({ error: 'TIC_INTEREST_NOT_FOUND' })
      return true
    case 'TIC_OWNER_NOT_FOUND':
      void reply.status(404).send({ error: 'TIC_OWNER_NOT_FOUND' })
      return true
    case 'TIC_SOURCE_NOT_FOUND':
      void reply.status(404).send({ error: 'TIC_SOURCE_NOT_FOUND' })
      return true
    case 'INVALID_EXCHANGE_SOURCE':
      void reply.status(400).send({ error: 'INVALID_EXCHANGE_SOURCE' })
      return true
    case 'STALE_TIC_UPDATE':
      void reply.status(409).send({ error: 'STALE_TIC_UPDATE' })
      return true
  }
}

const run = async (
  reply: FastifyReply,
  fn: () => Promise<void>,
): Promise<void> => {
  try {
    await fn()
  } catch (error) {
    if (sendRepositoryError(reply, error)) return
    throw error
  }
}

export const listTicPropertiesHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const query = parseOrReply(ticRegistryListQuerySchema, request.query, reply)
  if (!query) return

  await run(reply, async () => {
    const response = await ticRegistryRepository.listProperties(
      request.partnershipScope!,
      query,
    )
    return reply.send(response)
  })
}

export const getTicPropertyHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const params = parseOrReply(ticPropertyParamsSchema, request.params, reply)
  if (!params) return

  await run(reply, async () => {
    const property = await ticRegistryRepository.getProperty(
      params.propertyId,
      request.partnershipScope!,
    )
    if (!property) return reply.status(404).send({ error: 'TIC_PROPERTY_NOT_FOUND' })
    return reply.send(property)
  })
}

export const createTicPropertyHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const body = parseOrReply(createTicPropertyBodySchema, request.body, reply)
  if (!body) return

  await run(reply, async () => {
    const property = await ticRegistryRepository.createProperty(
      body,
      request.authUser!.userId,
      request.partnershipScope!,
    )
    return reply.status(201).send(property)
  })
}

export const updateTicPropertyHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const params = parseOrReply(ticPropertyParamsSchema, request.params, reply)
  const body = parseOrReply(updateTicPropertyBodySchema, request.body, reply)
  if (!params || !body) return

  await run(reply, async () => {
    const property = await ticRegistryRepository.updateProperty(
      params.propertyId,
      body,
      request.authUser!.userId,
      request.partnershipScope!,
    )
    return reply.send(property)
  })
}

export const deleteTicPropertyHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const params = parseOrReply(ticPropertyParamsSchema, request.params, reply)
  const query = parseOrReply(expectedUpdatedAtQuerySchema, request.query, reply)
  if (!params || !query) return

  await run(reply, async () => {
    await ticRegistryRepository.deleteProperty(
      params.propertyId,
      query.expectedUpdatedAt,
      request.partnershipScope!,
    )
    return reply.status(204).send()
  })
}

export const createTicInterestHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const params = parseOrReply(ticPropertyParamsSchema, request.params, reply)
  const body = parseOrReply(createTicInterestBodySchema, request.body, reply)
  if (!params || !body) return

  await run(reply, async () => {
    const interest = await ticRegistryRepository.createInterest(
      params.propertyId,
      body,
      request.authUser!.userId,
      request.partnershipScope!,
    )
    return reply.status(201).send(interest)
  })
}

export const updateTicInterestHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const params = parseOrReply(ticInterestParamsSchema, request.params, reply)
  const body = parseOrReply(updateTicInterestBodySchema, request.body, reply)
  if (!params || !body) return

  await run(reply, async () => {
    const interest = await ticRegistryRepository.updateInterest(
      params.interestId,
      body,
      request.authUser!.userId,
      request.partnershipScope!,
    )
    return reply.send(interest)
  })
}

export const deleteTicInterestHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const params = parseOrReply(ticInterestParamsSchema, request.params, reply)
  const query = parseOrReply(expectedUpdatedAtQuerySchema, request.query, reply)
  if (!params || !query) return

  await run(reply, async () => {
    await ticRegistryRepository.deleteInterest(
      params.interestId,
      query.expectedUpdatedAt,
      request.partnershipScope!,
    )
    return reply.status(204).send()
  })
}

export const createTicOwnerHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const params = parseOrReply(ticInterestParamsSchema, request.params, reply)
  const body = parseOrReply(createTicOwnerBodySchema, request.body, reply)
  if (!params || !body) return

  await run(reply, async () => {
    const owner = await ticRegistryRepository.createOwner(
      params.interestId,
      body,
      request.authUser!.userId,
      request.partnershipScope!,
    )
    return reply.status(201).send(owner)
  })
}

export const updateTicOwnerHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const params = parseOrReply(ticOwnerParamsSchema, request.params, reply)
  const body = parseOrReply(updateTicOwnerBodySchema, request.body, reply)
  if (!params || !body) return

  await run(reply, async () => {
    const owner = await ticRegistryRepository.updateOwner(
      params.ownerId,
      body,
      request.authUser!.userId,
      request.partnershipScope!,
    )
    return reply.send(owner)
  })
}

export const deleteTicOwnerHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!requireAdmin(request, reply)) return
  const params = parseOrReply(ticOwnerParamsSchema, request.params, reply)
  const query = parseOrReply(expectedUpdatedAtQuerySchema, request.query, reply)
  if (!params || !query) return

  await run(reply, async () => {
    await ticRegistryRepository.deleteOwner(
      params.ownerId,
      query.expectedUpdatedAt,
      request.partnershipScope!,
    )
    return reply.status(204).send()
  })
}
