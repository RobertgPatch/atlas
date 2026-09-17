import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { auditRepository } from '../audit/audit.repository.js'
import { authRepository } from '../auth/auth.repository.js'
import { applicationLogsService } from './applicationLogs.service.js'

const logQuerySchema = z.object({
  sinceMinutes: z.coerce.number().int().min(1).max(60).default(15),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const accessAuditedAt = new Map<string, number>()
const shouldAuditLogAccess = (sessionId: string): boolean => {
  const current = Date.now()
  const previous = accessAuditedAt.get(sessionId) ?? 0
  if (current - previous < 5 * 60_000) return false
  if (accessAuditedAt.size >= 1_000) {
    const oldest = [...accessAuditedAt.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) accessAuditedAt.delete(oldest[0])
  }
  accessAuditedAt.set(sessionId, current)
  return true
}

export const listUsersHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const users = authRepository.listUsers()
    .map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      accessLevel: user.accessLevel,
      status: user.status,
      passwordChangeRequired: user.passwordChangeRequired,
      mfaEnrollmentState: user.mfaEnrollmentState,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      loginCount: user.loginCount,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))

  await auditRepository.record({
    actorUserId: request.authUser!.userId,
    eventName: 'admin.users.viewed',
    objectType: 'user_directory',
    after: { count: users.length },
  })
  reply.send({ users, checkedAt: new Date().toISOString() })
}

export const listApplicationLogsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const query = logQuerySchema.safeParse(request.query)
  if (!query.success) {
    reply.status(400).send({ error: 'INVALID_LOG_QUERY' })
    return
  }
  const result = await applicationLogsService.list(query.data)
  if (request.authSession && shouldAuditLogAccess(request.authSession.id)) {
    await auditRepository.record({
      actorUserId: request.authUser!.userId,
      eventName: 'admin.application_logs.viewed',
      objectType: 'cloudwatch_logs',
      after: {
        eventCount: result.events.length,
        failedSourceCount: result.failures.length,
        lookbackMinutes: query.data.sinceMinutes,
      },
    })
  }
  reply.send(result)
}
