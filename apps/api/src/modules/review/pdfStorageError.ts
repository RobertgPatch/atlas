import type { FastifyReply, FastifyRequest } from 'fastify'

export const sendPdfStorageError = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
  const detail = error as { code?: string; name?: string; $metadata?: { httpStatusCode?: number } }
  if (detail.code === 'ENOENT' || detail.name === 'NoSuchKey' || detail.$metadata?.httpStatusCode === 404) {
    return reply.code(404).send({ error: 'NOT_FOUND' })
  }
  request.log.warn({ storageErrorCode: detail.code ?? detail.name ?? 'UNKNOWN',
    storageStatus: detail.$metadata?.httpStatusCode }, 'Source PDF storage request failed')
  return reply.code(503).header('Cache-Control', 'private, no-store').send({ error: 'PDF_STORAGE_UNAVAILABLE' })
}
