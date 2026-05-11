import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { pool, withTransaction } from '../../infra/db/client.js'
import { reportsExport } from './reports.export.js'
import { reportsRepository } from './reports.repository.js'
import {
  activityDetailRowParamsSchema,
  activityDetailQuerySchema,
  assetClassSummaryQuerySchema,
  exportReportQuerySchema,
  portfolioSummaryQuerySchema,
  updateActivityDetailBodySchema,
} from './reports.zod.js'

const sendValidationError = (reply: FastifyReply, error: ZodError) =>
  reply.status(400).send({ error: 'VALIDATION_ERROR', issues: error.issues })

const sendReportsDomainError = (reply: FastifyReply, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'FORBIDDEN_ENTITY') {
    void reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
    return
  }
  if (message === 'STALE_ACTIVITY_DETAIL_UPDATE') {
    void reply.status(409).send({
      error: 'STALE_ACTIVITY_DETAIL_UPDATE',
      message: 'The row changed since this report was loaded. Refresh and try again.',
    })
    return
  }
  if (message === 'ACTIVITY_DETAIL_UNDO_NOT_AVAILABLE') {
    void reply.status(409).send({
      error: 'ACTIVITY_DETAIL_UNDO_NOT_AVAILABLE',
      message: 'No eligible undo is available for this row.',
    })
    return
  }

  throw error
}

export const getPortfolioSummaryHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  const scope = request.partnershipScope
  if (!scope) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let query: ReturnType<typeof portfolioSummaryQuerySchema.parse>
  try {
    query = portfolioSummaryQuerySchema.parse(request.query)
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  if (query.entityId && !scope.isAdmin && !scope.entityIds.includes(query.entityId)) {
    reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
    return
  }

  const result = await reportsRepository.getPortfolioSummary(query, scope)
  reply.send(result)
}

export const getAssetClassSummaryHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  const scope = request.partnershipScope
  if (!scope) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let query: ReturnType<typeof assetClassSummaryQuerySchema.parse>
  try {
    query = assetClassSummaryQuerySchema.parse(request.query)
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  if (query.entityId && !scope.isAdmin && !scope.entityIds.includes(query.entityId)) {
    reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
    return
  }

  const result = await reportsRepository.getAssetClassSummary(query, scope)
  reply.send(result)
}

export const getActivityDetailHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  const scope = request.partnershipScope
  if (!scope) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let query: ReturnType<typeof activityDetailQuerySchema.parse>
  try {
    query = activityDetailQuerySchema.parse(request.query)
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  if (query.entityId && !scope.isAdmin && !scope.entityIds.includes(query.entityId)) {
    reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
    return
  }

  const result = await reportsRepository.getActivityDetail(query, scope)
  reply.send(result)
}

export const getReportsExportHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  const scope = request.partnershipScope
  if (!scope) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let query: ReturnType<typeof exportReportQuerySchema.parse>
  try {
    query = exportReportQuerySchema.parse(request.query)
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  if (query.entityId && !scope.isAdmin && !scope.entityIds.includes(query.entityId)) {
    reply.status(403).send({ error: 'FORBIDDEN_ENTITY' })
    return
  }

  const exported = await reportsExport.generateReportExport(query, scope)

  reply
    .header('Content-Type', exported.contentType)
    .header('Content-Disposition', `attachment; filename="${exported.fileName}"`)
    .send(exported.body)
}

export const updateActivityDetailHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  if (request.authUser.role !== 'Admin') {
    reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
    return
  }

  const scope = request.partnershipScope
  if (!scope) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let params: ReturnType<typeof activityDetailRowParamsSchema.parse>
  let body: ReturnType<typeof updateActivityDetailBodySchema.parse>
  try {
    params = activityDetailRowParamsSchema.parse(request.params)
    body = updateActivityDetailBodySchema.parse(request.body)
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  try {
    const updated = pool
      ? await withTransaction((client) =>
          reportsRepository.updateActivityDetailRow(
            params.rowId,
            body,
            {
              actorUserId: request.authUser!.userId,
              scope,
            },
            client,
          ),
        )
      : await reportsRepository.updateActivityDetailRow(
          params.rowId,
          body,
          {
            actorUserId: request.authUser!.userId,
            scope,
          },
          null,
        )

    if (!updated) {
      reply.status(404).send({ error: 'ACTIVITY_DETAIL_ROW_NOT_FOUND' })
      return
    }

    reply.send(updated)
  } catch (error) {
    sendReportsDomainError(reply, error)
  }
}

export const undoActivityDetailHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!request.authUser) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  if (request.authUser.role !== 'Admin') {
    reply.status(403).send({ error: 'FORBIDDEN_ROLE' })
    return
  }

  const scope = request.partnershipScope
  if (!scope) {
    reply.status(401).send({ error: 'UNAUTHORIZED' })
    return
  }

  let params: ReturnType<typeof activityDetailRowParamsSchema.parse>
  try {
    params = activityDetailRowParamsSchema.parse(request.params)
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(reply, error)
      return
    }
    throw error
  }

  try {
    const undone = pool
      ? await withTransaction((client) =>
          reportsRepository.undoActivityDetailEdit(
            params.rowId,
            {
              actorUserId: request.authUser!.userId,
              scope,
            },
            client,
          ),
        )
      : await reportsRepository.undoActivityDetailEdit(
          params.rowId,
          {
            actorUserId: request.authUser!.userId,
            scope,
          },
          null,
        )

    if (!undone) {
      reply.status(404).send({ error: 'ACTIVITY_DETAIL_ROW_NOT_FOUND' })
      return
    }

    reply.send(undone)
  } catch (error) {
    sendReportsDomainError(reply, error)
  }
}
