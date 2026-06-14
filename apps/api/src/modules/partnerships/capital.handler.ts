import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { pool, withTransaction } from '../../infra/db/client.js'
import { partnershipsRepository } from './partnerships.repository.js'
import { capitalRepository } from './capital.repository.js'
import {
  capitalActivityEventParamsSchema,
  capitalActivityParamsSchema,
  createCapitalActivityBodySchema,
  createCommitmentBodySchema,
  partnershipCommitmentParamsSchema,
  partnershipCommitmentsParamsSchema,
  updateCapitalActivityBodySchema,
  updateCommitmentBodySchema,
} from './capital.zod.js'

async function resolveScopedPartnership(
  request: FastifyRequest,
  partnershipId: string,
): Promise<{ status: 'ok'; entityId: string } | { status: 'not-found' } | { status: 'forbidden' }> {
  const partnership = await partnershipsRepository.getPartnershipById(partnershipId, {
    isAdmin: true,
    entityIds: [],
  })
  if (!partnership) return { status: 'not-found' }

  const scope = request.partnershipScope!
  if (!scope.isAdmin && !scope.entityIds.includes(partnership.entity.id)) {
    return { status: 'forbidden' }
  }

  return { status: 'ok', entityId: partnership.entity.id }
}

function sendZodError(reply: FastifyReply, error: ZodError): void {
  void reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })
}

function sendCapitalValidationError(reply: FastifyReply, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'INVALID_COMMITMENT_DATE_RANGE') {
    void reply.status(400).send({
      error: 'INVALID_COMMITMENT_DATE_RANGE',
      message: 'commitmentStartDate cannot be after commitmentEndDate',
    })
    return
  }
  if (message === 'INVALID_CAPITAL_ACTIVITY_AMOUNT') {
    void reply.status(400).send({
      error: 'INVALID_CAPITAL_ACTIVITY_AMOUNT',
      message: 'Invalid amount for event type',
    })
    return
  }
  if (message === 'STALE_COMMITMENT_UPDATE') {
    void reply.status(409).send({
      error: 'STALE_COMMITMENT_UPDATE',
      message: 'The commitment changed since this report was loaded. Refresh and try again.',
    })
    return
  }
  throw error
}

export const listCommitmentsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  let params: { partnershipId: string }
  try {
    params = partnershipCommitmentsParamsSchema.parse(request.params)
  } catch (error) {
    if (error instanceof ZodError) return sendZodError(reply, error)
    throw error
  }

  const scoped = await resolveScopedPartnership(request, params.partnershipId)
  if (scoped.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scoped.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  const rows = await capitalRepository.listCommitments(params.partnershipId)
  return reply.send(rows)
}

export const createCommitmentHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (request.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }

  let params: { partnershipId: string }
  let body: ReturnType<typeof createCommitmentBodySchema.parse>
  try {
    params = partnershipCommitmentsParamsSchema.parse(request.params)
    body = createCommitmentBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) return sendZodError(reply, error)
    throw error
  }

  const scoped = await resolveScopedPartnership(request, params.partnershipId)
  if (scoped.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scoped.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  try {
    const created = pool
      ? await withTransaction((client) =>
          capitalRepository.createCommitment(
            params.partnershipId,
            scoped.entityId,
            body,
            request.authUser!.userId,
            client,
          ),
        )
      : await capitalRepository.createCommitment(
          params.partnershipId,
          scoped.entityId,
          body,
          request.authUser!.userId,
          null,
        )

    return reply.status(201).send(created)
  } catch (error) {
    console.error('[ERROR] createCommitmentHandler', {
      partnershipId: params.partnershipId,
      entityId: scoped.entityId,
      userId: request.authUser?.userId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    })
    sendCapitalValidationError(reply, error)
  }
}

export const updateCommitmentHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (request.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }

  let params: { partnershipId: string; commitmentId: string }
  let body: ReturnType<typeof updateCommitmentBodySchema.parse>
  try {
    params = partnershipCommitmentParamsSchema.parse(request.params)
    body = updateCommitmentBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) return sendZodError(reply, error)
    throw error
  }

  const scoped = await resolveScopedPartnership(request, params.partnershipId)
  if (scoped.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scoped.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  try {
    const updated = pool
      ? await withTransaction((client) =>
          capitalRepository.updateCommitment(
            params.partnershipId,
            params.commitmentId,
            body,
            request.authUser!.userId,
            scoped.entityId,
            client,
          ),
        )
      : await capitalRepository.updateCommitment(
          params.partnershipId,
          params.commitmentId,
          body,
          request.authUser!.userId,
          scoped.entityId,
          null,
        )

    if (!updated) {
      return reply.status(404).send({ error: 'PARTNERSHIP_COMMITMENT_NOT_FOUND' })
    }

    return reply.send(updated)
  } catch (error) {
    sendCapitalValidationError(reply, error)
  }
}

export const listCapitalActivityHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  let params: { partnershipId: string }
  try {
    params = capitalActivityParamsSchema.parse(request.params)
  } catch (error) {
    if (error instanceof ZodError) return sendZodError(reply, error)
    throw error
  }

  const scoped = await resolveScopedPartnership(request, params.partnershipId)
  if (scoped.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scoped.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  const rows = await capitalRepository.listCapitalActivity(params.partnershipId)
  return reply.send(rows)
}

export const createCapitalActivityHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (request.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }

  let params: { partnershipId: string }
  let body: ReturnType<typeof createCapitalActivityBodySchema.parse>
  try {
    params = capitalActivityParamsSchema.parse(request.params)
    body = createCapitalActivityBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) return sendZodError(reply, error)
    throw error
  }

  const scoped = await resolveScopedPartnership(request, params.partnershipId)
  if (scoped.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scoped.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  try {
    const created = pool
      ? await withTransaction((client) =>
          capitalRepository.createCapitalActivity(
            params.partnershipId,
            scoped.entityId,
            body,
            request.authUser!.userId,
            client,
          ),
        )
      : await capitalRepository.createCapitalActivity(
          params.partnershipId,
          scoped.entityId,
          body,
          request.authUser!.userId,
          null,
        )

    return reply.status(201).send(created)
  } catch (error) {
    console.error('[ERROR] createCapitalActivityHandler', {
      partnershipId: params.partnershipId,
      entityId: scoped.entityId,
      userId: request.authUser?.userId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    })
    sendCapitalValidationError(reply, error)
  }
}

export const updateCapitalActivityHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (request.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }

  let params: { partnershipId: string; eventId: string }
  let body: ReturnType<typeof updateCapitalActivityBodySchema.parse>
  try {
    params = capitalActivityEventParamsSchema.parse(request.params)
    body = updateCapitalActivityBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) return sendZodError(reply, error)
    throw error
  }

  const scoped = await resolveScopedPartnership(request, params.partnershipId)
  if (scoped.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scoped.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  try {
    const updated = pool
      ? await withTransaction((client) =>
          capitalRepository.updateCapitalActivity(
            params.partnershipId,
            params.eventId,
            body,
            request.authUser!.userId,
            scoped.entityId,
            client,
          ),
        )
      : await capitalRepository.updateCapitalActivity(
          params.partnershipId,
          params.eventId,
          body,
          request.authUser!.userId,
          scoped.entityId,
          null,
        )

    if (!updated) {
      return reply.status(404).send({ error: 'CAPITAL_ACTIVITY_EVENT_NOT_FOUND' })
    }

    return reply.send(updated)
  } catch (error) {
    sendCapitalValidationError(reply, error)
  }
}
