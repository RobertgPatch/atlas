import type { FastifyReply, FastifyRequest } from 'fastify'
import { inviteSchema, roleChangeSchema } from '../auth/auth.schemas.js'
import { userAdminRepository } from './user-admin.repository.js'
import { invitationRepository } from './invitation.repository.js'
import { authRepository } from '../auth/auth.repository.js'
import { auditRepository } from '../audit/audit.repository.js'
import { k1Repository } from '../k1/k1.repository.js'

const asSummary = (user: ReturnType<typeof authRepository.getUserById>) => {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
  }
}

const formatActivity = (eventName: string): { action: string; detail: string } => {
  switch (eventName) {
    case 'auth.login.succeeded':
      return { action: 'Login', detail: 'Successful sign-in' }
    case 'auth.mfa.verify.succeeded':
      return { action: 'MFA Verification', detail: 'Completed MFA challenge' }
    case 'auth.mfa.enroll.succeeded':
      return { action: 'MFA Enrollment', detail: 'Enrolled a new MFA device' }
    case 'user.invited':
      return { action: 'User Invited', detail: 'Invitation issued for this account' }
    case 'user.role_changed':
      return { action: 'Role Changed', detail: 'User role was updated' }
    case 'user.deactivated':
      return { action: 'Deactivated', detail: 'Account access was disabled' }
    case 'user.reactivated':
      return { action: 'Reactivated', detail: 'Account access was restored' }
    case 'user.mfa_reset':
      return { action: 'MFA Reset', detail: 'MFA enrollment was reset' }
    case 'k1.approved':
      return { action: 'Approved K-1', detail: 'Approved a K-1 document' }
    case 'k1.finalized':
      return { action: 'Finalized K-1', detail: 'Finalized a K-1 document' }
    case 'k1.issue_opened':
      return { action: 'Opened Issue', detail: 'Flagged a K-1 issue for review' }
    case 'k1.issue_resolved':
      return { action: 'Resolved Issue', detail: 'Closed a K-1 issue' }
    default:
      return {
        action: eventName.split('.').slice(-1)[0].replace(/_/g, ' '),
        detail: eventName.replace(/[._]/g, ' '),
      }
  }
}

export const listUsersHandler = async (
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const users = userAdminRepository.listUsers().map((user) => asSummary(user))
  reply.send({ items: users })
}

export const getUserDetailHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const user = authRepository.getUserById(userId)
  if (!user) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  const assignedEntityIds = new Set(k1Repository.listEntitiesForUser(user.id))
  const assignedEntities = k1Repository
    .listEntities()
    .filter((entity) => assignedEntityIds.has(entity.id))
    .map((entity) => ({ id: entity.id, name: entity.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const activity = (await auditRepository.listRecentForUser(user.id, 12)).map((event, index) => {
    const formatted = formatActivity(event.eventName)
    return {
      id: `${event.eventName}:${event.objectId ?? index}:${event.createdAt.toISOString()}`,
      date: event.createdAt.toISOString(),
      action: formatted.action,
      detail: formatted.detail,
      eventName: event.eventName,
    }
  })

  reply.send({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnrollmentState === 'ENROLLED' && !!user.mfaSecret,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      loginCount: user.loginCount,
    },
    assignedEntities,
    activity,
  })
}

export const inviteUserHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const payload = inviteSchema.safeParse(request.body)
  if (!payload.success) {
    reply.status(400).send({ error: 'INVALID_REQUEST' })
    return
  }

  const invite = invitationRepository.create(payload.data.email, payload.data.role)
  const invitedUser = authRepository.upsertInvitedUser(payload.data.email, payload.data.role)

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.invited',
    objectType: 'user',
    objectId: invitedUser.id,
    after: {
      email: invitedUser.email,
      role: invitedUser.role,
      status: invitedUser.status,
      invitationId: invite.id,
    },
  })

  reply.status(201).send({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    status: invite.status,
  })
}

export const changeRoleHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const payload = roleChangeSchema.safeParse(request.body)
  if (!payload.success) {
    reply.status(400).send({ error: 'INVALID_REQUEST' })
    return
  }

  const before = authRepository.getUserById(userId)
  const updated = userAdminRepository.updateRole(userId, payload.data.role)
  if (!updated) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.role_changed',
    objectType: 'user',
    objectId: updated.id,
    before,
    after: updated,
  })

  reply.send(asSummary(updated))
}

export const deactivateUserHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const before = authRepository.getUserById(userId)
  const updated = userAdminRepository.deactivate(userId)
  if (!updated) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.deactivated',
    objectType: 'user',
    objectId: updated.id,
    before,
    after: updated,
  })

  reply.send(asSummary(updated))
}

export const reactivateUserHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const before = authRepository.getUserById(userId)
  const updated = userAdminRepository.reactivate(userId)
  if (!updated) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.reactivated',
    objectType: 'user',
    objectId: updated.id,
    before,
    after: updated,
  })

  reply.send(asSummary(updated))
}

export const resetMfaHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const { userId } = request.params as { userId: string }
  const before = authRepository.getUserById(userId)
  const updated = userAdminRepository.resetMfa(userId)
  if (!updated) {
    reply.status(404).send({ error: 'NOT_FOUND' })
    return
  }

  await auditRepository.record({
    actorUserId: request.authUser?.userId,
    eventName: 'user.mfa_reset',
    objectType: 'user',
    objectId: updated.id,
    before,
    after: updated,
  })

  reply.send(asSummary(updated))
}
