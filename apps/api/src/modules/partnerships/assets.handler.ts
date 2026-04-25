import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { pool, withTransaction } from '../../infra/db/client.js'
import { partnershipsRepository } from './partnerships.repository.js'
import { assetsRepository } from './assets.repository.js'
import { createPartnershipAssetBodySchema, partnershipAssetParamsSchema, partnershipAssetsParamsSchema } from './assets.zod.js'

async function getScopedPartnership(
  request: FastifyRequest,
  partnershipId: string,
): Promise<{ status: 'ok'; entityId: string } | { status: 'not-found' } | { status: 'forbidden' }> {
  const partnership = await partnershipsRepository.getPartnershipById(partnershipId, { isAdmin: true, entityIds: [] })
  if (!partnership) return { status: 'not-found' }
  const scope = request.partnershipScope!
  if (!scope.isAdmin && !scope.entityIds.includes(partnership.entity.id)) {
    return { status: 'forbidden' }
  }
  return { status: 'ok', entityId: partnership.entity.id }
}

export const listPartnershipAssetsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  let params: { partnershipId: string }
  try {
    params = partnershipAssetsParamsSchema.parse(request.params)
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })
    }
    throw error
  }

  const scopedPartnership = await getScopedPartnership(request, params.partnershipId)
  if (scopedPartnership.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scopedPartnership.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  return reply.send(await assetsRepository.listPartnershipAssets(params.partnershipId))
}

export const getPartnershipAssetHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  let params: { partnershipId: string; assetId: string }
  try {
    params = partnershipAssetParamsSchema.parse(request.params)
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })
    }
    throw error
  }

  const scopedPartnership = await getScopedPartnership(request, params.partnershipId)
  if (scopedPartnership.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scopedPartnership.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  const detail = await assetsRepository.getPartnershipAsset(params.partnershipId, params.assetId)
  if (!detail) {
    return reply.status(404).send({ error: 'PARTNERSHIP_ASSET_NOT_FOUND' })
  }

  return reply.send(detail)
}

export const createPartnershipAssetHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (request.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }

  let params: { partnershipId: string }
  let body: ReturnType<typeof createPartnershipAssetBodySchema.parse>
  try {
    params = partnershipAssetsParamsSchema.parse(request.params)
    body = createPartnershipAssetBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })
    }
    throw error
  }

  if (body.initialValuation) {
    const today = new Date().toISOString().slice(0, 10)
    if (body.initialValuation.valuationDate > today) {
      return reply.status(400).send({ error: 'FUTURE_DATE_NOT_ALLOWED' })
    }
  }

  const scopedPartnership = await getScopedPartnership(request, params.partnershipId)
  if (scopedPartnership.status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_NOT_FOUND' })
  }
  if (scopedPartnership.status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }

  const duplicate = await assetsRepository.findDuplicateAsset(params.partnershipId, body.name, body.assetType)
  if (duplicate) {
    return reply.status(409).send({ error: 'DUPLICATE_PARTNERSHIP_ASSET' })
  }

  const detail = pool
    ? await withTransaction((client) =>
        assetsRepository.createPartnershipAsset(params.partnershipId, body, request.authUser!.userId, client),
      )
    : await assetsRepository.createPartnershipAsset(params.partnershipId, body, request.authUser!.userId, null)

  return reply.status(201).send(detail)
}