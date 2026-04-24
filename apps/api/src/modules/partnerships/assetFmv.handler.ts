import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { pool, withTransaction } from '../../infra/db/client.js'
import { assetsRepository } from './assets.repository.js'
import { partnershipsRepository } from './partnerships.repository.js'
import { assetFmvRepository } from './assetFmv.repository.js'
import {
  createAssetFmvSnapshotBodySchema,
  partnershipAssetParamsSchema,
} from './assets.zod.js'

async function getScopedAssetContext(
  request: FastifyRequest,
  partnershipId: string,
  assetId: string,
): Promise<'ok' | 'not-found' | 'forbidden'> {
  const partnership = await partnershipsRepository.getPartnershipById(partnershipId, { isAdmin: true, entityIds: [] })
  if (!partnership) return 'not-found'
  const scope = request.partnershipScope!
  if (!scope.isAdmin && !scope.entityIds.includes(partnership.entity.id)) {
    return 'forbidden'
  }
  const asset = await assetsRepository.getPartnershipAsset(partnershipId, assetId)
  return asset ? 'ok' : 'not-found'
}

export const listAssetFmvSnapshotsHandler = async (
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

  const status = await getScopedAssetContext(request, params.partnershipId, params.assetId)
  if (status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }
  if (status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_ASSET_NOT_FOUND' })
  }

  return reply.send(await assetFmvRepository.listAssetFmvSnapshots(params.partnershipId, params.assetId))
}

export const createAssetFmvSnapshotHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (request.authUser?.role !== 'Admin') {
    return reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
  }

  let params: { partnershipId: string; assetId: string }
  let body: ReturnType<typeof createAssetFmvSnapshotBodySchema.parse>
  try {
    params = partnershipAssetParamsSchema.parse(request.params)
    body = createAssetFmvSnapshotBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })
    }
    throw error
  }

  const today = new Date().toISOString().slice(0, 10)
  if (body.valuationDate > today) {
    return reply.status(400).send({ error: 'FUTURE_DATE_NOT_ALLOWED' })
  }

  const status = await getScopedAssetContext(request, params.partnershipId, params.assetId)
  if (status === 'forbidden') {
    return reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
  }
  if (status === 'not-found') {
    return reply.status(404).send({ error: 'PARTNERSHIP_ASSET_NOT_FOUND' })
  }

  const snapshot = pool
    ? await withTransaction((client) =>
        assetFmvRepository.createAssetFmvSnapshot(
          params.partnershipId,
          params.assetId,
          body,
          request.authUser!.userId,
          client,
        ),
      )
    : await assetFmvRepository.createAssetFmvSnapshot(
        params.partnershipId,
        params.assetId,
        body,
        request.authUser!.userId,
        null,
      )

  return reply.status(201).send(snapshot)
}